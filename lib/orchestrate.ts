import { extractClaims } from './claims';
import { isSafeReadUrl } from './url';
import { CaesarClient, mapLimit, type Citation } from './caesar';
import { verifyClaim, bestSnippet, isSubjective, type Verdict } from './verify';
import { DEMO_RESPONSE } from '../fixtures/demo';

export interface ClaimResult {
  claim: string;
  verdict: Verdict;
  source?: { title: string; url: string; captureTime?: string };
  passage?: string;
  /** Receipt data below comes from the SAME citation the verdict grounded on, never a different rank. */
  score?: number;
  /** Best-effort publication date from source metadata; often absent, so displays fall back to captureTime. */
  publishedAt?: string;
  captureId?: string;
  /** Present ONLY when `passage` is a pinned Caesar passage, not a snippet fallback from read text. */
  passageId?: string;
  /**
   * Character range of the pinned passage inside the RAW captured document
   * text (receipt coordinates from Caesar's include_offsets), plus the section
   * heading it sits under when the page exposes one. Present only alongside
   * passageId, same rule as above.
   */
  passageStart?: number;
  passageEnd?: number;
  passageSection?: string;
}
export interface VerifyResponse { claims: ClaimResult[]; degraded: boolean; tier?: string; }

/**
 * One NDJSON-able event from the incremental verification engine. `claims`
 * always arrives first so a UI can render placeholders; each `claim` settles
 * independently, emitted in completion order but carrying its original index;
 * `done` closes the run. The engine never yields `error` itself: the
 * streaming route writes it when a stream dies mid-flight.
 */
export type VerifyEvent =
  | { type: 'claims'; claims: string[] }
  | { type: 'claim'; index: number; total: number; result: ClaimResult }
  | { type: 'done'; degraded: boolean; tier?: string }
  | { type: 'error'; message: string };

const RANK = { VERIFIED: 2, NEEDS_CONTEXT: 1, UNSUPPORTED: 0 } as const;
type Rankable = keyof typeof RANK;

/** Demo mode is opt-IN: only explicit truthy strings count, so VERIFIER_DEMO=0 turns it OFF. */
export function demoModeEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.VERIFIER_DEMO ?? '').trim().toLowerCase());
}

/**
 * Stream the canned demo response. Snapshot the claims getter ONCE so the
 * placeholder texts, the per-claim results, and their capture times all
 * describe the same instant.
 */
async function* demoEvents(): AsyncGenerator<VerifyEvent> {
  const canned = DEMO_RESPONSE.claims;
  yield { type: 'claims', claims: canned.map((c) => c.claim) };
  for (let index = 0; index < canned.length; index++) {
    yield { type: 'claim', index, total: canned.length, result: canned[index] };
  }
  yield { type: 'done', degraded: DEMO_RESPONSE.degraded };
}

/**
 * Incremental engine behind both /api/verify routes. Yields the same data
 * runVerification() assembles, one event at a time: the fallback paths (demo
 * mode, extraction failure, every claim failing) stream the canned response
 * by REPLACING the claim set with a fresh `claims` event.
 */
export async function* runVerificationEvents(
  input: string,
  deps: { client?: CaesarClient } = {},
): AsyncGenerator<VerifyEvent> {
  if (demoModeEnabled()) {
    yield* demoEvents();
    return;
  }
  const client = deps.client ?? new CaesarClient();
  let claims: string[];
  try {
    // If the input is a bare URL, read the page with Caesar and pull claims from
    // the captured text — otherwise we'd just search the URL string itself.
    const raw = input.trim();
    let toAnalyze = raw;
    if (isSafeReadUrl(raw)) {
      try {
        const doc = await client.read(raw, { maxChars: 12000 }); // no query -> SDK reads the full document
        if (doc.text && doc.text.trim()) toAnalyze = doc.text;
      } catch { /* page unreadable — fall back to treating the URL as the query */ }
    }
    claims = (await extractClaims(toAnalyze)).slice(0, 6);
  } catch {
    yield* demoEvents(); // extraction failed outright: stream the canned response instead
    return;
  }

  yield { type: 'claims', claims };
  if (claims.length === 0) {
    yield { type: 'done', degraded: false };
    return;
  }

  // Per-claim isolation: one throttled claim must not throw away the others'
  // completed verdicts. Concurrency 2 (x3 reads inside searchAndRead) keeps the
  // burst small enough that we don't self-induce the 429s in the first place.
  // Workers push settled slots into a queue (yield cannot cross a callback
  // boundary), so verdicts stream out in completion order while each event
  // still carries its original index.
  let tier: string | undefined;
  const queue: { index: number; result: ClaimResult | null }[] = [];
  let wake: (() => void) | null = null;
  const running = mapLimit(claims.map((claim, index) => ({ claim, index })), 2, async ({ claim, index }) => {
    let result: ClaimResult | null = null;
    try {
      const one = await verifyOneClaim(claim, client);
      if (one.tier) tier = one.tier; // same account for every claim, any response can report it
      result = one.result;
    } catch {
      result = null; // this claim failed (rate limit / timeout); keep the rest
    }
    queue.push({ index, result });
    wake?.();
    wake = null;
  });

  const results: (ClaimResult | null)[] = new Array(claims.length).fill(null);
  for (let settledCount = 0; settledCount < claims.length; settledCount++) {
    while (queue.length === 0) {
      await new Promise<void>((resolve) => { wake = resolve; });
    }
    const { index, result } = queue.shift()!;
    if (result) {
      results[index] = result;
      yield { type: 'claim', index, total: claims.length, result };
    }
  }
  await running; // every worker already pushed; this only surfaces unexpected rejections

  const succeeded = results.filter((r): r is ClaimResult => r !== null);
  if (succeeded.length === 0) {
    yield* demoEvents(); // every claim failed: stream the canned response instead
    return;
  }
  yield { type: 'done', degraded: succeeded.length < claims.length, ...(tier ? { tier } : {}) };
}

export async function runVerification(
  input: string,
  deps: { client?: CaesarClient } = {},
): Promise<VerifyResponse> {
  // Return the shared fixture BY REFERENCE in demo mode, exactly as before:
  // callers (and tests) compare against DEMO_RESPONSE itself.
  if (demoModeEnabled()) return DEMO_RESPONSE;
  try {
    let slots: (ClaimResult | null)[] = [];
    let degraded = false;
    let tier: string | undefined;
    for await (const event of runVerificationEvents(input, deps)) {
      if (event.type === 'claims') {
        // A later `claims` event replaces the set wholesale (canned fallback).
        slots = new Array<ClaimResult | null>(event.claims.length).fill(null);
      } else if (event.type === 'claim') {
        slots[event.index] = event.result;
      } else if (event.type === 'done') {
        degraded = event.degraded;
        tier = event.tier;
      }
    }
    const claims = slots.filter((r): r is ClaimResult => r !== null);
    return { claims, degraded, ...(tier ? { tier } : {}) };
  } catch {
    return DEMO_RESPONSE; // the engine itself failed: same canned fallback as before
  }
}

/**
 * Receipt fields off the citation a verdict grounded on. passageId is kept
 * only when the displayed quote IS the pinned Caesar passage: a snippet
 * fallback from read text must not masquerade as passage provenance.
 */
function receiptOf(
  c: Citation,
): Pick<ClaimResult, 'score' | 'publishedAt' | 'captureId' | 'passageId' | 'passageStart' | 'passageEnd' | 'passageSection'> {
  const pinned = Boolean(c.passage && c.passageId);
  return {
    ...(c.score != null ? { score: c.score } : {}),
    ...(c.publishedAt ? { publishedAt: c.publishedAt } : {}),
    ...(c.captureId ? { captureId: c.captureId } : {}),
    ...(pinned ? { passageId: c.passageId } : {}),
    // Offsets and section ride only with a pinned passage: a snippet fallback
    // has no capture coordinates to claim.
    ...(pinned && c.passageStart != null ? { passageStart: c.passageStart } : {}),
    ...(pinned && c.passageEnd != null ? { passageEnd: c.passageEnd } : {}),
    ...(pinned && c.passageSection ? { passageSection: c.passageSection } : {}),
  };
}

/** The displayed quote was a real pinned passage: tell Caesar it earned its rank (fire-and-forget). */
function reportPassageUsed(client: CaesarClient, searchId: string | undefined, c: Citation | undefined): void {
  if (!c?.passage || !c.passageId) return; // quote fell back to a text snippet: nothing honest to report
  client.sendFeedback({ eventType: 'passage_used', searchId, docId: c.docId, passageId: c.passageId, rank: c.rank });
}

async function verifyOneClaim(claim: string, client: CaesarClient): Promise<{ result: ClaimResult; tier?: string }> {
  const { citations, searchId, tier } = await client.searchAndRead(claim, { readTopN: 3 });

  // Subjective/comparative claims are opinions, not checkable facts — label
  // them OPINION and attach the most relevant source as related reading.
  if (isSubjective(claim)) {
    const c = citations.find((x) => x.passage || x.text) ?? citations[0];
    reportPassageUsed(client, searchId, c);
    return {
      result: {
        claim,
        verdict: 'OPINION',
        source: c ? { title: c.title, url: c.canonicalUrl, captureTime: c.captureTime } : undefined,
        passage: c ? (c.passage ?? bestSnippet(c.text ?? '', claim)) : undefined,
        ...(c ? receiptOf(c) : {}),
      },
      tier,
    };
  }

  // Start from the best-evidenced citation so an UNSUPPORTED verdict still shows
  // WHAT was checked (source + passage) — a bare pill with no receipt would
  // contradict the whole "here's the captured evidence" premise.
  const checked = citations.find((x) => x.text?.trim() || x.passage);
  let grounded: Citation | undefined = checked;
  let best: ClaimResult = {
    claim,
    verdict: 'UNSUPPORTED',
    ...(checked ? {
      source: { title: checked.title, url: checked.canonicalUrl, captureTime: checked.captureTime },
      passage: checked.passage ?? bestSnippet(checked.text ?? '', claim),
      ...receiptOf(checked),
    } : {}),
  };
  for (const c of citations) {
    // Ground on the full read text, but fall back to the structured passage
    // when text is empty ('' is not nullish, so `??` alone would mask it).
    const evidence = c.text?.trim() ? c.text : (c.passage ?? '');
    const { verdict } = verifyClaim({ claim, passage: evidence });
    if (RANK[verdict] > RANK[best.verdict as Rankable]) {
      grounded = c;
      best = {
        claim,
        verdict,
        source: { title: c.title, url: c.canonicalUrl, captureTime: c.captureTime },
        passage: c.passage ?? bestSnippet(c.text ?? '', claim),
        ...receiptOf(c),
      };
    }
  }
  reportPassageUsed(client, searchId, grounded);
  return { result: best, tier };
}

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
}
export interface VerifyResponse { claims: ClaimResult[]; degraded: boolean; tier?: string; }

const RANK = { VERIFIED: 2, NEEDS_CONTEXT: 1, UNSUPPORTED: 0 } as const;
type Rankable = keyof typeof RANK;

/** Demo mode is opt-IN: only explicit truthy strings count, so VERIFIER_DEMO=0 turns it OFF. */
export function demoModeEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.VERIFIER_DEMO ?? '').trim().toLowerCase());
}

export async function runVerification(
  input: string,
  deps: { client?: CaesarClient } = {},
): Promise<VerifyResponse> {
  if (demoModeEnabled()) return DEMO_RESPONSE;
  const client = deps.client ?? new CaesarClient();
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
    const claims = (await extractClaims(toAnalyze)).slice(0, 6);
    if (claims.length === 0) return { claims: [], degraded: false };
    // Per-claim isolation: one throttled claim must not throw away the others'
    // completed verdicts. Concurrency 2 (x3 reads inside searchAndRead) keeps the
    // burst small enough that we don't self-induce the 429s in the first place.
    let tier: string | undefined;
    const settled = await mapLimit(claims, 2, async (claim): Promise<ClaimResult | null> => {
      try {
        const one = await verifyOneClaim(claim, client);
        if (one.tier) tier = one.tier; // same account for every claim, any response can report it
        return one.result;
      } catch {
        return null; // this claim failed (rate limit / timeout); keep the rest
      }
    });
    const results = settled.filter((r): r is ClaimResult => r !== null);
    if (results.length === 0 && claims.length > 0) return DEMO_RESPONSE;
    return { claims: results, degraded: results.length < claims.length, ...(tier ? { tier } : {}) };
  } catch {
    return DEMO_RESPONSE;
  }
}

/**
 * Receipt fields off the citation a verdict grounded on. passageId is kept
 * only when the displayed quote IS the pinned Caesar passage: a snippet
 * fallback from read text must not masquerade as passage provenance.
 */
function receiptOf(c: Citation): Pick<ClaimResult, 'score' | 'publishedAt' | 'captureId' | 'passageId'> {
  return {
    ...(c.score != null ? { score: c.score } : {}),
    ...(c.publishedAt ? { publishedAt: c.publishedAt } : {}),
    ...(c.captureId ? { captureId: c.captureId } : {}),
    ...(c.passage && c.passageId ? { passageId: c.passageId } : {}),
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

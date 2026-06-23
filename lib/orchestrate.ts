import { extractClaims } from './claims';
import { isSafeReadUrl } from './url';
import { CaesarClient } from './caesar';
import { verifyClaim, bestSnippet, isSubjective, type Verdict } from './verify';
import { DEMO_RESPONSE } from '../fixtures/demo';

export interface ClaimResult {
  claim: string;
  verdict: Verdict;
  source?: { title: string; url: string; captureTime?: string };
  passage?: string;
}
export interface VerifyResponse { claims: ClaimResult[]; degraded: boolean; }

const RANK = { VERIFIED: 2, NEEDS_CONTEXT: 1, UNSUPPORTED: 0 } as const;
type Rankable = keyof typeof RANK;

export async function runVerification(
  input: string,
  deps: { client?: CaesarClient } = {},
): Promise<VerifyResponse> {
  if (process.env.VERIFIER_DEMO) return DEMO_RESPONSE;
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
    const results = await Promise.all(claims.map(async (claim): Promise<ClaimResult> => {
      const { citations } = await client.searchAndRead(claim, { readTopN: 3 });

      // Subjective/comparative claims are opinions, not checkable facts — label
      // them OPINION and attach the most relevant source as related reading.
      if (isSubjective(claim)) {
        const c = citations.find((x) => x.passage || x.text) ?? citations[0];
        return {
          claim,
          verdict: 'OPINION',
          source: c ? { title: c.title, url: c.canonicalUrl, captureTime: c.captureTime } : undefined,
          passage: c ? (c.passage ?? bestSnippet(c.text ?? '', claim)) : undefined,
        };
      }

      let best: ClaimResult = { claim, verdict: 'UNSUPPORTED' };
      for (const c of citations) {
        // Ground on the full read text, but fall back to the structured passage
        // when text is empty ('' is not nullish, so `??` alone would mask it).
        const evidence = c.text?.trim() ? c.text : (c.passage ?? '');
        const { verdict } = verifyClaim({ claim, passage: evidence });
        if (RANK[verdict] > RANK[best.verdict as Rankable]) {
          best = {
            claim,
            verdict,
            source: { title: c.title, url: c.canonicalUrl, captureTime: c.captureTime },
            passage: c.passage ?? bestSnippet(c.text ?? '', claim),
          };
        }
      }
      return best;
    }));
    return { claims: results, degraded: false };
  } catch {
    return DEMO_RESPONSE;
  }
}

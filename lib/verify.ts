export type Verdict = 'VERIFIED' | 'UNSUPPORTED' | 'NEEDS_CONTEXT' | 'OPINION';
export interface VerifyResult { verdict: 'VERIFIED' | 'UNSUPPORTED' | 'NEEDS_CONTEXT'; matchedTerms: string[]; }

const STOPWORDS = new Set([
  'the','a','an','of','to','in','on','and','or','is','are','was','were','be','by','for','with',
  'at','as','that','this','it','its','from','has','have','had','first','time',
]);

export function keyTerms(claim: string): string[] {
  return (claim.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [])
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Standalone numbers/dates/money/percentages the claim asserts. */
export function claimNumbers(claim: string): string[] {
  return [...claim.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)].map((m) => m[0]);
}

/** ALL-CAPS acronyms — entity anchors (NIF, GPT, FIFA). */
export function claimAcronyms(claim: string): string[] {
  return [...claim.matchAll(/\b[A-Z]{2,}\b/g)].map((m) => m[0]);
}

/**
 * Subjective / comparative claims are opinions, not checkable facts. "X is
 * better than Y" and "Y is better than X" can't both be VERIFIED off the same
 * tweet — so we never verify them; runVerification labels them OPINION.
 * (Measurable superlatives like "tallest/largest/fastest" are NOT flagged.)
 */
const SUBJECTIVE = /\b(better|worse|best|worst|greatest|superior|inferior|overrated|underrated|finest|prettier|prettiest|smarter|smartest|coolest|favou?rite)\b/i;
export function isSubjective(claim: string): boolean {
  return SUBJECTIVE.test(claim);
}

export function cleanMarkdown(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*>+\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentences(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+/).map(cleanMarkdown).filter((s) => s.length > 15);
}
function has(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Sentence-level grounding. A claim is VERIFIED only if a SINGLE sentence
 * carries most of its key terms AND every number/date it asserts (or, with no
 * numbers, an entity acronym). So "GPT-4 released in 2019" can't pass just
 * because "2019" appears somewhere else on the page.
 */
export function verifyClaim({ claim, passage }: { claim: string; passage: string | null | undefined }): VerifyResult {
  if (!passage) return { verdict: 'UNSUPPORTED', matchedTerms: [] };
  const terms = keyTerms(claim);
  const numbers = claimNumbers(claim);
  const acronyms = claimAcronyms(claim);
  let bestCov = 0;
  let bestMatched: string[] = [];
  let verified = false;
  for (const s of sentences(passage)) {
    const matched = terms.filter((t) => has(s, t));
    const cov = terms.length ? matched.length / terms.length : 0;
    if (cov > bestCov) { bestCov = cov; bestMatched = matched; }
    if (cov >= 0.6) {
      const numbersOk = numbers.length > 0 && numbers.every((n) => has(s, n));
      const acronymOk = acronyms.some((a) => s.includes(a));
      if (numbersOk || (numbers.length === 0 && acronymOk)) verified = true;
    }
  }
  if (verified) return { verdict: 'VERIFIED', matchedTerms: bestMatched };
  if (bestCov >= 0.6) return { verdict: 'NEEDS_CONTEXT', matchedTerms: bestMatched };
  return { verdict: 'UNSUPPORTED', matchedTerms: bestMatched };
}

/** Most claim-relevant sentence from a read's text, cleaned for display. */
export function bestSnippet(text: string, claim: string, maxLen = 280): string | undefined {
  if (!text) return undefined;
  const terms = keyTerms(claim);
  const anchors = [...claimNumbers(claim), ...claimAcronyms(claim)];
  let best = '';
  let bestScore = 0;
  for (const s of sentences(text)) {
    const lc = s.toLowerCase();
    let score = terms.filter((t) => lc.includes(t)).length;
    if (anchors.some((a) => lc.includes(a.toLowerCase()))) score += 3;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (bestScore === 0) return undefined;
  return best.length > maxLen ? best.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : best;
}

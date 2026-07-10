import type { Citation } from './caesar';
import { relativeTime } from './time';

/**
 * Deterministic, evidence-grounded summarization for the research briefing.
 *
 * Caesar's read() can return content.text with NO structured passages, so we
 * score and extract sentences from the FULL read text (citation.text), never
 * relying on citation.passage alone.
 *
 * The snippet scorer is ported from caesar-verifier/lib/verify.ts (bestSnippet):
 * key terms drive overlap, "hard tokens" (numbers/dates/acronyms) are weighted.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'by',
  'for', 'with', 'at', 'as', 'that', 'this', 'it', 'its', 'from', 'has', 'have', 'had', 'first',
  'time', 'what', 'who', 'when', 'where', 'why', 'how', 'which', 'did', 'do', 'does', 'will',
  'would', 'can', 'could', 'about', 'into', 'than', 'then', 'there', 'their',
]);

export function keyTerms(question: string): string[] {
  return (question.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [])
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * "Hard" tokens are SPECIFIC evidence a sentence echoes: numbers/dates/money/
 * percentages and ALL-CAPS acronyms. Weighted heavily so figures surface.
 */
export function hardTokens(question: string): string[] {
  const tokens: string[] = [];
  for (const m of question.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)) tokens.push(m[0]);
  for (const m of question.matchAll(/\b[A-Z]{2,}\b/g)) tokens.push(m[0]);
  return tokens;
}

/** Strip common markdown noise so an extracted sentence reads clean. */
export function cleanMarkdown(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // images/links -> text
    .replace(/[*_`~]+/g, '')                   // bold/italic/code/strike marks
    .replace(/^\s*#{1,6}\s*/, '')              // leading heading hashes
    .replace(/^\s*>+\s*/, '')                  // blockquote marker
    .replace(/^\s*[-*+]\s+/, '')               // list bullet
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ScoredSentence {
  text: string;
  score: number;
  rank: number; // source rank this sentence came from
}

/** Reject JSON / metadata / code-looking fragments so they never become a bullet. */
export function isProse(s: string): boolean {
  const t = s.trim();
  if (/^[{[]/.test(t)) return false;                                  // starts like JSON / an array
  if (/[{}]/.test(t) && /["'][\w $.-]+["']\s*:/.test(t)) return false; // inline object with "key": pairs
  if ((t.match(/[a-zA-Z ]/g) ?? []).length < t.length * 0.55) return false; // mostly symbols / digits
  return true;
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/) // line breaks AND sentence ends
    .map(cleanMarkdown)
    .filter((s) => s.length > 25 && s.length < 400 && isProse(s));
}

/** Score a single sentence against the question's terms (bestSnippet scorer). */
export function scoreSentence(sentence: string, terms: string[], hards: string[]): number {
  const lc = sentence.toLowerCase();
  let score = terms.filter((t) => lc.includes(t)).length;
  if (hards.some((h) => lc.includes(h.toLowerCase()))) score += 3;
  return score;
}

/** Pick the single most relevant sentence from one read's text, cleaned for display. */
export function bestSnippet(text: string, question: string, maxLen = 280): string | undefined {
  if (!text) return undefined;
  const terms = keyTerms(question);
  const hards = hardTokens(question);
  let best = '';
  let bestScore = 0;
  for (const s of splitSentences(text)) {
    const score = scoreSentence(s, terms, hards);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (bestScore === 0) return undefined;
  return best.length > maxLen ? best.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : best;
}

/** One summary bullet, stamped with the source it was extracted from. */
export interface SummaryItem {
  text: string;
  /**
   * 1-based position of the origin citation among the READ ones: the same
   * numbering formatSources produces, so an inline [n] always points at
   * source [n] in the Sources list.
   */
  sourceIndex: number;
}

/** A citation counts as read when it has capture provenance or read text. */
function wasRead(c: Citation): boolean {
  return Boolean(c.captureTime) || Boolean(c.text && c.text.trim());
}

/**
 * Build a deterministic, evidence-grounded summary: extract the most relevant
 * sentences ACROSS all read texts (not just the top one), de-duplicate, and
 * return the strongest few, each stamped with its origin source. Only READ
 * citations may yield bullets: they are the ones formatSources numbers, so a
 * sourceIndex here can never dangle.
 */
export function summarize(citations: Citation[], question: string, maxSentences = 4): SummaryItem[] {
  const terms = keyTerms(question);
  const hards = hardTokens(question);
  const scored: (ScoredSentence & { sourceIndex: number })[] = [];
  const seen = new Set<string>();

  const read = citations.filter(wasRead);
  for (let i = 0; i < read.length; i++) {
    const c = read[i];
    const body = c.text && c.text.length > 200 ? c.text : c.passage ?? '';
    if (!body) continue;
    for (const s of splitSentences(body)) {
      const key = s.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80);
      if (seen.has(key)) continue;
      const score = scoreSentence(s, terms, hards);
      if (score <= 0) continue;
      seen.add(key);
      scored.push({
        text: s.length > 280 ? s.slice(0, 280).replace(/\s+\S*$/, '') + '…' : s,
        score,
        rank: c.rank,
        sourceIndex: i + 1,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.rank - b.rank);
  return scored.slice(0, maxSentences).map((s) => ({ text: s.text, sourceIndex: s.sourceIndex }));
}

export interface SourceLine {
  index: number;
  title: string;
  url: string;
  capturedISO?: string;
  /** Best-effort page publish time from Caesar; absent on many pages. */
  publishedAt?: string;
}

/**
 * Format the numbered Sources list. Only includes sources actually READ —
 * searchAndRead emits a citation for every search hit but reads only the top N,
 * so we drop search-only results (no captureTime and no text) and renumber from 1.
 */
export function formatSources(citations: Citation[]): SourceLine[] {
  return citations
    .filter(wasRead)
    .map((c, i) => ({
      index: i + 1,
      title: (c.title || c.canonicalUrl || 'Untitled').trim(),
      url: c.canonicalUrl,
      capturedISO: c.captureTime,
      publishedAt: c.publishedAt,
    }));
}

/**
 * Receipt stat line shown under a briefing: "<N> sources read · newest capture
 * <relative>". The newest-capture clause comes from real capturedISO values and
 * is omitted entirely when none parse: the receipt never fabricates a time.
 * Returns undefined when nothing was read.
 */
export function receiptLine(sources: { capturedISO?: string }[], now: number = Date.now()): string | undefined {
  if (sources.length === 0) return undefined;
  const label = `${sources.length} ${sources.length === 1 ? 'source' : 'sources'} read`;
  let newest = -Infinity;
  for (const s of sources) {
    const t = s.capturedISO ? Date.parse(s.capturedISO) : NaN;
    if (!Number.isNaN(t) && t > newest) newest = t;
  }
  if (newest === -Infinity) return label;
  const rel = relativeTime(new Date(newest).toISOString(), now);
  return rel ? `${label} · newest capture ${rel}` : label;
}

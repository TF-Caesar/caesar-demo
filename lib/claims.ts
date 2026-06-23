export interface ExtractOptions { llmKey?: string; maxClaims?: number; }

/** True only when the whole input is a single bare http(s) URL (no surrounding prose). */
export function isUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  return /^https?:\/\/\S+$/i.test(t);
}

// Split on sentence-ending punctuation + space. Lookahead allows a lowercase
// next-sentence start so poorly-capitalized fluff (".. 2025. nice.") still splits.
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Za-z0-9"'])/;

export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').trim().split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
}

/** Strip markdown noise (images, links, marks) from a claim pulled out of a page. */
function cleanClaimText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')    // images removed entirely
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links -> their text
    .replace(/[*_`~#>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksFactual(sentence: string): boolean {
  const longEnough = sentence.split(/\s+/).length >= 4;
  const hasNumber = /\d/.test(sentence);
  const hasProperNoun = /\b[A-Z][a-zA-Z]{2,}\b/.test(sentence.slice(1));
  return longEnough && (hasNumber || hasProperNoun);
}

export function extractClaimsDeterministic(text: string, maxClaims = 8): string[] {
  const single = text.trim();
  if (!single) return [];
  const sentences = splitSentences(single).map(cleanClaimText).filter(Boolean);
  if (sentences.length <= 1) return sentences.length ? [sentences[0]] : [];
  return sentences.filter(looksFactual).slice(0, maxClaims);
}

async function extractClaimsLlm(text: string, apiKey: string, maxClaims: number): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000), // bound the outbound call so a hung upstream can't pin the route
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Extract up to ${maxClaims} atomic, checkable factual claims from the text. ` +
          `Return ONLY a JSON array of strings, no prose.\n\nTEXT:\n${text}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data: any = await res.json();
  const raw = data?.content?.[0]?.text ?? '[]';
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('bad shape');
  return parsed.filter((s) => typeof s === 'string').slice(0, maxClaims);
}

export async function extractClaims(text: string, options: ExtractOptions = {}): Promise<string[]> {
  const llmKey = options.llmKey ?? process.env.CLAIMS_LLM_KEY;
  const maxClaims = options.maxClaims ?? 8;
  if (llmKey) {
    try { return await extractClaimsLlm(text, llmKey, maxClaims); } catch { /* fall back */ }
  }
  return extractClaimsDeterministic(text, maxClaims);
}

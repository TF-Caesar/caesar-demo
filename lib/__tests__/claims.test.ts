import { describe, it, expect } from 'vitest';
import { splitSentences, extractClaimsDeterministic, extractClaims, isUrl } from '../claims';

describe('isUrl', () => {
  it('detects a bare http(s) URL, ignoring surrounding whitespace', () => {
    expect(isUrl('https://example.com/article')).toBe(true);
    expect(isUrl('  http://llnl.gov/news/nif  ')).toBe(true);
  });
  it('is false for prose, even prose that contains a URL', () => {
    expect(isUrl('Tesla delivered 1.8 million cars in 2023')).toBe(false);
    expect(isUrl('see https://example.com for details')).toBe(false);
    expect(isUrl('example.com')).toBe(false);
  });
});

describe('splitSentences', () => {
  it('splits on sentence boundaries', () => {
    expect(splitSentences('A is true. B happened in 2022. C?')).toHaveLength(3);
  });
});

describe('extractClaimsDeterministic', () => {
  it('keeps factual sentences, drops fluff', () => {
    const claims = extractClaimsDeterministic('I think this is great. Tesla delivered 1.8 million cars in 2023. Wow, amazing.');
    expect(claims).toContain('Tesla delivered 1.8 million cars in 2023.');
    expect(claims.some((c) => c.startsWith('Wow'))).toBe(false);
  });
  it('returns a single short claim unchanged', () => {
    expect(extractClaimsDeterministic('NIF achieved ignition in 2022')).toEqual(['NIF achieved ignition in 2022']);
  });
});

describe('extractClaimsDeterministic markdown handling', () => {
  it('strips link markdown from claims pulled out of a page', () => {
    const page = 'The 2022 final was played at [Lusail Stadium](https://en.wikipedia.org/wiki/Lusail) near Doha. A record 1.5 billion people watched it on television worldwide.';
    const claims = extractClaimsDeterministic(page);
    expect(claims.join(' ')).not.toMatch(/\]\(http/);
    expect(claims.some((c) => c.includes('Lusail Stadium') && !c.includes('http'))).toBe(true);
  });
  it('removes inline image refs that would otherwise pollute a claim', () => {
    const page = 'The 2022 FIFA World Cup final![Image 1](https://upload.wikimedia.org/x.png) was contested by Argentina and France in Qatar.';
    const claims = extractClaimsDeterministic(page);
    expect(claims.join(' ')).not.toMatch(/Image 1|\.png|upload\.wikimedia|!\[/);
    expect(claims.some((c) => c.includes('Argentina and France'))).toBe(true);
  });
});

describe('extractClaims', () => {
  it('uses deterministic extraction when no llm key is provided', async () => {
    const claims = await extractClaims('OpenAI released GPT-5 in 2025. nice.', {});
    expect(claims).toContain('OpenAI released GPT-5 in 2025.');
  });
});

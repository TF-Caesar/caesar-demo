import { describe, it, expect } from 'vitest';
import { splitSentences, extractClaimsDeterministic, extractClaims } from '../claims';

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

describe('extractClaims', () => {
  it('uses deterministic extraction when no llm key is provided', async () => {
    const claims = await extractClaims('OpenAI released GPT-5 in 2025. nice.', {});
    expect(claims).toContain('OpenAI released GPT-5 in 2025.');
  });
});

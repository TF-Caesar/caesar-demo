import { describe, it, expect } from 'vitest';
import { verifyClaim, hardTokens } from '../verify';

describe('hardTokens', () => {
  it('pulls numbers and proper nouns', () => {
    const t = hardTokens('NIF achieved ignition in 2022 with 192 lasers');
    expect(t).toContain('2022');
    expect(t).toContain('192');
    expect(t).toContain('NIF');
  });
});

describe('verifyClaim', () => {
  const claim = 'The National Ignition Facility achieved fusion ignition in 2022';
  it('VERIFIED when terms + a hard token appear in the passage', () => {
    const passage = 'On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time.';
    expect(verifyClaim({ claim, passage }).verdict).toBe('VERIFIED');
  });
  it('NEEDS_CONTEXT when terms match but the hard token is absent', () => {
    const passage = 'The National Ignition Facility works on fusion ignition research at Livermore.';
    expect(verifyClaim({ claim, passage }).verdict).toBe('NEEDS_CONTEXT');
  });
  it('UNSUPPORTED when unrelated', () => {
    expect(verifyClaim({ claim, passage: 'Tokamaks use magnetic confinement to contain plasma.' }).verdict).toBe('UNSUPPORTED');
  });
  it('UNSUPPORTED when no passage', () => {
    expect(verifyClaim({ claim, passage: null }).verdict).toBe('UNSUPPORTED');
  });
});

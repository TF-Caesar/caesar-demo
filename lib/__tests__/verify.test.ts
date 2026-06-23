import { describe, it, expect } from 'vitest';
import { verifyClaim, isSubjective, claimNumbers } from '../verify';

describe('isSubjective', () => {
  it('flags comparative/opinion claims', () => {
    expect(isSubjective('Python is better than JavaScript')).toBe(true);
    expect(isSubjective('Deerflow 2.0 is better than Hermes and OpenClaw')).toBe(true);
    expect(isSubjective('Lionel Messi is the greatest footballer of all time')).toBe(true);
  });
  it('does not flag factual claims or proper nouns containing "great"', () => {
    expect(isSubjective('The Great Wall of China is over 21000 km long')).toBe(false);
    expect(isSubjective('Mount Everest is the tallest mountain on Earth')).toBe(false);
    expect(isSubjective('The 2022 FIFA World Cup was held in Qatar')).toBe(false);
  });
  it('does not flag brand/proper-noun names or measurable compounds that contain a comparative word', () => {
    expect(isSubjective('Best Buy reported $46.3 billion in revenue in 2024')).toBe(false);
    expect(isSubjective('Tesla was the best-selling EV brand in 2023')).toBe(false);
    expect(isSubjective('The Best Picture winner in 2020 was Parasite')).toBe(false);
  });
  it('still flags a genuine "the best/worst" opinion', () => {
    expect(isSubjective('VS Code is the best editor')).toBe(true);
    expect(isSubjective('That sequel was the worst movie of the year')).toBe(true);
  });
});

describe('claimNumbers', () => {
  it('pulls the numbers/dates a claim asserts', () => {
    expect(claimNumbers('GPT-4 released in 2019')).toEqual(['4', '2019']);
    expect(claimNumbers('The Eiffel Tower is 450 metres tall')).toEqual(['450']);
  });
});

describe('verifyClaim (sentence-level)', () => {
  const nif = 'The National Ignition Facility achieved fusion ignition in 2022';
  it('VERIFIED when one sentence has the terms AND the asserted number', () => {
    const passage = 'On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time.';
    expect(verifyClaim({ claim: nif, passage }).verdict).toBe('VERIFIED');
  });
  it('does NOT verify a wrong date even if the number appears elsewhere on the page', () => {
    const passage = 'GPT-4 was released by OpenAI in March 2023.\nGPT-2 had been released back in 2019.';
    expect(verifyClaim({ claim: 'GPT-4 released in 2019', passage }).verdict).not.toBe('VERIFIED');
  });
  it('NEEDS_CONTEXT when terms match but the asserted number is absent', () => {
    const passage = 'The National Ignition Facility works on fusion ignition research at Livermore.';
    expect(verifyClaim({ claim: nif, passage }).verdict).toBe('NEEDS_CONTEXT');
  });
  it('UNSUPPORTED when unrelated', () => {
    expect(verifyClaim({ claim: nif, passage: 'Tokamaks use magnetic confinement to contain plasma.' }).verdict).toBe('UNSUPPORTED');
  });
  it('UNSUPPORTED when no passage', () => {
    expect(verifyClaim({ claim: nif, passage: null }).verdict).toBe('UNSUPPORTED');
  });
});

import type { VerifyResponse } from '../lib/orchestrate';

export const DEMO_EXAMPLES: { label: string; input: string }[] = [
  { label: 'Fusion ignition', input: 'The National Ignition Facility achieved fusion ignition in 2022.' },
  { label: 'GPT-4 release', input: 'OpenAI released GPT-4 in March 2023.' },
];

// Shown when the free tier is busy (and in VERIFIER_DEMO mode). Covers all three verdicts.
export const DEMO_RESPONSE: VerifyResponse = {
  degraded: true,
  claims: [
    {
      claim: 'The National Ignition Facility achieved fusion ignition in 2022.',
      verdict: 'VERIFIED',
      source: { title: 'NIF Achieves Fusion Ignition', url: 'https://www.llnl.gov/news/', captureTime: '2026-06-21T14:03:00Z' },
      passage: 'On December 5, 2022, the National Ignition Facility achieved fusion ignition for the first time, producing more energy from fusion than the laser energy used to drive it.',
    },
    {
      claim: 'OpenAI released GPT-4 in March 2023.',
      verdict: 'NEEDS_CONTEXT',
      source: { title: 'Introducing GPT-4', url: 'https://openai.com/index/gpt-4-research/', captureTime: '2026-06-21T14:05:00Z' },
      passage: 'OpenAI announced GPT-4, its most capable model to date, in 2023.',
    },
    {
      claim: 'The Eiffel Tower is 450 metres tall.',
      verdict: 'UNSUPPORTED',
      source: { title: 'Eiffel Tower — key facts', url: 'https://www.toureiffel.paris/en', captureTime: '2026-06-21T14:06:00Z' },
      passage: 'The Eiffel Tower stands approximately 330 metres tall including antennas.',
    },
  ],
};

import type { ClaimResult, VerifyResponse } from '../lib/orchestrate';

export const DEMO_EXAMPLES: { label: string; input: string }[] = [
  { label: 'Fusion ignition', input: 'The National Ignition Facility achieved fusion ignition in 2022.' },
  { label: 'GPT-4 release', input: 'OpenAI released GPT-4 in March 2023.' },
];

// Shown when live search is unavailable (and in VERIFIER_DEMO mode). Covers all three verdicts.
// Demo capture times are relative so the fallback never displays months-old
// "freshness": the verdicts are canned, and a stale timestamp would undercut
// the whole "captured at a moment" premise. `claims` is a getter (not a
// baked array) so the times stay fresh per request on a long-running server.
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const DEMO_RESPONSE: VerifyResponse = {
  degraded: true,
  get claims(): ClaimResult[] {
    return [
      {
        claim: 'The National Ignition Facility achieved fusion ignition in 2022.',
        verdict: 'VERIFIED',
        source: { title: 'NIF Achieves Fusion Ignition', url: 'https://www.llnl.gov/news/', captureTime: minutesAgo(23) },
        passage: 'On December 5, 2022, the National Ignition Facility achieved fusion ignition for the first time, producing more energy from fusion than the laser energy used to drive it.',
      },
      {
        claim: 'OpenAI released GPT-4 in March 2023.',
        verdict: 'NEEDS_CONTEXT',
        source: { title: 'Introducing GPT-4', url: 'https://openai.com/index/gpt-4-research/', captureTime: minutesAgo(21) },
        passage: 'OpenAI announced GPT-4, its most capable model to date, in 2023.',
      },
      {
        claim: 'The Eiffel Tower is 450 metres tall.',
        verdict: 'UNSUPPORTED',
        source: { title: 'Eiffel Tower — key facts', url: 'https://www.toureiffel.paris/en', captureTime: minutesAgo(20) },
        passage: 'The Eiffel Tower stands approximately 330 metres tall including antennas.',
      },
    ];
  },
};

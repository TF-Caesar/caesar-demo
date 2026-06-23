import { describe, it, expect, vi } from 'vitest';
import { runVerification } from '../orchestrate';
import { CaesarClient } from '../caesar';

function fakeClient(over: Partial<CaesarClient>): CaesarClient {
  return Object.assign(Object.create(CaesarClient.prototype), over) as CaesarClient;
}

describe('runVerification', () => {
  it('verifies a claim against a captured passage', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
        }],
      }),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.degraded).toBe(false);
    expect(out.claims[0].verdict).toBe('VERIFIED');
    expect(out.claims[0].source?.captureTime).toBe('2026-06-21T14:03:00Z');
  });

  it('grounds against full read text when no structured passage is present', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'LLNL', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          text: 'Intro paragraph. On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time. More text.',
        }],
      }),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.claims[0].verdict).toBe('VERIFIED');
    expect(out.claims[0].passage).toContain('2022');
  });

  it('labels subjective/comparative claims as OPINION (not VERIFIED)', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'Why JS is better than Python', canonicalUrl: 'https://x.com/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          text: 'Some developers argue JavaScript is better than Python for web work.',
        }],
      }),
    });
    const out = await runVerification('Python is better than JavaScript.', { client });
    expect(out.claims[0].verdict).toBe('OPINION');
    expect(out.claims[0].source?.url).toBe('https://x.com/a');
  });

  it('degrades to a demo response when Caesar throws', async () => {
    const client = fakeClient({ searchAndRead: vi.fn().mockRejectedValue(new Error('429')) });
    const out = await runVerification('some claim about Tesla in 2023', { client });
    expect(out.degraded).toBe(true);
    expect(out.claims.length).toBeGreaterThan(0);
  });
});

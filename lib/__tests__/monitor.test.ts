import { describe, it, expect, vi } from 'vitest';
import { runFreshnessScan } from '../monitor';
import { CaesarClient } from '../caesar';

function fakeClient(over: Partial<CaesarClient>): CaesarClient {
  return Object.assign(Object.create(CaesarClient.prototype), over) as CaesarClient;
}

describe('runFreshnessScan', () => {
  it('lists only captured items (drops unread search-only hits), newest first', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [
          { rank: 1, title: 'Older read', canonicalUrl: 'https://o/a', docId: 'a', captureTime: '2026-06-20T09:00:00Z' },
          { rank: 2, title: 'Search only', canonicalUrl: 'https://o/b', docId: 'b' }, // unread: no captureTime
          { rank: 3, title: 'Newer read', canonicalUrl: 'https://o/c', docId: 'c', captureTime: '2026-06-22T09:00:00Z' },
        ],
      }),
    });
    const out = await runFreshnessScan('openai releases', { client });
    expect(out.degraded).toBe(false);
    expect(out.items.map((i) => i.url)).toEqual(['https://o/c', 'https://o/a']); // newest first; b dropped
    expect(out.items.every((i) => i.captureTime)).toBe(true); // every radar item has a real capture moment
  });

  it('falls back to the demo scan when nothing was captured', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{ rank: 1, title: 'Search only', canonicalUrl: 'https://o/b', docId: 'b' }],
      }),
    });
    const out = await runFreshnessScan('openai releases', { client });
    expect(out.degraded).toBe(true);
    expect(out.items.length).toBeGreaterThan(0);
  });
});

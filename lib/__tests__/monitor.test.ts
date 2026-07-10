import { describe, it, expect, vi, afterEach } from 'vitest';
import { runFreshnessScan } from '../monitor';
import { CaesarClient } from '../caesar';

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it('carries publishedAt and prefers it over captureTime for ordering', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [
          // Captured later but published earlier: capture order alone would put it first.
          { rank: 1, title: 'Old story, fresh capture', canonicalUrl: 'https://o/a', docId: 'a', captureTime: '2026-06-22T10:00:00Z', publishedAt: '2026-06-20T00:00:00Z' },
          { rank: 2, title: 'New story', canonicalUrl: 'https://o/b', docId: 'b', captureTime: '2026-06-22T09:00:00Z', publishedAt: '2026-06-21T00:00:00Z' },
        ],
      }),
    });
    const out = await runFreshnessScan('openai releases', { client });
    expect(out.items.map((i) => i.url)).toEqual(['https://o/b', 'https://o/a']);
    expect(out.items[0].publishedAt).toBe('2026-06-21T00:00:00Z');
    expect(out.items[1].publishedAt).toBe('2026-06-20T00:00:00Z');
  });

  it('items without publishedAt fall back to captureTime for ordering', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [
          { rank: 1, title: 'Published wins', canonicalUrl: 'https://o/a', docId: 'a', captureTime: '2026-06-22T09:00:00Z', publishedAt: '2026-06-22T11:00:00Z' },
          { rank: 2, title: 'Capture only', canonicalUrl: 'https://o/b', docId: 'b', captureTime: '2026-06-22T10:00:00Z' },
        ],
      }),
    });
    const out = await runFreshnessScan('openai releases', { client });
    // Effective times: a = published 11:00, b = captured 10:00.
    expect(out.items.map((i) => i.url)).toEqual(['https://o/a', 'https://o/b']);
    expect(out.items[1].publishedAt).toBeUndefined();
  });

  it('requests the capture timeline and carries captureCount through to items', async () => {
    const searchAndRead = vi.fn().mockResolvedValue({
      evidence: 'x',
      citations: [
        { rank: 1, title: 'Deep archive', canonicalUrl: 'https://o/a', docId: 'a', captureTime: '2026-06-22T09:00:00Z', captureCount: 7 },
        { rank: 2, title: 'First capture', canonicalUrl: 'https://o/b', docId: 'b', captureTime: '2026-06-21T09:00:00Z' },
      ],
    });
    const out = await runFreshnessScan('openai releases', { client: fakeClient({ searchAndRead }) });
    // The timeline rides on the same read call; the scan must actually ask for it.
    expect(searchAndRead.mock.calls[0][1]).toMatchObject({ includeCaptureHistory: true });
    expect(out.items[0].captureCount).toBe(7);
    expect(out.items[1].captureCount).toBeUndefined(); // absent upstream stays absent
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

  it("VERIFIER_DEMO='0' does NOT enable demo mode (strict opt-in)", async () => {
    vi.stubEnv('VERIFIER_DEMO', '0');
    const searchAndRead = vi.fn().mockResolvedValue({
      evidence: 'x',
      citations: [{ rank: 1, title: 'Read', canonicalUrl: 'https://o/a', docId: 'a', captureTime: '2026-06-20T09:00:00Z' }],
    });
    const out = await runFreshnessScan('openai releases', { client: fakeClient({ searchAndRead }) });
    expect(out.degraded).toBe(false);
    expect(searchAndRead).toHaveBeenCalled();
  });

  it("VERIFIER_DEMO='1' forces the demo scan, with recent (not baked) capture times", async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const searchAndRead = vi.fn();
    const out = await runFreshnessScan('anything', { client: fakeClient({ searchAndRead }) });
    expect(out.degraded).toBe(true);
    expect(searchAndRead).not.toHaveBeenCalled();
    for (const item of out.items) {
      const age = Date.now() - Date.parse(item.captureTime ?? '');
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(24 * 60 * 60_000); // within the last day
    }
  });

  it('demo scan items carry plausible recent publishedAt values (published before captured)', async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const out = await runFreshnessScan('anything', { client: fakeClient({}) });
    const published = out.items.filter((i) => i.publishedAt);
    expect(published.length).toBeGreaterThan(0);
    for (const item of published) {
      const age = Date.now() - Date.parse(item.publishedAt ?? '');
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(24 * 60 * 60_000); // within the last day
      // A page is published before we capture it.
      expect(Date.parse(item.publishedAt ?? '')).toBeLessThanOrEqual(Date.parse(item.captureTime ?? ''));
    }
  });

  it('demo scan items carry plausible capture counts, including a deep archive and a first capture', async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const out = await runFreshnessScan('anything', { client: fakeClient({}) });
    // At least one item exercises the visible "seen N times" path (N > 1) and
    // at least one stays quiet (N = 1), so the fallback shows both states.
    expect(out.items.some((i) => (i.captureCount ?? 0) > 1)).toBe(true);
    expect(out.items.some((i) => i.captureCount === 1)).toBe(true);
    for (const item of out.items) {
      expect(item.captureCount).toBeGreaterThanOrEqual(1);
    }
  });
});

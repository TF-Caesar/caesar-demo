import { describe, it, expect, vi, afterEach } from 'vitest';
import { runResearch } from '../api-research';
import { CaesarClient } from '../caesar';
import type { Citation } from '../caesar';

function fakeClient(over: Partial<CaesarClient>): CaesarClient {
  return Object.assign(Object.create(CaesarClient.prototype), over) as CaesarClient;
}

const worldCupCites: Citation[] = [
  // Deliberately no score: Caesar omits scores under load, and a minScore
  // floor would drop every result and falsely degrade to the canned demo.
  {
    rank: 1, title: 'AP News', canonicalUrl: 'https://ap.com/a', docId: 'd1',
    captureTime: '2026-06-21T14:03:00Z',
    text: 'Argentina won the 2022 FIFA World Cup, defeating France in a penalty shootout. '.repeat(4),
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runResearch', () => {
  it('returns real results (not the demo) when Caesar returns unscored citations', async () => {
    const searchAndRead = vi.fn().mockResolvedValue({ evidence: 'x', citations: worldCupCites });
    const out = await runResearch('Who won the 2022 World Cup?', { client: fakeClient({ searchAndRead }) });
    expect(out.degraded).toBe(false);
    expect(out.summary.map((s) => s.text).join(' ')).toMatch(/Argentina/);
    expect(out.sources).toHaveLength(1);
    // The regression: passing minScore made the shared client drop unscored
    // results, so a fine API response rendered as "free tier is busy".
    expect(searchAndRead.mock.calls[0][1]).not.toHaveProperty('minScore');
  });

  it('summary items carry a sourceIndex that points into the numbered sources list', async () => {
    const searchAndRead = vi.fn().mockResolvedValue({ evidence: 'x', citations: worldCupCites });
    const out = await runResearch('Who won the 2022 World Cup?', { client: fakeClient({ searchAndRead }) });
    expect(out.summary.length).toBeGreaterThan(0);
    expect(out.summary[0].sourceIndex).toBe(1);
    expect(out.sources[0].index).toBe(1);
  });

  it('demo fallback bullets carry plausible sourceIndex values within the sources list', async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const out = await runResearch('anything', { client: fakeClient({}) });
    expect(out.summary.length).toBeGreaterThan(0);
    for (const item of out.summary) {
      expect(typeof item.text).toBe('string');
      expect(item.sourceIndex).toBeGreaterThanOrEqual(1);
      expect(item.sourceIndex).toBeLessThanOrEqual(out.sources.length);
    }
  });

  it("VERIFIER_DEMO='0' does NOT enable demo mode (strict opt-in)", async () => {
    vi.stubEnv('VERIFIER_DEMO', '0');
    const searchAndRead = vi.fn().mockResolvedValue({ evidence: 'x', citations: worldCupCites });
    const out = await runResearch('Who won the 2022 World Cup?', { client: fakeClient({ searchAndRead }) });
    expect(out.degraded).toBe(false);
    expect(searchAndRead).toHaveBeenCalled();
  });

  it("VERIFIER_DEMO='1' forces the demo briefing without touching Caesar", async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const searchAndRead = vi.fn();
    const out = await runResearch('anything', { client: fakeClient({ searchAndRead }) });
    expect(out.degraded).toBe(true);
    expect(searchAndRead).not.toHaveBeenCalled();
  });

  it('demo fallback capture times are recent, not baked calendar dates', async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const out = await runResearch('anything', { client: fakeClient({}) });
    for (const src of out.sources) {
      const age = Date.now() - Date.parse(src.capturedISO ?? '');
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(24 * 60 * 60_000); // within the last day
    }
  });
});

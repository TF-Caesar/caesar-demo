import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetRateLimiter } from '../rate-limit';
import { POST as streamPost } from '../../app/api/verify/stream/route';

interface AnyEvent { type: string; [key: string]: unknown }

async function readNdjson(res: Response): Promise<AnyEvent[]> {
  const text = await res.text();
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as AnyEvent);
}

function mkRequest(body: string, ip: string): Request {
  return new Request('http://localhost/api/verify/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'fly-client-ip': ip },
    body,
  });
}

beforeEach(() => resetRateLimiter());
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/verify/stream', () => {
  it('streams one JSON object per line: claims, then per-claim verdicts, then done', async () => {
    vi.stubEnv('VERIFIER_DEMO', '1'); // canned engine: deterministic events, no network
    const res = await streamPost(mkRequest(
      JSON.stringify({ input: 'The National Ignition Facility achieved fusion ignition in 2022.' }),
      '3.3.3.1',
    ));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await readNdjson(res);
    expect(events[0].type).toBe('claims');
    const announced = events[0].claims as string[];
    expect(announced.length).toBeGreaterThan(0);
    const claimEvents = events.filter((e) => e.type === 'claim');
    expect(claimEvents).toHaveLength(announced.length);
    expect(events.at(-1)).toMatchObject({ type: 'done', degraded: true });
  });

  it('streams an empty claim set for empty or malformed input without touching the engine', async () => {
    // Same lenient posture as the JSON route: a bad body reads as empty input.
    for (const body of [JSON.stringify({ input: '   ' }), '{not json']) {
      const res = await streamPost(mkRequest(body, '3.3.3.2'));
      expect(res.status).toBe(200);
      expect(await readNdjson(res)).toEqual([
        { type: 'claims', claims: [] },
        { type: 'done', degraded: false },
      ]);
    }
  });

  it('returns the same JSON 429 with Retry-After as the JSON route before any streaming', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await streamPost(mkRequest(JSON.stringify({ input: '' }), '3.3.3.3'))).status).toBe(200);
    }
    const res = await streamPost(mkRequest(JSON.stringify({ input: '' }), '3.3.3.3'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    expect((await res.json()).error).toBe('rate_limited');
  });

  it('rejects an oversized chunked body (no Content-Length) with the same 413', async () => {
    const big = JSON.stringify({ input: 'x'.repeat(40_000) });
    const req = new Request('http://localhost/api/verify/stream', {
      method: 'POST',
      headers: { 'fly-client-ip': '3.3.3.4' },
      body: new Blob([big]).stream(),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const res = await streamPost(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });
});

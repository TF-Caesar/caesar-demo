import { describe, it, expect, beforeEach } from 'vitest';
import { resetRateLimiter } from '../rate-limit';
import { POST as verifyPost } from '../../app/api/verify/route';

beforeEach(() => {
  resetRateLimiter();
});

describe('POST /api/verify', () => {
  it('rejects an oversized chunked body (no Content-Length) with a distinct 413', async () => {
    // A streamed body carries no Content-Length, so only the post-read byte
    // check can catch it; the old header-only check buffered it unbounded.
    const big = JSON.stringify({ input: 'x'.repeat(40_000) });
    const req = new Request('http://localhost/api/verify', {
      method: 'POST',
      body: new Blob([big]).stream(),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const res = await verifyPost(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });

  it('returns 429 with Retry-After on the 6th rapid request from one IP', async () => {
    const mk = () => new Request('http://localhost/api/verify', {
      method: 'POST',
      headers: { 'fly-client-ip': '9.9.9.9', 'content-type': 'application/json' },
      body: JSON.stringify({ input: '' }), // empty input: the route answers without touching Caesar
    });
    for (let i = 0; i < 5; i++) {
      expect((await verifyPost(mk())).status).toBe(200);
    }
    const res = await verifyPost(mk());
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    expect((await res.json()).error).toBe('rate_limited');
  });
});

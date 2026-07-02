import { NextResponse } from 'next/server';
import { runVerification } from '../../../lib/orchestrate';
import { clientIp, rateLimit } from '../../../lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a claim/paragraph/URL is tiny; reject abuse early

export async function POST(req: Request) {
  // Rate-limit before any Caesar or Anthropic work: one anonymous POST fans
  // out to several upstream calls, so an unthrottled loop drains the quota.
  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    const retryAfterSeconds = limit.retryAfterSeconds ?? 60;
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }
  // Also cap the actual body: chunked / missing Content-Length bypasses the
  // header check, and an unbounded req.json() would buffer it all in memory.
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    raw = '';
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }
  let input = '';
  try {
    input = JSON.parse(raw)?.input ?? '';
  } catch {
    input = '';
  }
  if (typeof input !== 'string' || input.trim().length === 0) {
    return NextResponse.json({ claims: [], degraded: false }, { status: 200 });
  }
  const result = await runVerification(input.slice(0, 8000));
  return NextResponse.json(result, { status: 200 });
}

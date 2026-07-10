import { NextResponse } from 'next/server';
import { runResearch } from '../../../lib/api-research';
import { clientIp, rateLimit } from '../../../lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a research question is tiny; reject abuse early

export async function POST(req: Request) {
  // Rate-limit before any Caesar work: one visitor POST fans out to several
  // upstream calls, each billed to the server's Caesar key, so an unthrottled
  // loop drains the credits.
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
    return NextResponse.json({ question: '', summary: [], sources: [], degraded: false }, { status: 200 });
  }
  try {
    const result = await runResearch(input.slice(0, 4000));
    return NextResponse.json(result, { status: 200 });
  } catch {
    // runResearch already returns a baked demo on internal failure; this is a
    // last-resort guard so the route never 500s under throttling.
    const result = await runResearch('');
    return NextResponse.json(result, { status: 200 });
  }
}

import { NextResponse } from 'next/server';
import { runFinder } from '../../../../lib/finder';
import { clientIp, rateLimit } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a product name or short description is tiny; reject abuse early

/**
 * Streaming twin of POST /api/find: the same hardened prelude, then the
 * finder's narration events as NDJSON lines ('status', 'offers', then a final
 * 'done' carrying the exact FinderResult the JSON route would have returned).
 * Unlike the JSON route, an empty query is a 400 here: a stream of nothing
 * would leave the client narrating silence.
 */
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
  let query = '';
  try {
    query = JSON.parse(raw)?.query ?? '';
  } catch {
    query = '';
  }
  if (typeof query !== 'string' || query.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const q = query.slice(0, 400);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // enqueue throws once the client disconnects; swallowing it lets the
      // finder run to completion instead of surfacing a spurious error.
      const send = (e: unknown): void => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
        } catch { /* client went away */ }
      };
      try {
        // runFinder emits 'done' itself; every event goes straight to the wire.
        await runFinder(q, { onEvent: send });
      } catch {
        // runFinder already degrades internally; last-resort guard.
        send({ type: 'error', message: 'internal' });
      }
      try {
        controller.close();
      } catch { /* already closed by cancellation */ }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // Tell any fronting proxy not to buffer: the narration must arrive live.
      'x-accel-buffering': 'no',
    },
  });
}

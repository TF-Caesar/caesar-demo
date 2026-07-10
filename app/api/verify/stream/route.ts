import { NextResponse } from 'next/server';
import { runVerificationEvents, type VerifyEvent } from '../../../../lib/orchestrate';
import { clientIp, rateLimit } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a claim/paragraph/URL is tiny; reject abuse early

/**
 * NDJSON streaming twin of POST /api/verify: same hardened prelude (rate
 * limit, then body caps, then validation) and the same engine underneath.
 * The only difference is delivery: one JSON object per line as each verdict
 * settles, instead of a single body after the full wait. Errors before
 * streaming starts reuse the JSON route's error responses; a failure
 * mid-stream writes a final `{type:'error'}` line and closes.
 */
export async function POST(req: Request) {
  // Rate-limit before any Caesar or Anthropic work: one visitor POST fans out
  // to several upstream calls, each billed to the server's keys, so an
  // unthrottled loop drains the credits.
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
    return ndjsonResponse(emptyEvents());
  }
  return ndjsonResponse(runVerificationEvents(input.slice(0, 8000)));
}

/** Mirrors the JSON route's `{ claims: [], degraded: false }` answer for empty input, as a stream. */
async function* emptyEvents(): AsyncGenerator<VerifyEvent> {
  yield { type: 'claims', claims: [] };
  yield { type: 'done', degraded: false };
}

/** Serialize engine events as NDJSON, flushing one line per event. */
function ndjsonResponse(events: AsyncGenerator<VerifyEvent>): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: VerifyEvent) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          cancelled = true; // consumer went away mid-stream: stop writing
        }
      };
      try {
        for await (const event of events) {
          if (cancelled) break; // stop pulling the engine for a vanished client
          write(event);
        }
      } catch {
        // The engine degrades internally, so this is a last-resort guard:
        // tell the client the stream died instead of just going silent.
        write({ type: 'error', message: 'verification_failed' });
      }
      if (!cancelled) {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

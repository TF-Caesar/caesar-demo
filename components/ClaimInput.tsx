'use client';

import { useRef, useState } from 'react';
import { DEMO_EXAMPLES, DEMO_RESPONSE } from '../fixtures/demo';
import type { VerifyResponse } from '../lib/orchestrate';
import { ResultCard } from './ResultCard';

const DEMO_CLAIM_TEXTS = new Set(DEMO_RESPONSE.claims.map((c) => c.claim));

export function ClaimInput() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: a slow, stale response must never overwrite a newer one.
  const seqRef = useRef(0);

  async function run(text: string) {
    if (!text.trim() || loading) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        if (seq !== seqRef.current) return;
        setError(
          res.status === 429
            ? 'Checks are coming in faster than the free tier allows. Wait a moment and try again.'
            : res.status === 413
              ? 'That input is too large. Paste a shorter passage or a single URL.'
              : 'Something went wrong on our side. Try again in a moment.',
        );
        return;
      }
      const body = (await res.json()) as VerifyResponse;
      if (seq !== seqRef.current) return;
      setData(body);
    } catch (err) {
      if (seq !== seqRef.current) return;
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      setError(
        timedOut
          ? 'That check took too long. Try again in a moment.'
          : 'Could not reach the demo. Check your connection and try again.',
      );
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  const claims = data?.claims ?? [];
  // Degraded comes in two shapes: the full cached fixture (every claim is a
  // canned one) versus a PARTIAL run where some real claims failed under load.
  const isDemoFixture = claims.length > 0 && claims.every((c) => DEMO_CLAIM_TEXTS.has(c.claim));

  return (
    <div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste a claim, a paragraph, or a URL…"
        aria-label="Claim, paragraph, or URL to verify"
        className="h-36 w-full resize-y rounded-input border border-hairline bg-paper px-4 py-4 text-[15px] leading-relaxed text-ink outline-none transition-colors duration-editorial ease-editorial placeholder:text-ink-2 focus:border-ink-2"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => run(input)}
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-[13px] font-medium text-paper transition-colors duration-editorial ease-editorial hover:bg-ink-mark disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" aria-hidden="true" />}
          {loading ? 'Checking…' : 'Verify'}
        </button>

        {DEMO_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            onClick={() => { setInput(ex.input); run(ex.input); }}
            disabled={loading}
            className="rounded-pill border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-bone hover:text-ink disabled:opacity-50"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-coral-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />
          {error}
        </div>
      )}

      {data?.degraded && (
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
          {isDemoFixture
            ? 'Showing a cached example: the free tier is busy right now.'
            : 'Some claims could not be checked right now. Showing the ones that completed.'}
        </div>
      )}

      {claims.length > 0 && (
        <div className="mt-6 space-y-4">
          {claims.map((r, i) => (
            <div key={i} className="cv-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <ResultCard r={r} />
            </div>
          ))}
        </div>
      )}

      {data && claims.length === 0 && !data.degraded && (
        <p className="mt-7 text-[13px] text-ink-2">
          No checkable claims found in that text. Try a sentence with a number, a date, or a name.
        </p>
      )}
    </div>
  );
}

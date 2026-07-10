'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEMO_EXAMPLES, DEMO_RESPONSE } from '../fixtures/demo';
import type { ClaimResult, VerifyEvent } from '../lib/orchestrate';
import { createNdjsonParser } from '../lib/ndjson';
import { ResultCard } from './ResultCard';

const DEMO_CLAIM_TEXTS = new Set(DEMO_RESPONSE.claims.map((c) => c.claim));

/**
 * Progressive state fed by the NDJSON stream: `claims` arrives first as
 * placeholders, each verdict fills its slot as it settles, and `degraded`
 * stays null until the done event marks the run complete.
 */
interface StreamState {
  claims: string[];
  results: (ClaimResult | null)[];
  degraded: boolean | null;
  tier?: string;
}

/** Placeholder card shown while a claim's verdict is still settling upstream. */
function PendingCard({ claim }: { claim: string }) {
  return (
    <article className="rounded-card border border-bone bg-paper p-6">
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 font-mono text-[11px] font-medium tracking-label text-ink-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" aria-hidden="true" />
        CHECKING
      </span>
      <p className="mt-3.5 text-[15px] leading-relaxed text-ink-2">{claim}</p>
    </article>
  );
}

function ClaimInputPanel() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Monotonic request id: a slow, stale response must never overwrite a newer one.
  const seqRef = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRan = useRef(false);
  const searchParams = useSearchParams();

  // Deep link: ?q=... prefills the input and runs once on mount. The ref
  // guard makes this once per page load; later replaceState writes below
  // must never re-trigger a run.
  useEffect(() => {
    if (autoRan.current) return;
    const q = searchParams.get('q')?.trim();
    if (!q) return;
    autoRan.current = true;
    setInput(q);
    void run(q, { fromUrl: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  async function run(text: string, opts: { fromUrl?: boolean } = {}) {
    if (!text.trim() || loading) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setStream(null);
    setError(null);
    let sawDone = false;
    let sawStreamError = false;
    const apply = (event: VerifyEvent) => {
      if (event.type === 'claims') {
        // A second claims event (canned fallback) replaces the set wholesale.
        setStream({ claims: event.claims, results: event.claims.map(() => null), degraded: null });
      } else if (event.type === 'claim') {
        setStream((prev) => {
          if (!prev) return prev;
          const results = prev.results.slice();
          results[event.index] = event.result;
          return { ...prev, results };
        });
      } else if (event.type === 'done') {
        sawDone = true;
        setStream((prev) =>
          prev
            ? { ...prev, degraded: event.degraded, tier: event.tier }
            : { claims: [], results: [], degraded: event.degraded, tier: event.tier },
        );
      } else if (event.type === 'error') {
        sawStreamError = true;
      }
    };
    try {
      const res = await fetch('/api/verify/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text }),
        signal: AbortSignal.timeout(120_000),
      });
      if (seq !== seqRef.current) return;
      if (!res.ok || !res.body) {
        setError(
          res.status === 429
            ? 'Checks are coming in faster than this demo allows. Wait a moment and try again.'
            : res.status === 413
              ? 'That input is too large. Paste a shorter passage or a single URL.'
              : 'Something went wrong on our side. Try again in a moment.',
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createNdjsonParser<VerifyEvent>();
      for (;;) {
        const { done, value } = await reader.read();
        if (seq !== seqRef.current) {
          void reader.cancel().catch(() => {});
          return;
        }
        const events = done
          ? [...parser.push(decoder.decode()), ...parser.flush()]
          : parser.push(decoder.decode(value, { stream: true }));
        for (const event of events) apply(event);
        if (done) break;
      }
      if (sawStreamError || !sawDone) {
        // Stream died partway: keep the verdicts already rendered.
        setError('Something went wrong on our side. Try again in a moment.');
        return;
      }
      if (!opts.fromUrl) {
        // Successful user-initiated run: make the URL shareable in place
        // (no navigation, no scroll).
        const url = new URL(window.location.href);
        url.searchParams.set('q', text);
        window.history.replaceState(window.history.state, '', url);
      }
    } catch (err) {
      if (seq !== seqRef.current) return;
      // Mid-stream abort/timeout: verdicts already rendered stay on screen.
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

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      return; // clipboard unavailable (permissions, plain http): leave the label alone
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  const settled = (stream?.results ?? []).filter((r): r is ClaimResult => r !== null);
  const isDone = stream !== null && stream.degraded !== null;
  // Placeholders only while the stream is alive; after done or an error the
  // unfilled slots are failures, and the degraded banner explains them.
  const showPending = stream !== null && stream.degraded === null && !error;
  // Degraded comes in two shapes: the full cached fixture (every claim is a
  // canned one) versus a PARTIAL run where some real claims failed under load.
  const isDemoFixture = settled.length > 0 && settled.every((c) => DEMO_CLAIM_TEXTS.has(c.claim));

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

        {settled.length > 0 && (
          <button
            type="button"
            onClick={share}
            className="rounded-pill border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-bone hover:text-ink"
          >
            {copied ? 'copied' : 'share'}
          </button>
        )}

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

      {isDone && stream.degraded && (
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
          {isDemoFixture
            ? 'Live search is unavailable right now: showing a cached example.'
            : 'Some claims could not be checked right now. Showing the ones that completed.'}
        </div>
      )}

      {stream !== null && stream.claims.length > 0 && (
        <div className="mt-6 space-y-4">
          {stream.claims.map((claim, i) => {
            const r = stream.results[i];
            if (r) {
              // Distinct key per phase: the card re-mounts when the verdict
              // lands, so the rise animation plays again on the fill.
              return (
                <div key={`r-${i}`} className="cv-rise">
                  <ResultCard r={r} tier={stream.tier ?? undefined} />
                </div>
              );
            }
            if (!showPending) return null;
            return (
              <div key={`p-${i}`} className="cv-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <PendingCard claim={claim} />
              </div>
            );
          })}
        </div>
      )}

      {isDone && settled.length === 0 && !stream.degraded && (
        <p className="mt-7 text-[13px] text-ink-2">
          No checkable claims found in that text. Try a sentence with a number, a date, or a name.
        </p>
      )}
    </div>
  );
}

/**
 * useSearchParams must sit under a Suspense boundary in Next 15, and the
 * page mounts this panel straight from a server component, so the boundary
 * lives here. The fallback mirrors the input shell to avoid a layout pop.
 */
export function ClaimInput() {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-36 w-full rounded-input border border-hairline bg-paper" />}>
      <ClaimInputPanel />
    </Suspense>
  );
}

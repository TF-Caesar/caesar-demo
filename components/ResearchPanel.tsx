'use client';

import { useRef, useState } from 'react';
import type { ResearchResult } from '../lib/api-research';
import { safeExternalUrl } from '../lib/url';

const EXAMPLES = ['Who won the 2022 World Cup', 'State of fusion energy 2026'];

function formatCapture(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `captured ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ResearchPanel() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ResearchResult | null>(null);
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
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        if (seq !== seqRef.current) return;
        setError(
          res.status === 429
            ? 'Questions are coming in faster than the free tier allows. Wait a moment and try again.'
            : res.status === 413
              ? 'That question is too large. Try a shorter one.'
              : 'Something went wrong on our side. Try again in a moment.',
        );
        return;
      }
      const body = (await res.json()) as ResearchResult;
      if (seq !== seqRef.current) return;
      setData(body);
    } catch (err) {
      if (seq !== seqRef.current) return;
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      setError(
        timedOut
          ? 'That briefing took too long. Try again in a moment.'
          : 'Could not reach the demo. Check your connection and try again.',
      );
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  return (
    <div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask anything…"
        aria-label="Research question"
        className="h-32 w-full resize-y rounded-input border border-hairline bg-paper px-4 py-4 text-[15px] leading-relaxed text-ink outline-none transition-colors duration-editorial ease-editorial placeholder:text-ink-2 focus:border-ink-2"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => run(input)}
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-[13px] font-medium text-paper transition-colors duration-editorial ease-editorial hover:bg-ink-mark disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lilac" aria-hidden="true" />}
          {loading ? 'Researching…' : 'Research'}
        </button>

        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setInput(ex); run(ex); }}
            disabled={loading}
            className="rounded-pill border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-lilac hover:text-lilac-deep disabled:opacity-50"
          >
            {ex}
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
          <span className="h-1.5 w-1.5 rounded-full bg-lilac" aria-hidden="true" />
          Showing a cached example — the free tier is busy right now.
        </div>
      )}

      {data && (data.summary.length > 0 || data.sources.length > 0) && (
        <div className="mt-8 cv-rise">
          {data.summary.length > 0 && (
            <section>
              <h2 className="font-display text-[1.1rem] text-ink-mark">Summary</h2>
              <ul className="mt-3 space-y-2.5">
                {data.summary.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2">
                    <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-lilac" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.sources.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-[1.1rem] text-ink-mark">Sources</h2>
              <ol className="mt-3 space-y-3">
                {data.sources.map((src) => {
                  const captured = formatCapture(src.capturedISO);
                  const safeUrl = safeExternalUrl(src.url);
                  return (
                    <li key={src.index} className="flex gap-3 text-[13px]">
                      <span className="font-mono text-lilac-deep">{src.index}.</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {safeUrl ? (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group inline-flex items-center gap-1 text-[15px] text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
                          >
                            {src.title}
                            <span aria-hidden="true" className="text-ink-2 transition-colors duration-editorial ease-editorial group-hover:text-ink">↗</span>
                          </a>
                        ) : (
                          <span className="text-[15px] text-ink">{src.title}</span>
                        )}
                        {captured && (
                          <>
                            <span aria-hidden="true" className="text-hairline">·</span>
                            <span className="font-mono text-ink-2">{captured}</span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

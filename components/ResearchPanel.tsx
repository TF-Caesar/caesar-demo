'use client';

import { useState } from 'react';
import type { ResearchResult } from '../lib/api-research';

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

  async function run(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text }),
      });
      setData((await res.json()) as ResearchResult);
    } finally {
      setLoading(false);
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
                  return (
                    <li key={src.index} className="flex gap-3 text-[13px]">
                      <span className="font-mono text-lilac-deep">{src.index}.</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group inline-flex items-center gap-1 text-[15px] text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
                        >
                          {src.title}
                          <span aria-hidden="true" className="text-ink-2 transition-colors duration-editorial ease-editorial group-hover:text-ink">↗</span>
                        </a>
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

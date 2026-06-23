'use client';

import { useState } from 'react';
import type { FreshnessResult } from '../lib/monitor';
import { safeExternalUrl } from '../lib/url';

const CHIPS = ['OpenAI model releases', 'AI search startups'];

function formatCapture(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `captured ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function MonitorPanel() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FreshnessResult | null>(null);

  async function run(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/monitor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: text }),
      });
      setData((await res.json()) as FreshnessResult);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(topic); }}
          placeholder="Topic to watch…"
          aria-label="Topic to watch"
          className="w-full rounded-input border border-hairline bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors duration-editorial ease-editorial placeholder:text-ink-2 focus:border-ink-2"
        />
        <button
          onClick={() => run(topic)}
          disabled={loading || !topic.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-[13px] font-medium text-paper transition-colors duration-editorial ease-editorial hover:bg-ink-mark disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" aria-hidden="true" />}
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => { setTopic(c); run(c); }}
            disabled={loading}
            className="rounded-pill border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-coral hover:text-coral-deep disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>

      {data?.degraded && (
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />
          Showing a cached example — the free tier is busy right now.
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-6 space-y-3">
          {data.items.map((item, i) => {
            const captured = formatCapture(item.captureTime);
            const safeUrl = safeExternalUrl(item.url);
            return (
              <article
                key={item.url}
                className="cv-rise rounded-card border border-bone border-l-2 border-l-coral bg-paper p-5 transition-colors duration-editorial ease-editorial hover:bg-surface"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {safeUrl ? (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-1 text-[15px] leading-relaxed text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
                  >
                    {item.title}
                    <span aria-hidden="true" className="text-ink-2 transition-colors duration-editorial ease-editorial group-hover:text-ink">↗</span>
                  </a>
                ) : (
                  <span className="text-[15px] leading-relaxed text-ink">{item.title}</span>
                )}
                {captured && (
                  <div className="mt-2 font-mono text-[12px] text-ink-2">{captured}</div>
                )}
              </article>
            );
          })}

          <p className="pt-2 text-[12px] text-ink-2">
            Track changes over time with the caesar-monitor CLI + GitHub Action →{' '}
            <a
              href="https://github.com/TF-Caesar/caesar-monitor"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:text-ink hover:decoration-ink"
            >
              github.com/TF-Caesar/caesar-monitor
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

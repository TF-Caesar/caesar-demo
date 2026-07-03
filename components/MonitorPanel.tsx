'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FreshnessResult } from '../lib/monitor';
import { relativeTime } from '../lib/time';
import { safeExternalUrl } from '../lib/url';

const CHIPS = ['OpenAI model releases', 'AI search startups'];

function formatCapture(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `captured ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// publishedAt is best-effort: when it does not parse, fall back to the
// captured-only stamp rather than fabricating a publish time.
function formatPublished(iso?: string): string | undefined {
  if (!iso) return undefined;
  const rel = relativeTime(iso);
  return rel ? `published ${rel}` : undefined;
}

export function MonitorPanel() {
  // useSearchParams needs a Suspense boundary (Next 15) and this panel sits
  // directly in a server page, so the boundary lives here.
  return (
    <Suspense fallback={null}>
      <MonitorPanelInner />
    </Suspense>
  );
}

function MonitorPanelInner() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FreshnessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Monotonic request id: a slow, stale response must never overwrite a newer one.
  const seqRef = useRef(0);
  const searchParams = useSearchParams();
  // A deep link auto-runs exactly once; re-renders must never re-fire it.
  const autoRanRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = searchParams.get('topic')?.trim();
    if (!t || autoRanRef.current) return;
    autoRanRef.current = true;
    setTopic(t);
    void run(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, plain http): fail quietly.
    }
  }

  async function run(text: string) {
    if (!text.trim() || loading) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const res = await fetch('/api/monitor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: text }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        if (seq !== seqRef.current) return;
        setError(
          res.status === 429
            ? 'Scans are coming in faster than the free tier allows. Wait a moment and try again.'
            : res.status === 413
              ? 'That topic is too large. Try a shorter one.'
              : 'Something went wrong on our side. Try again in a moment.',
        );
        return;
      }
      const body = (await res.json()) as FreshnessResult;
      if (seq !== seqRef.current) return;
      setData(body);
      // Make the result linkable: write the topic into the URL in place,
      // no navigation and no scroll.
      const url = new URL(window.location.href);
      url.searchParams.set('topic', text.trim());
      window.history.replaceState(null, '', url);
    } catch (err) {
      if (seq !== seqRef.current) return;
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      setError(
        timedOut
          ? 'That scan took too long. Try again in a moment.'
          : 'Could not reach the demo. Check your connection and try again.',
      );
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) run(topic); }}
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

        {data && (
          <button
            onClick={share}
            className="shrink-0 rounded-pill border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-coral hover:text-coral-deep"
          >
            {copied ? 'copied' : 'share'}
          </button>
        )}
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

      {error && (
        <div role="alert" className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-coral-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />
          {error}
        </div>
      )}

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
            const published = formatPublished(item.publishedAt);
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
                {(published || captured) && (
                  <div className="mt-2 font-mono text-[12px] text-ink-2">
                    {published ? (
                      <>
                        {published}
                        {captured && (
                          <>
                            <span aria-hidden="true" className="text-hairline"> · </span>
                            {captured}
                          </>
                        )}
                      </>
                    ) : (
                      captured
                    )}
                  </div>
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

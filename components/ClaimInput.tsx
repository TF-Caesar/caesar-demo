'use client';

import { useState } from 'react';
import { DEMO_EXAMPLES } from '../fixtures/demo';
import type { VerifyResponse } from '../lib/orchestrate';
import { ResultCard } from './ResultCard';

export function ClaimInput() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VerifyResponse | null>(null);

  async function run(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text }),
      });
      setData((await res.json()) as VerifyResponse);
    } finally {
      setLoading(false);
    }
  }

  const claims = data?.claims ?? [];

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

      {data?.degraded && (
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
          Showing a cached example — the free tier is busy right now.
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

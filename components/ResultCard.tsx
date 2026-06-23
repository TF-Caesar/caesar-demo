import type { ClaimResult } from '../lib/orchestrate';
import { safeExternalUrl } from '../lib/url';

type VerdictStyle = { label: string; pill: string; dot: string; rule: string };

const VERDICT: Record<ClaimResult['verdict'], VerdictStyle> = {
  VERIFIED: { label: 'VERIFIED', pill: 'bg-sage-tint text-sage-deep', dot: 'bg-sage-deep', rule: 'border-sage' },
  NEEDS_CONTEXT: { label: 'NEEDS CONTEXT', pill: 'bg-coral-tint text-coral-deep', dot: 'bg-coral-deep', rule: 'border-coral' },
  UNSUPPORTED: { label: 'UNSUPPORTED', pill: 'bg-clay-tint text-clay-deep', dot: 'bg-clay-deep', rule: 'border-clay' },
  // A subjective/comparative claim — not a checkable fact. Quiet, neutral, no judgement.
  OPINION: { label: 'OPINION · NOT A FACT', pill: 'bg-surface text-ink-2 ring-1 ring-bone', dot: 'bg-ink-2', rule: 'border-bone' },
};

const FALLBACK: VerdictStyle = { label: 'UNVERIFIED', pill: 'bg-clay-tint text-clay-deep', dot: 'bg-clay-deep', rule: 'border-clay' };

function formatCapture(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `captured ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ResultCard({ r }: { r: ClaimResult }) {
  const v = VERDICT[r.verdict] ?? FALLBACK;

  return (
    <article className="rounded-card border border-bone bg-paper p-6 transition-colors duration-editorial ease-editorial hover:bg-surface">
      <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-mono text-[11px] font-medium tracking-label ${v.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} aria-hidden="true" />
        {v.label}
      </span>

      <p className="mt-3.5 text-[15px] leading-relaxed text-ink">{r.claim}</p>

      {r.passage && (
        <blockquote className={`mt-4 rounded-r-lg border-l-2 bg-surface px-4 py-3 text-[15px] leading-[1.6] text-ink-2 ${v.rule}`}>
          &ldquo;{r.passage}&rdquo;
        </blockquote>
      )}

      {r.source && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-2">
          {safeExternalUrl(r.source.url) ? (
            <a
              href={safeExternalUrl(r.source.url)!}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1 text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
            >
              {r.source.title}
              <span aria-hidden="true" className="text-ink-2 transition-colors duration-editorial ease-editorial group-hover:text-ink">↗</span>
            </a>
          ) : (
            <span className="text-ink">{r.source.title}</span>
          )}
          {r.source.captureTime && (
            <>
              <span aria-hidden="true" className="text-hairline">·</span>
              <span className="font-mono text-ink-2">{formatCapture(r.source.captureTime)}</span>
            </>
          )}
        </div>
      )}
    </article>
  );
}

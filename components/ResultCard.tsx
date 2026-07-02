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

/** Compact relative age for the receipt ("just now", "7m ago", "3h ago", "2d ago"); undefined when unparseable. */
function relativeAge(iso: string): string | undefined {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Publication date for the receipt: date only, never a fabricated clock time. */
function publishedDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * One receipt line per field Caesar actually returned; nothing is fabricated.
 * publishedAt is best-effort upstream, so the capture line is the fallback
 * freshness signal and publication appears only when known.
 */
function receiptLines(r: ClaimResult, tier?: string): string[] {
  const lines: string[] = [];
  const captureParts: string[] = [];
  if (r.captureId) captureParts.push(`capture ${r.captureId.slice(0, 8)}`);
  const age = r.source?.captureTime ? relativeAge(r.source.captureTime) : undefined;
  if (age) captureParts.push(`captured ${age}`);
  if (captureParts.length > 0) lines.push(captureParts.join(' · '));
  if (r.publishedAt) lines.push(`published ${publishedDate(r.publishedAt)}`);
  if (typeof r.score === 'number') lines.push(`relevance ${r.score.toFixed(2)}`);
  if (r.passageId) lines.push(`passage ${r.passageId.slice(0, 8)}`);
  if (tier) lines.push(`${tier} tier`);
  return lines;
}

export function ResultCard({ r, tier }: { r: ClaimResult; tier?: string }) {
  const v = VERDICT[r.verdict] ?? FALLBACK;
  const receipt = receiptLines(r, tier);

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

      {receipt.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none font-mono text-[11px] tracking-label text-ink-2 transition-colors duration-editorial ease-editorial hover:text-ink">
            receipt
          </summary>
          <div className="mt-1.5 space-y-0.5 font-mono text-[11px] leading-relaxed text-ink-2">
            {receipt.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

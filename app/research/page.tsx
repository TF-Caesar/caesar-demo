import type { Metadata } from 'next';
import { ResearchPanel } from '../../components/ResearchPanel';
import { demoShareMeta, firstParam } from '../../lib/og';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Shared deep links (?q=...) unfurl with the question on the card. */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  return demoShareMeta('research', firstParam(params.q));
}

export default function DeepResearchPage() {
  return (
    <main className="mx-auto w-full max-w-frame px-6">
      <section className="mx-auto max-w-measure pt-16 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-pill bg-lilac-tint px-3 py-1 text-[12px] font-medium text-lilac-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-lilac" aria-hidden="true" />
          Live sources, captured with a timestamp
        </span>

        <h1 className="mt-5 text-[clamp(2.4rem,5vw,3.25rem)] leading-[1.05] tracking-tightest">
          Research anything, with receipts.
        </h1>

        <p className="mt-4 max-w-[42ch] text-[1.0625rem] leading-relaxed text-ink-2">
          Ask a question. Caesar reads the live sources and gives you a short briefing —
          the facts, then a numbered, dated list of where each one came from. Free, no signup — powered by{' '}
          <a
            href="https://trycaesar.com"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
          >
            Caesar
          </a>{' '}
          search.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-measure">
        <ResearchPanel />
      </section>

      <footer className="mx-auto mt-24 max-w-measure pb-16 pt-10">
        <p className="text-[12px] text-ink-2">
          Powered by{' '}
          <a
            href="https://trycaesar.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:text-ink hover:decoration-ink"
          >
            Caesar search
          </a>{' '}
          — free, no signup. Every line in the briefing is grounded in a captured source.
        </p>
      </footer>
    </main>
  );
}

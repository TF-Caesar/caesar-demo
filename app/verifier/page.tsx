import type { Metadata } from 'next';
import { ClaimInput } from '../../components/ClaimInput';
import { demoShareMeta, firstParam } from '../../lib/og';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Shared deep links (?q=...) unfurl with the claim on the card. */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  return demoShareMeta('verifier', firstParam(params.q));
}

export default function VerifierPage() {
  return (
    <main className="mx-auto w-full max-w-frame px-6">
      <section className="mx-auto max-w-measure pt-16 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-pill bg-sage-tint px-3 py-1 text-[12px] font-medium text-sage-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
          Live sources, captured with a timestamp
        </span>

        <h1 className="mt-5 text-[clamp(2.4rem,5vw,3.25rem)] leading-[1.05] tracking-tightest">
          Is that claim actually sourced?
        </h1>

        <p className="mt-4 max-w-[40ch] text-[1.0625rem] leading-relaxed text-ink-2">
          Paste anything. Every claim is checked against live sources and shown with
          the exact passage and the moment it was captured. Free, no signup — powered by{' '}
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
        <ClaimInput />
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
          — free, no signup — the verdict is the receipt, not a model&rsquo;s memory.
        </p>
      </footer>
    </main>
  );
}

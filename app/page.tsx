import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { CopyButton } from '../components/CopyButton';

// Read once at module scope: this executes during the static prerender at
// build time, so the landing page stays a static route. The literal
// process.cwd() join also lets Next's output file tracing carry the raw file
// into the standalone build.
const CAESAR_SOURCE = fs.readFileSync(path.join(process.cwd(), 'lib/caesar.ts'), 'utf8');

/** The real Caesar mark (rounded charcoal chip + ivory twin-spiral) from public/favicon.svg. */
function CaesarMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/favicon.svg" alt="" aria-hidden="true" width={40} height={40} className="block" />;
}

type Demo = { href: string; name: string; description: string; sample: string; dot: string; arrow: string; hover: string };

const DEMOS: Demo[] = [
  {
    href: '/verifier',
    name: 'Verifier',
    description: 'Check any claim against live sources, with the captured passage and timestamp.',
    sample: 'The National Ignition Facility achieved fusion ignition in 2022.',
    dot: 'bg-sage', arrow: 'text-sage', hover: 'hover:border-sage hover:bg-sage-tint',
  },
  {
    href: '/research',
    name: 'Research',
    description: 'Ask anything and get a briefing — extracted facts plus a numbered, dated source list.',
    sample: 'State of fusion energy 2026',
    dot: 'bg-lilac', arrow: 'text-lilac', hover: 'hover:border-lilac hover:bg-lilac-tint',
  },
  {
    href: '/monitor',
    name: 'Monitor',
    description: 'Scan a topic and see the freshest captured items, newest first.',
    sample: 'OpenAI model releases',
    dot: 'bg-coral', arrow: 'text-coral', hover: 'hover:border-coral hover:bg-coral-tint',
  },
  {
    href: '/find',
    name: 'Finder',
    description: 'Name a product or describe it: find what it is and where to buy it, live retailer listings with capture timestamps.',
    sample: 'running shoes with individual toe slots',
    dot: 'bg-clay', arrow: 'text-clay', hover: 'hover:border-clay hover:bg-clay-tint',
  },
];

export default function Hub() {
  return (
    <main className="mx-auto w-full max-w-frame px-6">
      <section className="mx-auto max-w-measure pt-16 sm:pt-24">
        <div className="flex items-center gap-3">
          <CaesarMark />
          <h1 className="text-[clamp(2.2rem,5vw,3rem)] leading-[1.05] tracking-tightest">
            Caesar Demos
          </h1>
        </div>

        <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink-2">
          Four live demos of{' '}
          <a
            href="https://trycaesar.com"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
          >
            Caesar
          </a>{' '}
          search: verify a claim, research anything, watch a topic, find it to buy it.
          Free to try, no signup: this site brings the API key.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-measure">
        <div className="grid gap-4">
          {DEMOS.map((d, i) => (
            <Link
              key={d.href}
              href={d.href}
              className={`group cv-rise block rounded-card border border-bone bg-paper p-6 transition-colors duration-editorial ease-editorial ${d.hover}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${d.dot}`} />
                  <span className="font-display text-[1.25rem] text-ink-mark">{d.name}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`text-[1.1rem] ${d.arrow} transition-transform duration-editorial ease-editorial group-hover:translate-x-0.5`}
                >
                  →
                </span>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{d.description}</p>
              <p className="mt-3 font-mono text-[12px] leading-relaxed text-ink-2/80">{d.sample}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-measure">
        <h2 className="font-display text-[1.35rem] text-ink-mark">The whole integration is one file</h2>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
          Every demo above talks to Caesar through the same small client: one key in one env
          var (CAESAR_SEARCH_API_KEY), copy it into any project.
        </p>

        <details className="group mt-5 rounded-card border border-bone bg-paper">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span className="font-mono text-[11px] text-ink-2">
              lib/caesar.ts · ~250 lines · zero dependencies beyond the SDK
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span aria-hidden="true" className="font-mono text-[11px] text-ink-2 group-open:hidden">
                view
              </span>
              <span aria-hidden="true" className="hidden font-mono text-[11px] text-ink-2 group-open:inline">
                hide
              </span>
              <CopyButton text={CAESAR_SOURCE} />
            </span>
          </summary>
          <pre className="overflow-x-auto border-t border-bone px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-2">
            <code>{CAESAR_SOURCE}</code>
          </pre>
        </details>
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
          </a>
          . These demos are free to use, no signup: the receipt is the source, captured at a moment.
        </p>
      </footer>
    </main>
  );
}

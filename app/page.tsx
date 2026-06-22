import Link from 'next/link';

/** The real Caesar mark (rounded charcoal chip + ivory twin-spiral) from public/favicon.svg. */
function CaesarMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/favicon.svg" alt="" aria-hidden="true" width={40} height={40} className="block" />;
}

type Demo = { href: string; name: string; description: string; sample: string };

const DEMOS: Demo[] = [
  {
    href: '/verifier',
    name: 'Verifier',
    description: 'Check any claim against live sources, with the captured passage and timestamp.',
    sample: 'The National Ignition Facility achieved fusion ignition in 2022.',
  },
  {
    href: '/deep-research',
    name: 'Deep Research',
    description: 'Ask anything and get a briefing — extracted facts plus a numbered, dated source list.',
    sample: 'State of fusion energy 2026',
  },
  {
    href: '/monitor',
    name: 'Monitor',
    description: 'Scan a topic and see the freshest captured items, newest first.',
    sample: 'OpenAI model releases',
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
          Three free, no-signup demos of{' '}
          <a
            href="https://trycaesar.com"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
          >
            Caesar
          </a>{' '}
          search — verify a claim, research anything, watch a topic.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-measure">
        <div className="grid gap-4">
          {DEMOS.map((d, i) => (
            <Link
              key={d.href}
              href={d.href}
              className="group cv-rise block rounded-card border border-bone bg-paper p-6 transition-colors duration-editorial ease-editorial hover:bg-surface"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[1.25rem] text-ink-mark">{d.name}</span>
                <span
                  aria-hidden="true"
                  className="text-ink-2 transition-colors duration-editorial ease-editorial group-hover:text-ink"
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
          — free, no signup. The receipt is the source, captured at a moment.
        </p>
      </footer>
    </main>
  );
}

import Link from 'next/link';

/** The real Caesar mark (rounded charcoal chip + ivory twin-spiral) from public/favicon.svg. */
function CaesarMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/favicon.svg" alt="" aria-hidden="true" width={24} height={24} className="block" />;
}

const NAV_LINK =
  'text-ink-2 transition-colors duration-editorial ease-editorial hover:text-ink';

/** Small top nav shown on every page: the mark + the three demos, GitHub on the right. */
export function Nav() {
  return (
    <nav className="mx-auto flex w-full max-w-frame items-center gap-5 px-6 pt-6 text-[13px] sm:pt-8">
      <Link href="/" className="flex items-center gap-2" aria-label="Caesar Demos — home">
        <CaesarMark />
        <span className="font-display text-[15px] text-ink-mark">Caesar Demos</span>
      </Link>

      <div className="ml-auto flex items-center gap-4 sm:gap-5">
        <Link href="/verifier" className={NAV_LINK}>Verifier</Link>
        <Link href="/research" className={NAV_LINK}>Research</Link>
        <Link href="/monitor" className={NAV_LINK}>Monitor</Link>
        <Link href="/find" className={NAV_LINK}>Finder</Link>
        <a
          href="https://github.com/TF-Caesar"
          target="_blank"
          rel="noreferrer"
          className={`${NAV_LINK} hidden sm:inline`}
        >
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}

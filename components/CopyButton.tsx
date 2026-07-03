'use client';

import { useRef, useState } from 'react';

/** Small clipboard pill for the source card: flips copy to copied briefly. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <button
      type="button"
      aria-label="Copy lib/caesar.ts to the clipboard"
      onClick={(e) => {
        // Lives inside a <summary>: keep the click from toggling the card.
        e.preventDefault();
        e.stopPropagation();
        const clipboard = navigator.clipboard;
        if (!clipboard) return;
        clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      className="rounded-pill border border-hairline bg-surface px-3 py-1 font-mono text-[11px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-bone hover:text-ink"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

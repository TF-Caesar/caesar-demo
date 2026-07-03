// Pure helpers for the Open Graph card route and per-page share metadata.
// No Next imports: safe to unit-test in plain node and to reuse from both
// the /api/og route and each page's generateMetadata.

/** Page ids the OG card route knows how to draw. 'hub' is the landing page. */
export const OG_PAGES = ['verifier', 'research', 'monitor', 'find', 'hub'] as const;
export type OgPage = (typeof OG_PAGES)[number];

/** Hard cap for user text on a card: enough for a long claim, short of abuse. */
export const OG_TEXT_MAX = 140;

/** Per-page card copy. Accents mirror the demo dot colors in app/globals.css. */
export const OG_COPY: Record<OgPage, { label: string; title: string; accent: string }> = {
  verifier: { label: 'Verifier', title: 'Is that claim actually sourced?', accent: '#5F7C5F' },
  research: { label: 'Research', title: 'Research anything, with receipts.', accent: '#6E5F8A' },
  monitor: { label: 'Monitor', title: 'What is new on a topic, right now.', accent: '#F97554' },
  find: { label: 'Finder', title: 'Find the product, and where to buy it.', accent: '#7A6F66' },
  hub: { label: 'Four demos', title: 'Free search, four ways.', accent: '#333230' },
};

/** Exact-match a page id from a query param; anything else falls back to hub. */
export function parseOgPage(value: string | null | undefined): OgPage {
  return (OG_PAGES as readonly string[]).includes(value ?? '') ? (value as OgPage) : 'hub';
}

// Control characters (C0 + DEL + C1), zero-width and direction marks, BOM, and
// Unicode line/paragraph separators: anything that could smuggle structure or
// invisible content onto a rendered card. Each becomes a plain space below.
const INVISIBLES = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Sanitize user text for a card headline: flatten control and zero-width
 * characters to spaces, collapse whitespace runs, trim, and clamp to
 * OG_TEXT_MAX characters with a single ellipsis.
 */
export function clampOgText(value: string | null | undefined): string {
  if (!value) return '';
  const flat = value.replace(INVISIBLES, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= OG_TEXT_MAX) return flat;
  return `${flat.slice(0, OG_TEXT_MAX - 1).trimEnd()}…`;
}

/** Same-origin OG image path for a page, with the q text clamped and encoded. */
export function ogImageUrl(page: OgPage, q?: string | null): string {
  const params = new URLSearchParams({ page });
  const text = clampOgText(q);
  if (text) params.set('q', text);
  return `/api/og?${params.toString()}`;
}

/** Unwrap a Next searchParams value: first entry of an array, null if absent. */
export function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

/** A demo page id: every OG page except the landing hub. */
export type DemoPage = Exclude<OgPage, 'hub'>;

// Per-page share copy. `deepTitle`/`deepDescription` shape the unfurl for a
// shared deep link that carries the visitor's text; the static pair covers
// the bare page. Kept here (not in the pages) so all four read identically.
const SHARE_COPY: Record<
  DemoPage,
  {
    title: string;
    description: string;
    deepTitle: (q: string) => string;
    deepDescription: (q: string) => string;
  }
> = {
  verifier: {
    title: 'Caesar Verifier: is that claim actually sourced?',
    description:
      'Paste any claim. Caesar checks it against live sources and shows the exact passage with the moment it was captured. Free, no signup.',
    deepTitle: (q) => `VERIFIED or not: ${q} · Caesar Verifier`,
    deepDescription: (q) =>
      `Live source check for "${q}": the verdict, the exact passage, and the capture timestamp. Free, no signup.`,
  },
  research: {
    title: 'Caesar Research: any question, answered with receipts',
    description:
      'Ask a question. Caesar reads the live sources and returns a short briefing: the facts, then a numbered, dated source list. Free, no signup.',
    deepTitle: (q) => `Briefing: ${q} · Caesar Research`,
    deepDescription: (q) =>
      `A short briefing on "${q}": extracted facts plus a numbered, dated list of live sources. Free, no signup.`,
  },
  monitor: {
    title: 'Caesar Monitor: what is new on a topic, right now',
    description:
      'Name a topic. Caesar scans the live web and surfaces the most recently captured items, newest first, each with a source link and timestamp. Free, no signup.',
    deepTitle: (q) => `What's new: ${q} · Caesar Monitor`,
    deepDescription: (q) =>
      `The freshest captured items on "${q}", newest first, each with a source link and the moment it was captured. Free, no signup.`,
  },
  find: {
    title: 'Caesar Finder: find the product, and where to buy it',
    description:
      'Name it or describe it. Caesar reads live retailer listings and shows what it is and where to buy it, each with a capture timestamp. Free, no signup.',
    deepTitle: (q) => `Find it: ${q} · Caesar Finder`,
    deepDescription: (q) =>
      `What "${q}" is and where to buy it: live retailer listings with capture timestamps. Free, no signup.`,
  },
};

/**
 * Share metadata for a demo page, with or without deep-link text. The shape is
 * structurally compatible with Next's Metadata type; this module stays free of
 * Next imports so it unit-tests in plain node.
 */
export function demoShareMeta(page: DemoPage, qRaw: string | null | undefined) {
  const q = clampOgText(qRaw);
  const copy = SHARE_COPY[page];
  const title = q ? copy.deepTitle(q) : copy.title;
  const description = q ? copy.deepDescription(q) : copy.description;
  const image = ogImageUrl(page, q);
  return {
    title,
    description,
    openGraph: {
      siteName: 'Caesar Demos',
      type: 'website' as const,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [image],
    },
  };
}

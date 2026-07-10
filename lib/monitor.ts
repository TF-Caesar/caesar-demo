import { CaesarClient } from './caesar';
import { demoModeEnabled } from './orchestrate';

export interface FreshnessItem {
  title: string;
  url: string;
  captureTime?: string;
  /** Best-effort page publish time from Caesar; absent on many pages. */
  publishedAt?: string;
}

export interface FreshnessResult {
  topic: string;
  items: FreshnessItem[];
  degraded: boolean;
}

/**
 * Freshness radar: search a topic, read the top sources, and surface the most
 * recently captured items (newest first), de-duplicated by URL.
 *
 * Needs a server-side Caesar key (CAESAR_SEARCH_API_KEY). If demo mode is on
 * (VERIFIER_DEMO=1) OR anything throws (including an unconfigured key),
 * returns a baked demo scan (degraded:true) so the hosted demo never blanks.
 */
export async function runFreshnessScan(
  topic: string,
  deps: { client?: CaesarClient } = {},
): Promise<FreshnessResult> {
  const t = topic.trim();
  if (demoModeEnabled()) return demoScan(t);
  const client = deps.client ?? new CaesarClient();
  try {
    const { citations } = await client.searchAndRead(t, { maxResults: 12, readTopN: 6 });
    const seen = new Set<string>();
    const items: FreshnessItem[] = [];
    for (const c of citations) {
      const url = c.canonicalUrl;
      // searchAndRead emits a citation per search hit but reads only readTopN.
      // A freshness radar must show only items we actually READ and captured —
      // never an unread search-only hit with no capture moment.
      if (!url || !c.captureTime || seen.has(url)) continue;
      seen.add(url);
      items.push({ title: (c.title || url || 'Untitled').trim(), url, captureTime: c.captureTime, publishedAt: c.publishedAt });
    }
    // Newest first by the page's own publish time when Caesar surfaced one
    // (best-effort), else our capture moment; items with neither parseable
    // sort to the end.
    const effectiveTime = (i: FreshnessItem): number => {
      const published = i.publishedAt ? Date.parse(i.publishedAt) : NaN;
      if (!Number.isNaN(published)) return published;
      return i.captureTime ? Date.parse(i.captureTime) : NaN;
    };
    items.sort((a, b) => {
      const ta = effectiveTime(a);
      const tb = effectiveTime(b);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });
    if (items.length === 0) return demoScan(t);
    return { topic: t, items, degraded: false };
  } catch {
    return demoScan(t);
  }
}

/** Shown when live search is unavailable (and in VERIFIER_DEMO mode). */
function demoScan(topic: string): FreshnessResult {
  // Demo capture times are relative so the fallback never displays months-old
  // "freshness": a freshness radar with stale timestamps would refute itself.
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    topic: topic || 'OpenAI model releases',
    degraded: true,
    // Published times sit a bit before their captures (a page exists before we
    // read it); the vendor index page has none, since publish dates are
    // best-effort and landing pages rarely carry one.
    items: [
      { title: 'OpenAI announces its newest flagship model — OpenAI', url: 'https://openai.com/index/', captureTime: minutesAgo(14) },
      { title: 'What the latest OpenAI release means for developers — The Verge', url: 'https://www.theverge.com/openai', captureTime: minutesAgo(103), publishedAt: minutesAgo(140) },
      { title: 'OpenAI updates its API pricing and rate limits — TechCrunch', url: 'https://techcrunch.com/tag/openai/', captureTime: minutesAgo(60 * 16), publishedAt: minutesAgo(60 * 18) },
      { title: 'Benchmarks for the new OpenAI model — Ars Technica', url: 'https://arstechnica.com/ai/', captureTime: minutesAgo(60 * 20), publishedAt: minutesAgo(60 * 23) },
    ],
  };
}

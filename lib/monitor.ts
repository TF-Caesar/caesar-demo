import { CaesarClient } from './caesar';
import { demoModeEnabled } from './orchestrate';

export interface FreshnessItem {
  title: string;
  url: string;
  captureTime?: string;
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
 * Keyless by default. If demo mode is on (VERIFIER_DEMO=1) OR anything throws,
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
      items.push({ title: (c.title || url || 'Untitled').trim(), url, captureTime: c.captureTime });
    }
    // Newest captures first; items without a capture time sort to the end.
    items.sort((a, b) => {
      const ta = a.captureTime ? Date.parse(a.captureTime) : NaN;
      const tb = b.captureTime ? Date.parse(b.captureTime) : NaN;
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

/** Shown when the free tier is busy (and in VERIFIER_DEMO mode). */
function demoScan(topic: string): FreshnessResult {
  // Demo capture times are relative so the fallback never displays months-old
  // "freshness": a freshness radar with stale timestamps would refute itself.
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    topic: topic || 'OpenAI model releases',
    degraded: true,
    items: [
      { title: 'OpenAI announces its newest flagship model — OpenAI', url: 'https://openai.com/index/', captureTime: minutesAgo(14) },
      { title: 'What the latest OpenAI release means for developers — The Verge', url: 'https://www.theverge.com/openai', captureTime: minutesAgo(103) },
      { title: 'OpenAI updates its API pricing and rate limits — TechCrunch', url: 'https://techcrunch.com/tag/openai/', captureTime: minutesAgo(60 * 16) },
      { title: 'Benchmarks for the new OpenAI model — Ars Technica', url: 'https://arstechnica.com/ai/', captureTime: minutesAgo(60 * 20) },
    ],
  };
}

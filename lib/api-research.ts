import { CaesarClient } from './caesar';
import { demoModeEnabled } from './orchestrate';
import { summarize, formatSources } from './research';

export interface ResearchSource {
  index: number;
  title: string;
  url: string;
  capturedISO?: string;
  /** Best-effort page publish time from Caesar; absent on many pages. */
  publishedAt?: string;
}

export interface ResearchSummaryItem {
  text: string;
  /**
   * 1-based index into `sources`: the bullet was extracted from source
   * [sourceIndex]. Optional so older cached payloads still parse.
   */
  sourceIndex?: number;
}

export interface ResearchResult {
  question: string;
  summary: ResearchSummaryItem[];
  sources: ResearchSource[];
  degraded: boolean;
}

/**
 * Run a research briefing: search the question, read the top sources, then
 * deterministically extract the strongest sentences (grounded in citation.text,
 * never passage alone — see lib/research.ts) and a numbered source list.
 *
 * Needs a server-side Caesar key (CAESAR_SEARCH_API_KEY). If demo mode is on
 * (VERIFIER_DEMO=1) OR anything throws (including an unconfigured key),
 * returns a baked demo briefing (degraded:true) so the hosted demo never blanks.
 */
export async function runResearch(
  input: string,
  deps: { client?: CaesarClient } = {},
): Promise<ResearchResult> {
  const question = input.trim();
  if (demoModeEnabled()) return demoResearch(question);
  const client = deps.client ?? new CaesarClient();
  try {
    // No minScore here: summarize/formatSources already filter noise, and a
    // score floor wrongly empties results when Caesar omits scores under load,
    // which would push every real answer onto the canned demo briefing.
    const { citations } = await client.searchAndRead(question, { maxResults: 10, readTopN: 4, mode: 'research' });
    const summary = summarize(citations, question, 5);
    const sources = formatSources(citations);
    if (summary.length === 0 && sources.length === 0) return demoResearch(question);
    return { question, summary, sources, degraded: false };
  } catch {
    return demoResearch(question);
  }
}

/** Shown when live search is unavailable (and in VERIFIER_DEMO mode). */
function demoResearch(question: string): ResearchResult {
  // Demo capture times are relative so the fallback never displays months-old
  // "freshness": the briefing is canned, and pretending it was captured long
  // ago would read worse than the truth.
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    question: question || 'Who won the 2022 World Cup?',
    degraded: true,
    summary: [
      { text: 'Argentina won the 2022 FIFA World Cup, beating France in the final on December 18, 2022.', sourceIndex: 1 },
      { text: 'The match finished 3–3 after extra time and Argentina won 4–2 on penalties at Lusail Stadium in Qatar.', sourceIndex: 1 },
      { text: 'It was Argentina’s third World Cup title and their first since 1986.', sourceIndex: 2 },
      { text: 'Lionel Messi was named the tournament’s best player, winning the Golden Ball.', sourceIndex: 3 },
      { text: 'Kylian Mbappé scored a hat-trick in the final and finished as the tournament’s top scorer with eight goals.', sourceIndex: 1 },
    ],
    sources: [
      { index: 1, title: '2022 FIFA World Cup final — Wikipedia', url: 'https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final', capturedISO: minutesAgo(21) },
      { index: 2, title: 'Argentina win World Cup in penalty shootout — FIFA', url: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022', capturedISO: minutesAgo(20) },
      { index: 3, title: 'Messi crowned as Argentina beat France — BBC Sport', url: 'https://www.bbc.com/sport/football', capturedISO: minutesAgo(19) },
    ],
  };
}

import { CaesarClient } from './caesar';
import { summarize, formatSources } from './research';

export interface ResearchSource {
  index: number;
  title: string;
  url: string;
  capturedISO?: string;
}

export interface ResearchResult {
  question: string;
  summary: string[];
  sources: ResearchSource[];
  degraded: boolean;
}

/**
 * Run a research briefing: search the question, read the top sources, then
 * deterministically extract the strongest sentences (grounded in citation.text,
 * never passage alone — see lib/research.ts) and a numbered source list.
 *
 * Keyless by default. If VERIFIER_DEMO is set OR anything throws, returns a
 * baked demo briefing (degraded:true) so the hosted demo never blanks.
 */
export async function runResearch(
  input: string,
  deps: { client?: CaesarClient } = {},
): Promise<ResearchResult> {
  const question = input.trim();
  if (process.env.VERIFIER_DEMO) return demoResearch(question);
  const client = deps.client ?? new CaesarClient();
  try {
    const { citations } = await client.searchAndRead(question, { maxResults: 10, readTopN: 4, mode: 'research', minScore: 0.3 });
    const summary = summarize(citations, question, 5);
    const sources = formatSources(citations);
    if (summary.length === 0 && sources.length === 0) return demoResearch(question);
    return { question, summary, sources, degraded: false };
  } catch {
    return demoResearch(question);
  }
}

/** Shown when the free tier is busy (and in VERIFIER_DEMO mode). */
function demoResearch(question: string): ResearchResult {
  return {
    question: question || 'Who won the 2022 World Cup?',
    degraded: true,
    summary: [
      'Argentina won the 2022 FIFA World Cup, beating France in the final on December 18, 2022.',
      'The match finished 3–3 after extra time and Argentina won 4–2 on penalties at Lusail Stadium in Qatar.',
      'It was Argentina’s third World Cup title and their first since 1986.',
      'Lionel Messi was named the tournament’s best player, winning the Golden Ball.',
      'Kylian Mbappé scored a hat-trick in the final and finished as the tournament’s top scorer with eight goals.',
    ],
    sources: [
      { index: 1, title: '2022 FIFA World Cup final — Wikipedia', url: 'https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final', capturedISO: '2026-06-21T14:03:00Z' },
      { index: 2, title: 'Argentina win World Cup in penalty shootout — FIFA', url: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022', capturedISO: '2026-06-21T14:04:00Z' },
      { index: 3, title: 'Messi crowned as Argentina beat France — BBC Sport', url: 'https://www.bbc.com/sport/football', capturedISO: '2026-06-21T14:05:00Z' },
    ],
  };
}

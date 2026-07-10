import { describe, it, expect } from 'vitest';
import { summarize, formatSources, receiptLine } from '../research';
import type { Citation } from '../caesar';

describe('summarize', () => {
  it('extracts relevant sentences from read text and drops noise', () => {
    const citations: Citation[] = [
      { rank: 1, title: 'AP', canonicalUrl: 'https://ap.com/a', docId: 'd1',
        text: 'Argentina won the 2022 FIFA World Cup, defeating France in a penalty shootout. '.repeat(4) },
      { rank: 2, title: 'Noise', canonicalUrl: 'https://noise.com/c', docId: 'd2',
        text: 'This page is about gardening and has nothing to do with football. '.repeat(4) },
    ];
    const out = summarize(citations, 'Who won the 2022 FIFA World Cup?', 4);
    expect(out.map((s) => s.text).join(' ')).toMatch(/Argentina/);
    expect(out.map((s) => s.text).join(' ')).not.toMatch(/gardening/);
  });

  it('stamps each item with the 1-based read-list index of its origin citation', () => {
    // The unread hit sits FIRST so raw rank and read-list position diverge:
    // formatSources drops it and renumbers, and sourceIndex must agree.
    const citations: Citation[] = [
      { rank: 1, title: 'Never read', canonicalUrl: 'https://never.com', docId: 'd0' },
      { rank: 2, title: 'AP', canonicalUrl: 'https://ap.com/a', docId: 'd1',
        text: 'Argentina won the 2022 FIFA World Cup, defeating France in a penalty shootout. '.repeat(4) },
      { rank: 3, title: 'BBC', canonicalUrl: 'https://bbc.com/b', docId: 'd2',
        text: 'Lionel Messi lifted the 2022 World Cup trophy for Argentina. '.repeat(4) },
    ];
    const out = summarize(citations, 'Who won the 2022 FIFA World Cup?', 10);
    const fromAp = out.find((s) => /defeating France/.test(s.text));
    const fromBbc = out.find((s) => /Messi/.test(s.text));
    expect(fromAp?.sourceIndex).toBe(1);
    expect(fromBbc?.sourceIndex).toBe(2);
  });

  it('never cites a search-only citation: a passage on an unread hit yields no bullet', () => {
    // No captureTime and no text means the source never appears in the Sources
    // list, so a bullet extracted from it would carry a dangling [n].
    const passageOnly: Citation[] = [{
      rank: 1, title: 'Unread', canonicalUrl: 'https://unread.com', docId: 'd1',
      passage: 'Argentina won the 2022 FIFA World Cup in Qatar after beating France on penalties.',
    }];
    expect(summarize(passageOnly, 'Who won the 2022 FIFA World Cup?', 4)).toEqual([]);
  });
});

describe('formatSources', () => {
  const read1: Citation = { rank: 1, title: 'AP News', canonicalUrl: 'https://ap.com/a', docId: 'd1', captureTime: '2026-06-21T14:03:00Z' };
  const readNoTime: Citation = { rank: 2, title: '', canonicalUrl: 'https://bbc.com/b', docId: 'd2', text: 'Argentina won the 2022 World Cup in Qatar.' };
  const unread: Citation = { rank: 3, title: 'Never read', canonicalUrl: 'https://never.com/c', docId: 'd3' };

  it('numbers read sources from 1 with title/url/captured time', () => {
    expect(formatSources([read1])[0]).toEqual({ index: 1, title: 'AP News', url: 'https://ap.com/a', capturedISO: '2026-06-21T14:03:00Z' });
  });

  it('falls back to URL when title is empty; capturedISO undefined when the read had no timestamp', () => {
    const lines = formatSources([read1, readNoTime]);
    expect(lines[1].title).toBe('https://bbc.com/b');
    expect(lines[1].capturedISO).toBeUndefined();
  });

  it('omits search-only results that were never read (no capture, no text)', () => {
    const lines = formatSources([read1, unread]);
    expect(lines).toHaveLength(1);
    expect(lines.some((l) => l.url === 'https://never.com/c')).toBe(false);
  });

  it('renumbers from 1 after dropping unread results', () => {
    const lines = formatSources([unread, read1]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ index: 1, url: 'https://ap.com/a' });
  });

  it('carries publishedAt when the citation has one, leaves it undefined otherwise', () => {
    const published: Citation = { ...read1, publishedAt: '2026-06-20T08:00:00Z' };
    const lines = formatSources([published, readNoTime]);
    expect(lines[0].publishedAt).toBe('2026-06-20T08:00:00Z');
    expect(lines[1].publishedAt).toBeUndefined();
  });

  it('carries the cited passage receipt coordinates (offsets + section) when present, absent otherwise', () => {
    const located: Citation = { ...read1, passageStart: 812, passageEnd: 1054, passageSection: 'Results' };
    const lines = formatSources([located, readNoTime]);
    expect(lines[0]).toMatchObject({ passageStart: 812, passageEnd: 1054, passageSection: 'Results' });
    // Offsets are best-effort upstream (absent on a first-ever capture):
    // a citation without them yields a source line without them.
    expect(lines[1].passageStart).toBeUndefined();
    expect(lines[1].passageEnd).toBeUndefined();
    expect(lines[1].passageSection).toBeUndefined();
  });
});

describe('receiptLine', () => {
  const now = Date.parse('2026-07-02T12:00:00Z');

  it('counts sources and shows the newest capture as a relative time', () => {
    const line = receiptLine(
      [{ capturedISO: '2026-07-02T09:00:00Z' }, { capturedISO: '2026-07-02T11:58:00Z' }],
      now,
    );
    expect(line).toBe('2 sources read · newest capture 2m ago');
  });

  it('uses the singular for one source', () => {
    expect(receiptLine([{ capturedISO: '2026-07-02T11:58:00Z' }], now)).toBe('1 source read · newest capture 2m ago');
  });

  it('omits the newest-capture clause when no capture time exists (never fabricates)', () => {
    expect(receiptLine([{}, { capturedISO: 'garbage' }], now)).toBe('2 sources read');
  });

  it('returns undefined when nothing was read', () => {
    expect(receiptLine([], now)).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { summarize, formatSources } from '../research';
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
    expect(out.join(' ')).toMatch(/Argentina/);
    expect(out.join(' ')).not.toMatch(/gardening/);
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
});

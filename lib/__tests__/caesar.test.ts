import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchMock = vi.fn();
const readMock = vi.fn();
const feedbackMock = vi.fn();
vi.mock('caesar-search', () => ({
  Caesar: vi.fn().mockImplementation(() => ({ search: searchMock, read: readMock, feedback: feedbackMock })),
}));

import { CaesarClient } from '../caesar';

beforeEach(() => { searchMock.mockReset(); readMock.mockReset(); feedbackMock.mockReset(); });

describe('CaesarClient.search', () => {
  it('normalizes snake_case results to camelCase', async () => {
    searchMock.mockResolvedValue({ search_id: 's1', results: [{ rank: 1, title: 'T', canonical_url: 'https://x.com/a', doc_id: 'd1', snippet: 'snip' }] });
    const r = await new CaesarClient().search('q', { maxResults: 5 });
    expect(r.searchId).toBe('s1');
    expect(r.results[0]).toEqual({ rank: 1, title: 'T', canonicalUrl: 'https://x.com/a', docId: 'd1', snippet: 'snip' });
  });
  it('passes domain + freshness filters via extraBody', async () => {
    searchMock.mockResolvedValue({ results: [] });
    await new CaesarClient().search('q', { includeDomains: ['a.com'], publishedAfter: '2026-01-01' });
    const [, opts] = searchMock.mock.calls[0];
    expect(opts.extraBody.source_policy.include_domains).toEqual(['a.com']);
    expect(opts.extraBody.freshness_policy.published_after).toBe('2026-01-01');
  });
});

describe('CaesarClient.read', () => {
  it('returns text, passages, and provenance', async () => {
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/a' },
      content: { text: 'full text' },
      passages: [{ passage_id: 'p1', text: 'a passage' }],
      provenance: { capture_id: 'cap1', capture_time: '2026-06-21T14:03:00Z' },
    });
    const d = await new CaesarClient().read('https://x.com/a', { query: 'q' });
    expect(d.text).toBe('full text');
    expect(d.passages[0]).toEqual({ passageId: 'p1', text: 'a passage' });
    expect(d.captureTime).toBe('2026-06-21T14:03:00Z');
  });
});

describe('CaesarClient.searchAndRead', () => {
  it('assembles citations with passages + provenance', async () => {
    searchMock.mockResolvedValue({ search_id: 's1', results: [{ rank: 1, title: 'T1', canonical_url: 'https://x.com/1', doc_id: 'd1', snippet: 's1' }] });
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/1' },
      content: { text: 'long body '.repeat(40) },
      passages: [{ passage_id: 'p1', text: 'cited passage' }],
      provenance: { capture_id: 'cap1', capture_time: '2026-06-21T14:03:00Z' },
    });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 1 });
    expect(r.citations[0].passage).toBe('cited passage');
    expect(r.citations[0].captureTime).toBe('2026-06-21T14:03:00Z');
    expect(r.evidence).toContain('https://x.com/1');
  });
  it('tolerates a read failure without throwing', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'T', canonical_url: 'https://x.com/1', doc_id: 'd1', snippet: 'snip' }] });
    readMock.mockRejectedValue(new Error('429'));
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 1 });
    expect(r.citations[0].canonicalUrl).toBe('https://x.com/1');
    expect(r.citations[0].passage).toBeUndefined();
  });

  it('minScore drops null/missing-score and low-score results, keeps scored ones', async () => {
    searchMock.mockResolvedValue({ search_id: 's1', results: [
      { rank: 1, title: 'good', canonical_url: 'https://a.com', doc_id: 'd1', snippet: 's', score: { value: 0.9 } },
      { rank: 2, title: 'unscored (gibberish)', canonical_url: 'https://b.com', doc_id: 'd2', snippet: 's' },
      { rank: 3, title: 'weak', canonical_url: 'https://c.com', doc_id: 'd3', snippet: 's', score: { value: 0.1 } },
    ] });
    readMock.mockResolvedValue({ doc: { doc_id: 'd1', canonical_url: 'https://a.com' }, content: { text: 'body' }, passages: [], provenance: { capture_id: 'c', capture_time: 't' } });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 5, minScore: 0.3 });
    expect(r.citations.map((c) => c.canonicalUrl)).toEqual(['https://a.com']);
  });

  it('keeps all results (including unscored) when no minScore is set', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'x', canonical_url: 'https://a.com', doc_id: 'd1', snippet: 's' }] });
    readMock.mockResolvedValue({ content: { text: '' }, passages: [] });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 5 });
    expect(r.citations).toHaveLength(1);
  });
});

describe('provenance metadata (published_at, content_digest, rate limit)', () => {
  it('search normalizes per-result published/digest metadata and the response rate limit', async () => {
    searchMock.mockResolvedValue({
      search_id: 's1',
      access: { tier: 'anonymous', rate_limit: { limit_rps: 30, remaining: 12, reset_at: '2026-07-02T23:14:22Z' } },
      results: [{
        rank: 1, title: 'T', canonical_url: 'https://x.com/a', doc_id: 'd1', snippet: 's',
        score: { value: 0.9 },
        metadata: { published_at: '2026-06-28T11:02:17Z', content_digest: 'sha256:abc', last_crawled_at: '2026-07-02T00:00:00Z' },
      }],
    });
    const r = await new CaesarClient().search('q');
    expect(r.results[0].publishedAt).toBe('2026-06-28T11:02:17Z');
    expect(r.results[0].contentDigest).toBe('sha256:abc');
    expect(r.tier).toBe('anonymous');
    expect(r.rateLimit).toEqual({ limitRps: 30, remaining: 12, resetAt: '2026-07-02T23:14:22Z' });
  });

  it('searchAndRead citations carry publishedAt/contentDigest and the picked passage id', async () => {
    searchMock.mockResolvedValue({
      search_id: 's1',
      access: { tier: 'anonymous', rate_limit: { limit_rps: 30, remaining: 5, reset_at: 'r' } },
      results: [{
        rank: 1, title: 'T1', canonical_url: 'https://x.com/1', doc_id: 'd1', snippet: 's1',
        metadata: { published_at: '2026-06-01T00:00:00Z', content_digest: 'sha256:def' },
      }],
    });
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/1' },
      content: { text: 'long body '.repeat(40) },
      passages: [
        { passage_id: 'p-miss', text: 'unrelated filler about nothing' },
        { passage_id: 'p-hit', text: 'the quantum computer milestone announcement' },
      ],
      provenance: { capture_id: 'cap1', capture_time: '2026-06-21T14:03:00Z' },
    });
    const r = await new CaesarClient().searchAndRead('quantum computer milestone', { readTopN: 1 });
    expect(r.citations[0].publishedAt).toBe('2026-06-01T00:00:00Z');
    expect(r.citations[0].contentDigest).toBe('sha256:def');
    expect(r.citations[0].passage).toBe('the quantum computer milestone announcement');
    expect(r.citations[0].passageId).toBe('p-hit');
    expect(r.tier).toBe('anonymous');
    expect(r.rateLimit?.remaining).toBe(5);
  });
});

describe('CaesarClient.feedback', () => {
  it('sends fire-and-forget feedback with snake_case ids', async () => {
    feedbackMock.mockResolvedValue({ feedback_id: 'f1' });
    new CaesarClient().sendFeedback({ eventType: 'passage_used', searchId: 's1', docId: 'd1', passageId: 'p1', rank: 2 });
    // fire-and-forget: give the microtask a tick, then assert the SDK call
    await new Promise((r) => setTimeout(r, 0));
    expect(feedbackMock).toHaveBeenCalledWith('passage_used', {
      search_id: 's1', doc_id: 'd1', passage_id: 'p1', rank: 2,
    });
  });

  it('swallows feedback failures (never throws, never rejects unhandled)', async () => {
    feedbackMock.mockRejectedValue(new Error('503'));
    expect(() => new CaesarClient().sendFeedback({ eventType: 'passage_used', docId: 'd1' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection here would fail the test run
  });
});

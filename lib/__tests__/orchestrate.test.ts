import { describe, it, expect, vi } from 'vitest';
import { runVerification } from '../orchestrate';
import { CaesarClient } from '../caesar';

function fakeClient(over: Partial<CaesarClient>): CaesarClient {
  return Object.assign(Object.create(CaesarClient.prototype), over) as CaesarClient;
}

describe('runVerification', () => {
  it('verifies a claim against a captured passage', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
        }],
      }),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.degraded).toBe(false);
    expect(out.claims[0].verdict).toBe('VERIFIED');
    expect(out.claims[0].source?.captureTime).toBe('2026-06-21T14:03:00Z');
  });

  it('grounds against full read text when no structured passage is present', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'LLNL', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          text: 'Intro paragraph. On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time. More text.',
        }],
      }),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.claims[0].verdict).toBe('VERIFIED');
    expect(out.claims[0].passage).toContain('2022');
  });

  it('grounds against the structured passage when read text is empty', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          text: '', // read returned no content.text, but a real passage IS present
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time.',
        }],
      }),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.claims[0].verdict).toBe('VERIFIED');
    expect(out.claims[0].source?.url).toBe('https://llnl.gov/a');
  });

  it('reads a pasted URL and verifies claims from the page, not the URL string', async () => {
    const read = vi.fn().mockResolvedValue({
      docId: 'd0', canonicalUrl: 'https://llnl.gov/news/nif', passages: [],
      text: 'The National Ignition Facility achieved fusion ignition in 2022. The lab sits in Livermore, California.',
    });
    const searchAndRead = vi.fn().mockResolvedValue({
      evidence: 'x',
      citations: [{
        rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
        captureTime: '2026-06-21T14:03:00Z',
        passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
      }],
    });
    const client = fakeClient({ read, searchAndRead });
    const out = await runVerification('https://llnl.gov/news/nif', { client });
    expect(read).toHaveBeenCalledWith('https://llnl.gov/news/nif', expect.anything());
    // claims must come from the PAGE text — the first thing searched is not the URL
    expect(searchAndRead).toHaveBeenCalled();
    expect(String(searchAndRead.mock.calls[0][0])).not.toMatch(/^https?:/);
    expect(out.claims.length).toBeGreaterThan(0);
  });

  it('does NOT read a private/metadata URL (SSRF guard)', async () => {
    const read = vi.fn();
    const searchAndRead = vi.fn().mockResolvedValue({ evidence: '', citations: [] });
    const client = fakeClient({ read, searchAndRead });
    await runVerification('http://169.254.169.254/latest/meta-data/', { client });
    expect(read).not.toHaveBeenCalled();
  });

  it('labels subjective/comparative claims as OPINION (not VERIFIED)', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'Why JS is better than Python', canonicalUrl: 'https://x.com/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          text: 'Some developers argue JavaScript is better than Python for web work.',
        }],
      }),
    });
    const out = await runVerification('Python is better than JavaScript.', { client });
    expect(out.claims[0].verdict).toBe('OPINION');
    expect(out.claims[0].source?.url).toBe('https://x.com/a');
  });

  it('degrades to a demo response when Caesar throws', async () => {
    const client = fakeClient({ searchAndRead: vi.fn().mockRejectedValue(new Error('429')) });
    const out = await runVerification('some claim about Tesla in 2023', { client });
    expect(out.degraded).toBe(true);
    expect(out.claims.length).toBeGreaterThan(0);
  });
});

describe('receipt plumbing', () => {
  it('carries score, publishedAt, captureId, passageId and envelope tier from the grounded citation', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-1', tier: 'anonymous',
        citations: [{
          rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureId: 'cap-11112222', captureTime: '2026-06-21T14:03:00Z',
          passageId: 'psg-aaaabbbb', score: 0.9134, publishedAt: '2022-12-05T08:00:00Z',
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
        }],
      }),
      sendFeedback: vi.fn(),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.tier).toBe('anonymous');
    const r = out.claims[0];
    expect(r.verdict).toBe('VERIFIED');
    expect(r.score).toBe(0.9134);
    expect(r.publishedAt).toBe('2022-12-05T08:00:00Z');
    expect(r.captureId).toBe('cap-11112222');
    expect(r.passageId).toBe('psg-aaaabbbb');
  });

  it('takes receipt fields from the citation that grounded the verdict, not citations[0]', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-1', tier: 'anonymous',
        citations: [
          {
            rank: 1, title: 'Gardening weekly', canonicalUrl: 'https://a.example/x', docId: 'dA',
            captureId: 'cap-AAAAAAAA', score: 0.99, publishedAt: '2020-01-01T00:00:00Z',
            text: 'A page about pruning roses in late spring.',
          },
          {
            rank: 2, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'dB',
            captureId: 'cap-BBBBBBBB', score: 0.42, publishedAt: '2022-12-06T00:00:00Z',
            passageId: 'psg-BBBBBBBB', captureTime: '2026-06-21T14:03:00Z',
            passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
          },
        ],
      }),
      sendFeedback: vi.fn(),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    const r = out.claims[0];
    expect(r.verdict).toBe('VERIFIED');
    expect(r.source?.url).toBe('https://llnl.gov/a');
    expect(r.captureId).toBe('cap-BBBBBBBB');
    expect(r.score).toBe(0.42);
    expect(r.publishedAt).toBe('2022-12-06T00:00:00Z');
    expect(r.passageId).toBe('psg-BBBBBBBB');
  });

  it('omits passageId when the quote fell back to a text snippet, other receipt fields still flow', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-1', tier: 'anonymous',
        citations: [{
          rank: 1, title: 'LLNL', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureId: 'cap-11112222', captureTime: '2026-06-21T14:03:00Z', score: 0.8,
          text: 'Intro paragraph. On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time. More text.',
        }],
      }),
      sendFeedback: vi.fn(),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    const r = out.claims[0];
    expect(r.verdict).toBe('VERIFIED');
    expect(r.passageId).toBeUndefined();
    expect(r.captureId).toBe('cap-11112222');
    expect(r.score).toBe(0.8);
  });

  it('carries passage offsets and section heading alongside a pinned passage', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-1',
        citations: [{
          rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureId: 'cap-11112222', captureTime: '2026-06-21T14:03:00Z',
          passageId: 'psg-aaaabbbb', passageStart: 812, passageEnd: 1054, passageSection: 'Ignition results',
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
        }],
      }),
      sendFeedback: vi.fn(),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    const r = out.claims[0];
    expect(r.verdict).toBe('VERIFIED');
    expect(r.passageStart).toBe(812);
    expect(r.passageEnd).toBe(1054);
    expect(r.passageSection).toBe('Ignition results');
  });

  it('omits offsets and section when the quote fell back to a text snippet (no pinned passage)', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-1',
        citations: [{
          rank: 1, title: 'LLNL', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureId: 'cap-11112222', captureTime: '2026-06-21T14:03:00Z',
          // Coordinates on the citation, but no pinned passage: a snippet
          // fallback has no capture coordinates to claim.
          passageStart: 10, passageEnd: 90, passageSection: 'Intro',
          text: 'Intro paragraph. On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time. More text.',
        }],
      }),
      sendFeedback: vi.fn(),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    const r = out.claims[0];
    expect(r.verdict).toBe('VERIFIED');
    expect(r.passageStart).toBeUndefined();
    expect(r.passageEnd).toBeUndefined();
    expect(r.passageSection).toBeUndefined();
  });

  it('never fabricates publishedAt: absent on the citation means absent on the result', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x',
        citations: [{
          rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
        }],
      }),
      sendFeedback: vi.fn(),
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.claims[0].publishedAt).toBeUndefined();
    expect(out.claims[0].source?.captureTime).toBe('2026-06-21T14:03:00Z');
  });
});

describe('passage_used feedback', () => {
  it('fires once per passage-grounded verdict, with the grounded citation ids', async () => {
    const sendFeedback = vi.fn();
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-9', tier: 'anonymous',
        citations: [{
          rank: 3, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd7',
          captureTime: '2026-06-21T14:03:00Z', passageId: 'psg-1234abcd',
          passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
        }],
      }),
      sendFeedback,
    });
    await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(sendFeedback).toHaveBeenCalledTimes(1);
    expect(sendFeedback).toHaveBeenCalledWith({
      eventType: 'passage_used', searchId: 's-9', docId: 'd7', passageId: 'psg-1234abcd', rank: 3,
    });
  });

  it('does NOT fire when the quote fell back to a text snippet', async () => {
    const sendFeedback = vi.fn();
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-9', tier: 'anonymous',
        citations: [{
          rank: 1, title: 'LLNL', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z',
          text: 'Intro paragraph. On December 5, 2022 the National Ignition Facility achieved fusion ignition for the first time. More text.',
        }],
      }),
      sendFeedback,
    });
    const out = await runVerification('The National Ignition Facility achieved fusion ignition in 2022.', { client });
    expect(out.claims[0].verdict).toBe('VERIFIED');
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  it('fires for OPINION claims too when the related quote is a pinned passage', async () => {
    const sendFeedback = vi.fn();
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', searchId: 's-2', tier: 'anonymous',
        citations: [{
          rank: 1, title: 'Editor wars', canonicalUrl: 'https://x.example/a', docId: 'd1',
          captureTime: '2026-06-21T14:03:00Z', passageId: 'psg-op111111',
          passage: 'Some developers argue Vim is better than Emacs for quick edits.',
        }],
      }),
      sendFeedback,
    });
    const out = await runVerification('Vim is better than Emacs.', { client });
    expect(out.claims[0].verdict).toBe('OPINION');
    expect(sendFeedback).toHaveBeenCalledTimes(1);
    expect(sendFeedback).toHaveBeenCalledWith({
      eventType: 'passage_used', searchId: 's-2', docId: 'd1', passageId: 'psg-op111111', rank: 1,
    });
  });
});

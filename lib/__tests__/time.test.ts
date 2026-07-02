import { describe, it, expect } from 'vitest';
import { relativeTime } from '../time';

describe('relativeTime', () => {
  const now = Date.parse('2026-07-02T12:00:00Z');

  it('renders minutes, hours, and days ago', () => {
    expect(relativeTime('2026-07-02T11:58:00Z', now)).toBe('2m ago');
    expect(relativeTime('2026-07-02T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-06-29T12:00:00Z', now)).toBe('3d ago');
  });

  it('renders sub-minute ages as "just now" and clamps future timestamps (clock skew)', () => {
    expect(relativeTime('2026-07-02T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-07-02T12:05:00Z', now)).toBe('just now');
  });

  it('returns undefined for unparseable input (a stamp never fabricates a time)', () => {
    expect(relativeTime('not-a-date', now)).toBeUndefined();
  });
});

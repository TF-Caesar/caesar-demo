import { describe, it, expect, beforeEach } from 'vitest';
import { clientIp, rateLimit, resetRateLimiter } from '../rate-limit';

const NOW = 1_750_000_000_000; // fixed clock; every call passes `now` explicitly

beforeEach(() => {
  resetRateLimiter();
});

describe('rateLimit', () => {
  it('allows a burst of 5, then denies the 6th with a retry hint', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('1.2.3.4', NOW).ok).toBe(true);
    }
    const denied = rateLimit('1.2.3.4', NOW);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refills at 5/min: a token is available again ~12s after the bucket empties', () => {
    for (let i = 0; i < 5; i++) rateLimit('ip', NOW);
    expect(rateLimit('ip', NOW).ok).toBe(false);
    expect(rateLimit('ip', NOW + 12_001).ok).toBe(true);
  });

  it('tracks each IP independently', () => {
    for (let i = 0; i < 6; i++) rateLimit('a', NOW);
    expect(rateLimit('a', NOW).ok).toBe(false);
    expect(rateLimit('b', NOW).ok).toBe(true);
  });
});

describe('clientIp', () => {
  it('prefers fly-client-ip, then the first XFF hop, then "unknown"', () => {
    expect(clientIp(new Request('http://x/', { headers: { 'fly-client-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('http://x/', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }))).toBe('1.1.1.1');
    expect(clientIp(new Request('http://x/'))).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import { AI_BUCKET, level, take, type Bucket } from './rate-limit.ts';

describe('token bucket', () => {
  it('allows 30 calls in an hour and rejects the 31st with a wait time', () => {
    let bucket: Bucket | null = null;
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) {
      const result = take(bucket, now + i * 1000, AI_BUCKET);
      expect(result.allowed).toBe(true);
      bucket = result.bucket;
    }
    const thirtyFirst = take(bucket, now + 30_000, AI_BUCKET);
    expect(thirtyFirst.allowed).toBe(false);
    // One token comes back every 120 s; 30 s of refill already happened.
    expect(thirtyFirst.retryAfter).toBeGreaterThanOrEqual(90);
    expect(thirtyFirst.retryAfter).toBeLessThanOrEqual(91);
  });

  it('refills evenly over the hour', () => {
    const empty: Bucket = { tokens: 0, at: 0 };
    expect(take(empty, 119_000, AI_BUCKET).allowed).toBe(false);
    expect(take(empty, 120_000, AI_BUCKET).allowed).toBe(true);
    expect(level(empty, 3_600_000, AI_BUCKET)).toBe(30);
    expect(level(empty, 99_999_999, AI_BUCKET)).toBe(30);
  });

  it('ignores clocks that go backwards', () => {
    const bucket: Bucket = { tokens: 0.5, at: 10_000 };
    expect(level(bucket, 0, AI_BUCKET)).toBe(0.5);
  });
});

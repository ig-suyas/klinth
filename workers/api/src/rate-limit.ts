import { AI_CALLS_PER_HOUR } from '@klinth/core';

/**
 * Per-IP token bucket. A full bucket holds a whole hour of calls; it refills
 * evenly, so after the 30th call the next one is possible about 2 minutes later.
 */

export interface Bucket {
  tokens: number;
  /** Time of the last update, in ms. */
  at: number;
}

export interface BucketConfig {
  capacity: number;
  /** Tokens added per millisecond. */
  refillPerMs: number;
}

export const AI_BUCKET: BucketConfig = {
  capacity: AI_CALLS_PER_HOUR,
  refillPerMs: AI_CALLS_PER_HOUR / 3_600_000,
};

export interface TakeResult {
  allowed: boolean;
  bucket: Bucket;
  /** Whole seconds until the next call is allowed (0 when allowed). */
  retryAfter: number;
}

/** Tokens in the bucket at `now`. A bucket never seen before is full. */
export function level(saved: Bucket | null, now: number, config: BucketConfig): number {
  if (!saved) return config.capacity;
  const elapsed = Math.max(0, now - saved.at);
  return Math.min(config.capacity, saved.tokens + elapsed * config.refillPerMs);
}

/** Ms until the bucket is full again. */
export function msUntilFull(tokens: number, config: BucketConfig): number {
  return Math.max(0, Math.ceil((config.capacity - tokens) / config.refillPerMs));
}

/** Takes one token if there is one. Pure: the caller stores the returned bucket. */
export function take(saved: Bucket | null, now: number, config: BucketConfig): TakeResult {
  const tokens = level(saved, now, config);
  const allowed = tokens >= 1;
  const left = allowed ? tokens - 1 : tokens;
  return {
    allowed,
    bucket: { tokens: left, at: now },
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((1 - left) / config.refillPerMs / 1000)),
  };
}

const BUCKET_KEY = 'bucket';

/**
 * Durable Object (SQLite storage, free plan): one instance per IP address, so
 * the count is exact across all Cloudflare locations. It stores two numbers and
 * deletes them once the bucket is full again.
 */
export class RateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(): Promise<Response> {
    const now = Date.now();
    const saved = (await this.state.storage.get<Bucket>(BUCKET_KEY)) ?? null;
    const result = take(saved, now, AI_BUCKET);
    await this.state.storage.put(BUCKET_KEY, result.bucket);
    await this.state.storage.setAlarm(now + msUntilFull(result.bucket.tokens, AI_BUCKET));
    return Response.json({ allowed: result.allowed, retryAfter: result.retryAfter });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const saved = (await this.state.storage.get<Bucket>(BUCKET_KEY)) ?? null;
    const tokens = level(saved, now, AI_BUCKET);
    if (tokens >= AI_BUCKET.capacity) await this.state.storage.deleteAll();
    else await this.state.storage.setAlarm(now + msUntilFull(tokens, AI_BUCKET));
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * In-memory token-bucket rate limiter, keyed on a string (typically
 * the caller's IP). Buckets refill linearly at refillPerSecond, capped
 * at capacity. Idle keys grow no bigger than `capacity` tokens.
 *
 * In-process state — fine for a single Bun process behind a single
 * proxy (Fly's deploy model). Multi-instance deployments would need a
 * shared store; not in scope for M2's single-instance demo.
 */
export interface RateLimiterOptions {
	capacity: number;
	refillPerSecond: number;
	now?: () => number;
}

export interface RateLimiter {
	tryConsume(key: string): boolean;
}

interface Bucket {
	tokens: number;
	lastRefillMs: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
	const { capacity, refillPerSecond } = opts;
	const now = opts.now ?? Date.now;
	const buckets = new Map<string, Bucket>();

	return {
		tryConsume(key: string): boolean {
			const t = now();
			const bucket = buckets.get(key);
			if (!bucket) {
				// First touch: start full, take one.
				buckets.set(key, { tokens: capacity - 1, lastRefillMs: t });
				return true;
			}

			const elapsedSec = (t - bucket.lastRefillMs) / 1000;
			bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSecond);
			bucket.lastRefillMs = t;

			if (bucket.tokens >= 1) {
				bucket.tokens -= 1;
				return true;
			}
			return false;
		}
	};
}

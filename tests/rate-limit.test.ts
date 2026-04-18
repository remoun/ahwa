// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'bun:test';

import { createRateLimiter } from '../src/lib/server/rate-limit';

/**
 * Each test instantiates its own limiter with a controllable clock.
 * `now()` returns ms; advancing it simulates wall-clock passage so we
 * exercise the refill logic without sleeping.
 */
function makeClock(initial = 1_000_000) {
	let t = initial;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		}
	};
}

describe('rate-limit.createRateLimiter (token bucket)', () => {
	it('lets the first `capacity` requests through, then rejects', () => {
		const clock = makeClock();
		const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: clock.now });

		expect(limiter.tryConsume('1.2.3.4')).toBe(true);
		expect(limiter.tryConsume('1.2.3.4')).toBe(true);
		expect(limiter.tryConsume('1.2.3.4')).toBe(true);
		expect(limiter.tryConsume('1.2.3.4')).toBe(false);
	});

	it("isolates buckets per key (one IP exhausting doesn't affect another)", () => {
		const clock = makeClock();
		const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: clock.now });

		expect(limiter.tryConsume('alice')).toBe(true);
		expect(limiter.tryConsume('alice')).toBe(true);
		expect(limiter.tryConsume('alice')).toBe(false);

		expect(limiter.tryConsume('bob')).toBe(true);
		expect(limiter.tryConsume('bob')).toBe(true);
		expect(limiter.tryConsume('bob')).toBe(false);
	});

	it('refills at refillPerSecond when time advances', () => {
		const clock = makeClock();
		const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 2, now: clock.now });

		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(false);

		// 500ms = 1 token at 2/sec
		clock.advance(500);
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(false);

		// Another 1000ms = 2 tokens, capped at capacity=2
		clock.advance(2000);
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(false);
	});

	it("refill is bounded by capacity (idle key doesn't accumulate forever)", () => {
		const clock = makeClock();
		const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: clock.now });

		// Idle for a long time
		clock.advance(60 * 60 * 1000);

		// Still only `capacity` tokens, not 3600
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(false);
	});

	it('uses Date.now() as the default clock when none is provided', () => {
		// Smoke test only — confirms wiring; doesn't assert refill timing
		// (which would be flaky under a real clock).
		const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1 });
		expect(limiter.tryConsume('k')).toBe(true);
		expect(limiter.tryConsume('k')).toBe(false);
	});
});

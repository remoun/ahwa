// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'bun:test';

import { ShutdownCoordinator } from '../src/lib/server/lifecycle';

/**
 * Drives drain() with injected sleep + clock so tests stay fast and
 * deterministic — no real-wait or signal-handler ceremony required.
 */
function makeFakeTime() {
	let time = 0;
	const sleep = async (ms: number) => {
		time += ms;
	};
	const now = () => time;
	return { sleep, now, advance: (ms: number) => (time += ms) };
}

describe('ShutdownCoordinator', () => {
	it('clean exit: drain resolves immediately when nothing is in-flight', async () => {
		const sc = new ShutdownCoordinator();
		const result = await sc.drain({ gracePeriodMs: 1000, ...makeFakeTime() });
		expect(result.exited).toBe('clean');
		expect(result.remaining).toBe(0);
	});

	it('clean exit: drain waits for tracked requests to finish before resolving', async () => {
		const sc = new ShutdownCoordinator();
		const ctrl = sc.track();
		const time = makeFakeTime();

		const drainPromise = sc.drain({ gracePeriodMs: 5000, pollMs: 100, ...time });

		// While the poll loop is sleeping, the request finishes and untracks.
		// We need to let the first poll happen, then untrack, then let it
		// observe the empty set.
		await Promise.resolve(); // let drain enter its loop
		sc.untrack(ctrl);

		const result = await drainPromise;
		expect(result.exited).toBe('clean');
		expect(result.remaining).toBe(0);
	});

	it('aborted exit: aborts remaining controllers when grace expires', async () => {
		const sc = new ShutdownCoordinator();
		const ctrl1 = sc.track();
		const ctrl2 = sc.track();

		const result = await sc.drain({
			gracePeriodMs: 500,
			pollMs: 100,
			...makeFakeTime()
		});

		expect(result.exited).toBe('aborted');
		expect(result.remaining).toBe(2);
		expect(ctrl1.signal.aborted).toBe(true);
		expect(ctrl2.signal.aborted).toBe(true);
	});

	it('shouldRefuseNew flips to true once drain has been called', async () => {
		const sc = new ShutdownCoordinator();
		expect(sc.shouldRefuseNew()).toBe(false);
		const drainPromise = sc.drain({ gracePeriodMs: 1, ...makeFakeTime() });
		expect(sc.shouldRefuseNew()).toBe(true);
		await drainPromise;
		expect(sc.shouldRefuseNew()).toBe(true);
	});

	it('count() reflects tracked requests; untrack drops the entry', () => {
		const sc = new ShutdownCoordinator();
		expect(sc.count()).toBe(0);
		const a = sc.track();
		const b = sc.track();
		expect(sc.count()).toBe(2);
		sc.untrack(a);
		expect(sc.count()).toBe(1);
		sc.untrack(b);
		expect(sc.count()).toBe(0);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'bun:test';

import type { SseEvent } from '../src/lib/schemas/events';
import { withDemoReconcile } from '../src/lib/server/demo-reconcile';
import { getDemoUsageToday, tryReserveDemoBudget } from '../src/lib/server/demo-usage';
import { createTestDb, type TestDb } from './helpers';

function source(events: SseEvent[]): AsyncGenerator<SseEvent> {
	return (async function* () {
		for (const e of events) yield e;
	})();
}

async function drain(stream: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
	const out: SseEvent[] = [];
	for await (const e of stream) out.push(e);
	return out;
}

describe('demo-reconcile.withDemoReconcile', () => {
	let db: TestDb;
	const clock = () => Date.UTC(2026, 3, 18, 12, 0, 0);

	beforeEach(() => {
		db = createTestDb();
	});

	it('passes through every event unchanged', async () => {
		const events: SseEvent[] = [
			{ type: 'table_opened', tableId: 't1' },
			{ type: 'round_started', round: 1, kind: 'opening' },
			{ type: 'table_closed', totalTokens: 5000 }
		];
		const out = await drain(
			withDemoReconcile(source(events), {
				db,
				isDemo: false,
				estimateTokens: 5000,
				now: clock
			})
		);
		expect(out).toEqual(events);
	});

	it('reconciles when isDemo and table_closed has totalTokens (positive delta)', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000);

		await drain(
			withDemoReconcile(source([{ type: 'table_closed', totalTokens: 7000 }]), {
				db,
				isDemo: true,
				estimateTokens: 5000,
				now: clock
			})
		);

		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(7000);
	});

	it('refunds when actual < estimate (negative delta)', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });
		await drain(
			withDemoReconcile(source([{ type: 'table_closed', totalTokens: 2000 }]), {
				db,
				isDemo: true,
				estimateTokens: 5000,
				now: clock
			})
		);
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(2000);
	});

	it("skips reconcile when isDemo=false (owned tables don't bill the demo cap)", async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });
		await drain(
			withDemoReconcile(source([{ type: 'table_closed', totalTokens: 99999 }]), {
				db,
				isDemo: false,
				estimateTokens: 5000,
				now: clock
			})
		);
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000); // unchanged
	});

	it('skips reconcile when totalTokens is undefined (mock or provider without usage info)', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });
		await drain(
			withDemoReconcile(source([{ type: 'table_closed' }]), {
				db,
				isDemo: true,
				estimateTokens: 5000,
				now: clock
			})
		);
		// Without usage info, we keep the pre-charge as-is rather than guess
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000);
	});

	it("doesn't double-reconcile if a stream somehow emits two table_closed events", async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });
		await drain(
			withDemoReconcile(
				source([
					{ type: 'table_closed', totalTokens: 8000 },
					{ type: 'table_closed', totalTokens: 8000 }
				]),
				{ db, isDemo: true, estimateTokens: 5000, now: clock }
			)
		);
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(8000);
	});

	it('refunds the full pre-charge when source throws BEFORE table_closed', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000);

		const failingSource = (async function* (): AsyncGenerator<SseEvent> {
			yield { type: 'table_opened', tableId: 'fail' };
			throw new Error('LLM provider down');
		})();

		await expect(
			drain(
				withDemoReconcile(failingSource, {
					db,
					isDemo: true,
					estimateTokens: 5000,
					now: clock
				})
			)
		).rejects.toThrow(/LLM provider down/);

		// Full estimate refunded — daily cap is not silently drained.
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(0);
	});

	it('refunds when source ends early without yielding table_closed', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });

		const truncated = (async function* (): AsyncGenerator<SseEvent> {
			yield { type: 'table_opened', tableId: 't' };
			yield { type: 'round_started', round: 1, kind: 'opening' };
			// returns without table_closed (orchestrator abort path)
		})();

		await drain(
			withDemoReconcile(truncated, { db, isDemo: true, estimateTokens: 5000, now: clock })
		);

		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(0);
	});

	it('does NOT refund on close-without-totalTokens (keeps pre-charge as conservative estimate)', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });

		await drain(
			withDemoReconcile(source([{ type: 'table_closed' }]), {
				db,
				isDemo: true,
				estimateTokens: 5000,
				now: clock
			})
		);

		// We saw a close but no usage info. Conservative: keep estimate
		// rather than refund (which would silently under-count if the
		// provider really did consume tokens).
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000);
	});

	it('reconciles BEFORE yielding table_closed (consumer disconnect after close still records)', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });

		const stream = withDemoReconcile(source([{ type: 'table_closed', totalTokens: 7000 }]), {
			db,
			isDemo: true,
			estimateTokens: 5000,
			now: clock
		});

		// Pull the table_closed event and then disconnect — emulates an
		// SSE consumer that closes the connection on the close event.
		const first = await stream.next();
		expect(first.value).toMatchObject({ type: 'table_closed', totalTokens: 7000 });
		await stream.return(undefined);

		// Bookkeeping landed before the yield, so it survives early
		// disconnect.
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(7000);
	});

	it('does not refund when isDemo=false even on early termination', async () => {
		tryReserveDemoBudget({ db, capTokens: 100000, estimateTokens: 5000, now: clock });

		const failingSource = (async function* (): AsyncGenerator<SseEvent> {
			yield { type: 'table_opened', tableId: 'owned' };
			throw new Error('crash');
		})();

		await expect(
			drain(
				withDemoReconcile(failingSource, {
					db,
					isDemo: false,
					estimateTokens: 5000,
					now: clock
				})
			)
		).rejects.toThrow(/crash/);

		// Owned table — demo bookkeeping untouched.
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000);
	});
});

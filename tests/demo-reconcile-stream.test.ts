// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import * as schema from '../src/lib/server/db/schema';
import type { SseEvent } from '../src/lib/schemas/events';
import { createTestDb, type TestDb } from './helpers';
import { tryReserveDemoBudget, getDemoUsageToday } from '../src/lib/server/demo-usage';
import { withDemoReconcile } from '../src/lib/server/demo-reconcile';

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
});

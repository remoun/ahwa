// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'bun:test';

import { TableBus } from '../src/lib/server/table-bus';

describe('TableBus', () => {
	it('delivers published events to subscribers of the same table', async () => {
		const bus = new TableBus();
		const ctrl = new AbortController();
		const iter = bus.subscribe({ tableId: 'tbl', signal: ctrl.signal });
		const received: unknown[] = [];

		const consume = (async () => {
			for await (const e of iter) {
				received.push(e);
				if (received.length >= 2) {
					ctrl.abort();
					break;
				}
			}
		})();

		bus.publish('tbl', { type: 'party_joined', partyId: 'a' });
		bus.publish('tbl', { type: 'party_stance_set', partyId: 'a' });

		await consume;
		expect(received).toHaveLength(2);
		expect((received[0] as { type: string }).type).toBe('party_joined');
		expect((received[1] as { type: string }).type).toBe('party_stance_set');
	});

	it('does not deliver events from other tables', async () => {
		const bus = new TableBus();
		const ctrl = new AbortController();
		const iter = bus.subscribe({ tableId: 'tbl-A', signal: ctrl.signal });
		const received: unknown[] = [];

		const consume = (async () => {
			for await (const e of iter) {
				received.push(e);
				ctrl.abort();
				break;
			}
		})();

		bus.publish('tbl-B', { type: 'party_joined', partyId: 'x' });
		bus.publish('tbl-A', { type: 'party_joined', partyId: 'y' });

		await consume;
		expect(received).toHaveLength(1);
		expect((received[0] as { partyId: string }).partyId).toBe('y');
	});

	it('fans out to multiple subscribers of the same table', async () => {
		const bus = new TableBus();
		const c1 = new AbortController();
		const c2 = new AbortController();
		const iter1 = bus.subscribe({ tableId: 'tbl', signal: c1.signal });
		const iter2 = bus.subscribe({ tableId: 'tbl', signal: c2.signal });

		const collect = async (
			it: AsyncIterable<unknown>,
			ctrl: AbortController
		): Promise<unknown[]> => {
			const arr: unknown[] = [];
			for await (const e of it) {
				arr.push(e);
				ctrl.abort();
				break;
			}
			return arr;
		};
		const p1 = collect(iter1, c1);
		const p2 = collect(iter2, c2);

		bus.publish('tbl', { type: 'table_synthesized' });

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toHaveLength(1);
		expect(r2).toHaveLength(1);
	});

	it('cleans up on abort so memory does not leak', async () => {
		const bus = new TableBus();
		const ctrl = new AbortController();
		const iter = bus.subscribe({ tableId: 'tbl', signal: ctrl.signal });
		const consume = (async () => {
			for await (const _ of iter) {
				// drain
			}
		})();

		ctrl.abort();
		await consume;

		expect(bus.count()).toBe(0);
		// Publishing to a table with no subscribers is a no-op.
		expect(() => bus.publish('tbl', { type: 'table_synthesized' })).not.toThrow();
	});

	it('count() reports total subscribers across tables', () => {
		const bus = new TableBus();
		const c1 = new AbortController();
		const c2 = new AbortController();
		const c3 = new AbortController();
		bus.subscribe({ tableId: 'a', signal: c1.signal });
		bus.subscribe({ tableId: 'a', signal: c2.signal });
		bus.subscribe({ tableId: 'b', signal: c3.signal });
		expect(bus.count()).toBe(3);
		c1.abort();
		c2.abort();
		c3.abort();
	});
});

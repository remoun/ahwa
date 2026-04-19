// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'bun:test';

import { _resetBus, publish, subscribe } from '../src/lib/server/table-bus';

describe('table-bus', () => {
	afterEach(() => _resetBus());

	it('delivers published events to subscribers of the same table', async () => {
		const ctrl = new AbortController();
		const iter = subscribe({ tableId: 'tbl', signal: ctrl.signal });
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

		publish('tbl', { type: 'party_joined', partyId: 'a' });
		publish('tbl', { type: 'party_stance_set', partyId: 'a' });

		await consume;
		expect(received).toHaveLength(2);
		expect((received[0] as { type: string }).type).toBe('party_joined');
		expect((received[1] as { type: string }).type).toBe('party_stance_set');
	});

	it('does not deliver events from other tables', async () => {
		const ctrl = new AbortController();
		const iter = subscribe({ tableId: 'tbl-A', signal: ctrl.signal });
		const received: unknown[] = [];

		const consume = (async () => {
			for await (const e of iter) {
				received.push(e);
				ctrl.abort();
				break;
			}
		})();

		publish('tbl-B', { type: 'party_joined', partyId: 'x' });
		publish('tbl-A', { type: 'party_joined', partyId: 'y' });

		await consume;
		expect(received).toHaveLength(1);
		expect((received[0] as { partyId: string }).partyId).toBe('y');
	});

	it('fans out to multiple subscribers of the same table', async () => {
		const c1 = new AbortController();
		const c2 = new AbortController();
		const iter1 = subscribe({ tableId: 'tbl', signal: c1.signal });
		const iter2 = subscribe({ tableId: 'tbl', signal: c2.signal });

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

		publish('tbl', { type: 'table_synthesized' });

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toHaveLength(1);
		expect(r2).toHaveLength(1);
	});

	it('cleans up on abort so memory does not leak', async () => {
		const ctrl = new AbortController();
		const iter = subscribe({ tableId: 'tbl', signal: ctrl.signal });
		const consume = (async () => {
			for await (const _ of iter) {
				// drain
			}
		})();

		ctrl.abort();
		await consume;

		// After cleanup, publishing to the same table is a no-op.
		expect(() => publish('tbl', { type: 'table_synthesized' })).not.toThrow();
	});
});

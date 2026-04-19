// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import * as schema from '../src/lib/server/db/schema';
import type { ResolvedParty } from '../src/lib/server/identity';
import { signShareToken } from '../src/lib/server/share';
import { createUncommitHandler } from '../src/lib/server/uncommit';
import { createTestDb, type TestDb } from './helpers';

describe('uncommit handler', () => {
	const originalSecret = process.env.AHWA_SHARE_SECRET;
	beforeAll(() => {
		process.env.AHWA_SHARE_SECRET = 'x'.repeat(64);
	});
	afterAll(() => {
		if (originalSecret !== undefined) process.env.AHWA_SHARE_SECRET = originalSecret;
		else delete process.env.AHWA_SHARE_SECRET;
	});

	let db: TestDb;
	const alice: ResolvedParty = { id: 'alice', displayName: 'A', externalId: null };
	const bob: ResolvedParty = { id: 'bob', displayName: 'B', externalId: null };

	beforeEach(() => {
		db = createTestDb();
		db.insert(schema.parties).values([{ id: 'alice' }, { id: 'bob' }]).run();
		db.insert(schema.tables)
			.values({ id: 'tbl', dilemma: 'd', councilId: 'c', status: 'running' })
			.run();
		db.insert(schema.tableParties)
			.values([
				{ tableId: 'tbl', partyId: 'alice', role: 'initiator', stance: 'a', runStatus: 'completed' },
				{ tableId: 'tbl', partyId: 'bob', role: 'invited', stance: 'b', runStatus: 'pending' }
			])
			.run();
		db.insert(schema.turns)
			.values([
				{
					id: 't1',
					tableId: 'tbl',
					round: 1,
					partyId: 'alice',
					personaName: 'Elder',
					text: 'a-elder',
					visibleTo: ['alice']
				},
				{
					id: 't2',
					tableId: 'tbl',
					round: 1,
					partyId: 'alice',
					personaName: 'Mirror',
					text: 'a-mirror',
					visibleTo: ['alice']
				}
			])
			.run();
	});

	function call(opts: {
		tableId: string;
		partyId: string;
		party: ResolvedParty;
		token?: string;
	}) {
		const handler = createUncommitHandler({ getDb: () => db });
		return handler(opts);
	}

	function aliceLink() {
		return db
			.select()
			.from(schema.tableParties)
			.where(and(eq(schema.tableParties.tableId, 'tbl'), eq(schema.tableParties.partyId, 'alice')))
			.get();
	}

	function aliceTurns() {
		return db
			.select()
			.from(schema.turns)
			.where(and(eq(schema.turns.tableId, 'tbl'), eq(schema.turns.partyId, 'alice')))
			.all();
	}

	it("resets the party's runStatus to pending and deletes their turns", async () => {
		const res = await call({ tableId: 'tbl', partyId: 'alice', party: alice });
		expect(res.status).toBe(200);
		expect(aliceLink()?.runStatus).toBe('pending');
		expect(aliceTurns()).toHaveLength(0);
	});

	it("does not touch the other party's turns or run state", async () => {
		db.insert(schema.turns)
			.values({
				id: 'b-turn',
				tableId: 'tbl',
				round: 1,
				partyId: 'bob',
				personaName: 'Elder',
				text: 'b-elder',
				visibleTo: ['bob']
			})
			.run();
		await call({ tableId: 'tbl', partyId: 'alice', party: alice });
		const bobTurns = db
			.select()
			.from(schema.turns)
			.where(eq(schema.turns.partyId, 'bob'))
			.all();
		expect(bobTurns).toHaveLength(1);
	});

	it('refuses uncommit after the table is fully synthesized', async () => {
		db.update(schema.tables).set({ status: 'completed' }).where(eq(schema.tables.id, 'tbl')).run();
		const res = await call({ tableId: 'tbl', partyId: 'alice', party: alice });
		expect(res.status).toBe(409);
		expect(aliceLink()?.runStatus).toBe('completed');
		expect(aliceTurns()).toHaveLength(2);
	});

	it("refuses uncommit while the party's run is mid-flight", async () => {
		db.update(schema.tableParties)
			.set({ runStatus: 'running' })
			.where(eq(schema.tableParties.partyId, 'alice'))
			.run();
		const res = await call({ tableId: 'tbl', partyId: 'alice', party: alice });
		expect(res.status).toBe(409);
	});

	it('refuses uncommit when the party never ran', async () => {
		const res = await call({ tableId: 'tbl', partyId: 'bob', party: bob });
		expect(res.status).toBe(409);
	});

	it('rejects when caller has neither matching identity nor a valid token', async () => {
		const res = await call({ tableId: 'tbl', partyId: 'alice', party: bob });
		expect(res.status).toBe(403);
		expect(aliceLink()?.runStatus).toBe('completed');
	});

	it('invitee can uncommit via valid share token', async () => {
		db.update(schema.tableParties)
			.set({ runStatus: 'completed' })
			.where(eq(schema.tableParties.partyId, 'bob'))
			.run();
		const token = signShareToken('tbl', 'bob');
		const res = await call({
			tableId: 'tbl',
			partyId: 'bob',
			party: { id: 'me', displayName: 'me', externalId: null },
			token
		});
		expect(res.status).toBe(200);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import * as schema from '../src/lib/server/db/schema';
import type { ResolvedParty } from '../src/lib/server/identity';
import { signShareToken } from '../src/lib/server/share';
import { createStanceHandler } from '../src/lib/server/stance';
import { TableBus } from '../src/lib/server/table-bus';
import { createTestDb, type TestDb } from './helpers';

describe('stance handler', () => {
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

	beforeEach(() => {
		db = createTestDb();
		db.insert(schema.parties)
			.values([{ id: 'alice' }, { id: 'bob' }])
			.run();
		db.insert(schema.tables)
			.values({ id: 'tbl', dilemma: 'd', councilId: 'c', status: 'pending' })
			.run();
		db.insert(schema.tableParties)
			.values([
				{ tableId: 'tbl', partyId: 'alice', role: 'initiator' },
				{ tableId: 'tbl', partyId: 'bob', role: 'invited' }
			])
			.run();
	});

	function call(opts: {
		tableId: string;
		partyId: string;
		stance: string;
		party: ResolvedParty;
		token?: string;
	}) {
		const handler = createStanceHandler({ getDb: () => db, bus: new TableBus() });
		return handler(opts);
	}

	function readStance(partyId: string): string | null | undefined {
		return db
			.select()
			.from(schema.tableParties)
			.where(and(eq(schema.tableParties.tableId, 'tbl'), eq(schema.tableParties.partyId, partyId)))
			.get()?.stance;
	}

	it('initiator can write their own stance', async () => {
		const res = await call({ tableId: 'tbl', partyId: 'alice', stance: 'my view', party: alice });
		expect(res.status).toBe(200);
		expect(readStance('alice')).toBe('my view');
	});

	it('invitee can write their own stance via valid share token', async () => {
		const token = signShareToken('tbl', 'bob');
		// Invitee's locals.party is the "me" fallback (or another SSO user) —
		// what matters is the token verifies for (tbl, bob).
		const res = await call({
			tableId: 'tbl',
			partyId: 'bob',
			stance: 'bob view',
			party: { id: 'me', displayName: 'me', externalId: null },
			token
		});
		expect(res.status).toBe(200);
		expect(readStance('bob')).toBe('bob view');
	});

	it('rejects when caller has neither matching identity nor a valid token', async () => {
		const res = await call({
			tableId: 'tbl',
			partyId: 'bob',
			stance: 'forged',
			party: alice
		});
		expect(res.status).toBe(403);
		expect(readStance('bob')).toBeNull();
	});

	it('overwrites an existing stance (drafts are mutable)', async () => {
		await call({ tableId: 'tbl', partyId: 'alice', stance: 'first', party: alice });
		await call({ tableId: 'tbl', partyId: 'alice', stance: 'revised', party: alice });
		expect(readStance('alice')).toBe('revised');
	});

	it("refuses to edit while the party's run is in flight", async () => {
		db.update(schema.tableParties)
			.set({ runStatus: 'running' })
			.where(eq(schema.tableParties.partyId, 'alice'))
			.run();
		const res = await call({ tableId: 'tbl', partyId: 'alice', stance: 'mid-run', party: alice });
		expect(res.status).toBe(409);
	});

	it('refuses to edit after the table is fully synthesized', async () => {
		db.update(schema.tables).set({ status: 'completed' }).where(eq(schema.tables.id, 'tbl')).run();
		const res = await call({
			tableId: 'tbl',
			partyId: 'alice',
			stance: 'too late',
			party: alice
		});
		expect(res.status).toBe(409);
	});

	it('400 on empty stance', async () => {
		const res = await call({ tableId: 'tbl', partyId: 'alice', stance: '   ', party: alice });
		expect(res.status).toBe(400);
	});

	it('404 when the (table, party) pair does not exist', async () => {
		const res = await call({
			tableId: 'tbl',
			partyId: 'carol',
			stance: 'x',
			party: { id: 'carol', displayName: 'C', externalId: null }
		});
		expect(res.status).toBe(404);
	});
});

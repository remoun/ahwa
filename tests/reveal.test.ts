// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import * as schema from '../src/lib/server/db/schema';
import type { ResolvedParty } from '../src/lib/server/identity';
import { createRevealHandler } from '../src/lib/server/reveal';
import { createTestDb, type TestDb } from './helpers';

describe('reveal handler', () => {
	let db: TestDb;
	const alice: ResolvedParty = { id: 'alice', displayName: 'A', externalId: null };
	const bob: ResolvedParty = { id: 'bob', displayName: 'B', externalId: null };

	beforeEach(() => {
		db = createTestDb();
		db.insert(schema.parties)
			.values([{ id: 'alice' }, { id: 'bob' }])
			.run();
		db.insert(schema.tables)
			.values({ id: 'tbl', dilemma: 'd', councilId: 'c', status: 'running' })
			.run();
		db.insert(schema.tableParties)
			.values([
				{ tableId: 'tbl', partyId: 'alice', role: 'initiator' },
				{ tableId: 'tbl', partyId: 'bob', role: 'invited' }
			])
			.run();
		db.insert(schema.turns)
			.values({
				id: 'turn-a',
				tableId: 'tbl',
				round: 1,
				partyId: 'alice',
				personaName: 'Elder',
				text: 'private to alice',
				visibleTo: ['alice']
			})
			.run();
	});

	function call(turnId: string, withPartyId: string, party: ResolvedParty) {
		const handler = createRevealHandler({ getDb: () => db });
		return handler({ turnId, withPartyId, party });
	}

	it("appends the recipient to the turn's visible_to", async () => {
		const res = await call('turn-a', 'bob', alice);
		expect(res.status).toBe(200);

		const turn = db.select().from(schema.turns).where(eq(schema.turns.id, 'turn-a')).get();
		expect(turn?.visibleTo?.sort()).toEqual(['alice', 'bob']);
	});

	it('is idempotent: revealing twice keeps a single entry', async () => {
		await call('turn-a', 'bob', alice);
		await call('turn-a', 'bob', alice);

		const turn = db.select().from(schema.turns).where(eq(schema.turns.id, 'turn-a')).get();
		expect(turn?.visibleTo).toEqual(['alice', 'bob']);
	});

	it('rejects when caller does not own the turn', async () => {
		// bob tries to reveal alice's turn — disallowed
		const res = await call('turn-a', 'bob', bob);
		expect(res.status).toBe(403);

		// Visibility is unchanged
		const turn = db.select().from(schema.turns).where(eq(schema.turns.id, 'turn-a')).get();
		expect(turn?.visibleTo).toEqual(['alice']);
	});

	it('404 when the turn does not exist', async () => {
		const res = await call('nope', 'bob', alice);
		expect(res.status).toBe(404);
	});

	it('400 when recipient is not a member of the table', async () => {
		// carol exists as a party but is not at this table
		db.insert(schema.parties).values({ id: 'carol' }).run();
		const res = await call('turn-a', 'carol', alice);
		expect(res.status).toBe(400);
	});

	it('rejects un-reveal: cannot remove a recipient once added', async () => {
		// Establish the policy by calling reveal then trying to revoke.
		// The endpoint has no revoke verb — only reveal — so attempting
		// to "reveal to nobody" or pass an empty list is meaningless.
		// This test pins that the only mutation is append.
		await call('turn-a', 'bob', alice);
		const before = db.select().from(schema.turns).where(eq(schema.turns.id, 'turn-a')).get();
		// Hypothetical revoke would shrink visibleTo. The handler only
		// grows it, so a second reveal of a different recipient also
		// keeps bob.
		db.insert(schema.parties).values({ id: 'dave' }).run();
		db.insert(schema.tableParties)
			.values({ tableId: 'tbl', partyId: 'dave', role: 'invited' })
			.run();
		await call('turn-a', 'dave', alice);
		const after = db.select().from(schema.turns).where(eq(schema.turns.id, 'turn-a')).get();
		expect(after?.visibleTo).toContain('bob');
		expect(after?.visibleTo).toContain('dave');
		expect(after?.visibleTo?.length).toBeGreaterThan(before?.visibleTo?.length ?? 0);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import * as schema from '../src/lib/server/db/schema';
import type { ResolvedParty } from '../src/lib/server/identity';
import { mockCompleteResult } from '../src/lib/server/llm';
import { createSynthesizeHandler } from '../src/lib/server/synthesize';
import { TableBus } from '../src/lib/server/table-bus';
import { seedMiniCouncil } from './fixtures';
import { createTestDb, type TestDb } from './helpers';

describe('synthesize handler', () => {
	let db: TestDb;
	const alice: ResolvedParty = { id: 'alice', displayName: 'A', externalId: null };

	const completeFn = async () => mockCompleteResult(['synthesis ', 'output']);

	beforeEach(() => {
		db = createTestDb();
		seedMiniCouncil(db);
		db.delete(schema.parties).where(eq(schema.parties.id, 'party-1')).run();
		db.insert(schema.parties)
			.values([{ id: 'alice' }, { id: 'bob' }])
			.run();

		db.insert(schema.tables)
			.values({ id: 'tbl', dilemma: 'd', councilId: 'test-council', status: 'running' })
			.run();
		db.insert(schema.tableParties)
			.values([
				{
					tableId: 'tbl',
					partyId: 'alice',
					role: 'initiator',
					stance: 'a stance',
					runStatus: 'completed'
				},
				{
					tableId: 'tbl',
					partyId: 'bob',
					role: 'invited',
					stance: 'b stance',
					runStatus: 'completed'
				}
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
					text: 'alice elder',
					visibleTo: ['alice']
				},
				{
					id: 't2',
					tableId: 'tbl',
					round: 1,
					partyId: 'bob',
					personaName: 'Elder',
					text: 'bob elder',
					visibleTo: ['bob']
				}
			])
			.run();
	});

	function call(tableId: string, party: ResolvedParty) {
		const handler = createSynthesizeHandler({ getDb: () => db, bus: new TableBus(), completeFn });
		return handler({ tableId, party });
	}

	it('produces a synthesis turn visible to all parties and marks table completed', async () => {
		const res = await call('tbl', alice);
		expect(res.status).toBe(200);

		const synth = db
			.select()
			.from(schema.turns)
			.where(eq(schema.turns.tableId, 'tbl'))
			.all()
			.find((t) => t.partyId === 'synthesizer');
		expect(synth).toBeDefined();
		expect(synth!.visibleTo?.sort()).toEqual(['alice', 'bob'].sort());

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl')).get();
		expect(table?.status).toBe('completed');
		expect(table?.synthesis).toContain('synthesis');
	});

	it('rejects when any party still has a pending or running run', async () => {
		db.update(schema.tableParties)
			.set({ runStatus: 'pending' })
			.where(eq(schema.tableParties.partyId, 'bob'))
			.run();

		const res = await call('tbl', alice);
		expect(res.status).toBe(409);
	});

	it('rejects when caller is not a member of the table', async () => {
		const carol: ResolvedParty = { id: 'carol', displayName: 'C', externalId: null };
		db.insert(schema.parties).values({ id: 'carol' }).run();
		const res = await call('tbl', carol);
		expect(res.status).toBe(403);
	});

	it('404 when the table does not exist', async () => {
		const res = await call('nope', alice);
		expect(res.status).toBe(404);
	});

	it('rejects re-synthesis of an already-completed table', async () => {
		await call('tbl', alice);
		const res = await call('tbl', alice);
		expect(res.status).toBe(409);
	});

	it('passes both parties stances to the completion call', async () => {
		const seenSystem: string[] = [];
		const seenMessages: string[] = [];
		const captureFn = async (req: { system?: string; messages: { content: string }[] }) => {
			if (req.system) seenSystem.push(req.system);
			seenMessages.push(req.messages.map((m) => m.content).join('\n'));
			return mockCompleteResult(['synth']);
		};
		const handler = createSynthesizeHandler({
			getDb: () => db,
			bus: new TableBus(),
			completeFn: captureFn as never
		});
		await handler({ tableId: 'tbl', party: alice });

		const joined = seenMessages.join('\n');
		expect(joined).toContain('a stance');
		expect(joined).toContain('b stance');
	});
});

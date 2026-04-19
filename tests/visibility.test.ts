// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'bun:test';

import * as schema from '../src/lib/server/db/schema';
import { visibleTurns } from '../src/lib/server/visibility';
import { createTestDb, type TestDb } from './helpers';

/**
 * Invariant #8 protection: turns carry visible_to. Two-party (and N-party)
 * mediation hides each party's raw turns from the other until reveal.
 * These tests pin the cross-leak guard at the query layer — the place
 * the orchestrator can't accidentally bypass.
 */
describe('visibleTurns', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
		db.insert(schema.parties).values([{ id: 'A' }, { id: 'B' }, { id: 'C' }]).run();
		db.insert(schema.tables)
			.values({ id: 'tbl', dilemma: 'd', councilId: 'c', status: 'running' })
			.run();
	});

	function addTurn(id: string, partyId: string, visibleTo: string[], round = 1) {
		db.insert(schema.turns)
			.values({
				id,
				tableId: 'tbl',
				round,
				partyId,
				personaName: 'P',
				text: 't',
				visibleTo
			})
			.run();
	}

	it('single-party table: returns all turns regardless of visible_to', () => {
		db.insert(schema.tableParties).values({ tableId: 'tbl', partyId: 'A', role: 'initiator' }).run();
		addTurn('t1', 'A', ['A']);
		addTurn('t2', 'A', ['A']);

		const result = visibleTurns(db, 'tbl', 'A');
		expect(result.map((t) => t.id).sort()).toEqual(['t1', 't2']);
	});

	it('multi-party: viewer only sees turns whose visible_to includes them', () => {
		db.insert(schema.tableParties)
			.values([
				{ tableId: 'tbl', partyId: 'A', role: 'initiator' },
				{ tableId: 'tbl', partyId: 'B', role: 'invited' }
			])
			.run();
		addTurn('a-private', 'A', ['A']);
		addTurn('b-private', 'B', ['B']);
		addTurn('shared', 'A', ['A', 'B']);

		const aSeen = visibleTurns(db, 'tbl', 'A').map((t) => t.id).sort();
		const bSeen = visibleTurns(db, 'tbl', 'B').map((t) => t.id).sort();
		expect(aSeen).toEqual(['a-private', 'shared']);
		expect(bSeen).toEqual(['b-private', 'shared']);
	});

	it('multi-party: synthesis turn (round 0) is visible to all members', () => {
		db.insert(schema.tableParties)
			.values([
				{ tableId: 'tbl', partyId: 'A', role: 'initiator' },
				{ tableId: 'tbl', partyId: 'B', role: 'invited' }
			])
			.run();
		// Synthesizer turns historically have visible_to = [all parties].
		// Pin the behavior: even if the orchestrator forgets to include
		// every party, synthesis is visible to all members.
		addTurn('synth', 'synthesizer', [], 0);
		addTurn('a-private', 'A', ['A']);

		const bSeen = visibleTurns(db, 'tbl', 'B').map((t) => t.id).sort();
		expect(bSeen).toContain('synth');
	});

	it('non-member viewer sees nothing', () => {
		db.insert(schema.tableParties).values({ tableId: 'tbl', partyId: 'A', role: 'initiator' }).run();
		addTurn('t1', 'A', ['A']);

		expect(visibleTurns(db, 'tbl', 'C')).toEqual([]);
	});
});

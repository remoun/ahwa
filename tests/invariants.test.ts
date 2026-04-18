// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Invariant-protecting tests. These verify the query filters that keep
 * M3 (two-party, memory) and M4 (sync) cheap to add later.
 * CLAUDE.md: "These are the invariant-protecting tests; they matter most."
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, like } from 'drizzle-orm';

import * as schema from '../src/lib/server/db/schema';
import { seedFromDisk } from '../src/lib/server/db/seed';
import { createTestDb, type TestDb } from './helpers';

describe('invariant #8: visible_to filtering', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();

		// Two parties
		db.insert(schema.parties)
			.values([
				{ id: 'alice', displayName: 'Alice' },
				{ id: 'bob', displayName: 'Bob' }
			])
			.run();

		// Turns with different visibility
		db.insert(schema.turns)
			.values([
				{
					id: 't1',
					tableId: 'table-1',
					round: 1,
					partyId: 'alice',
					personaName: 'Elder',
					text: 'Alice sees this',
					visibleTo: ['alice']
				},
				{
					id: 't2',
					tableId: 'table-1',
					round: 1,
					partyId: 'bob',
					personaName: 'Elder',
					text: 'Bob sees this',
					visibleTo: ['bob']
				},
				{
					id: 't3',
					tableId: 'table-1',
					round: 1,
					partyId: 'alice',
					personaName: 'Mirror',
					text: 'Both see this',
					visibleTo: ['alice', 'bob']
				}
			])
			.run();
	});

	it('query for alice returns only turns visible to alice', () => {
		const turns = db
			.select()
			.from(schema.turns)
			.where(like(schema.turns.visibleTo, '%alice%'))
			.all();

		expect(turns.length).toBe(2);
		expect(turns.map((t) => t.id)).toContain('t1');
		expect(turns.map((t) => t.id)).toContain('t3');
	});

	it('query for bob does not return alice-only turns', () => {
		const turns = db.select().from(schema.turns).where(like(schema.turns.visibleTo, '%bob%')).all();

		expect(turns.length).toBe(2);
		expect(turns.map((t) => t.id)).toContain('t2');
		expect(turns.map((t) => t.id)).toContain('t3');
		expect(turns.map((t) => t.id)).not.toContain('t1');
	});
});

describe('invariant #11: is_demo filtering', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();

		db.insert(schema.tables)
			.values([
				{ id: 'owned-1', dilemma: 'Real dilemma', councilId: 'default', isDemo: 0 },
				{ id: 'owned-2', dilemma: 'Another dilemma', councilId: 'default', isDemo: 0 },
				{ id: 'demo-1', dilemma: 'Demo dilemma', councilId: 'default', isDemo: 1 }
			])
			.run();
	});

	it('default table list excludes demo tables', () => {
		const tables = db.select().from(schema.tables).where(eq(schema.tables.isDemo, 0)).all();

		expect(tables.length).toBe(2);
		expect(tables.map((t) => t.id)).toContain('owned-1');
		expect(tables.map((t) => t.id)).toContain('owned-2');
		expect(tables.map((t) => t.id)).not.toContain('demo-1');
	});

	it('demo query returns only demo tables', () => {
		const tables = db.select().from(schema.tables).where(eq(schema.tables.isDemo, 1)).all();

		expect(tables.length).toBe(1);
		expect(tables[0].id).toBe('demo-1');
	});
});

describe('invariant #10: feature-flag persona filtering', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
		seedFromDisk(db);
	});

	it('filters out personas whose required features are unavailable', () => {
		const availableFeatures: string[] = []; // M0: no features enabled

		const allPersonas = db.select().from(schema.personas).all();
		const eligible = allPersonas.filter((p) => {
			if (!p.requires) return true;
			return p.requires.every((f) => availableFeatures.includes(f));
		});

		// Historian requires "memory" which is unavailable — must be filtered out
		expect(eligible.map((p) => p.id)).not.toContain('historian');
		// Default council personas have no requirements — must remain
		expect(eligible.map((p) => p.id)).toContain('elder');
		expect(eligible.map((p) => p.id)).toContain('mirror');
	});

	it('includes personas when their required features are available', () => {
		const availableFeatures = ['memory']; // Simulate M3

		const allPersonas = db.select().from(schema.personas).all();
		const eligible = allPersonas.filter((p) => {
			if (!p.requires) return true;
			return p.requires.every((f) => availableFeatures.includes(f));
		});

		// With memory available, historian should be included
		expect(eligible.map((p) => p.id)).toContain('historian');
	});
});

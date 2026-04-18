// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { createTestDb, type TestDb } from './helpers';
import { createDemoTable } from '../src/lib/server/demo';
import { cleanupExpiredDemoTables } from '../src/lib/server/demo-cleanup';

function seedDemoCouncil(db: TestDb) {
	db.insert(schema.councils)
		.values({
			id: 'demo',
			name: 'Demo',
			personaIds: [],
			synthesisPrompt: '',
			roundStructure: { rounds: [], synthesize: false }
		})
		.run();
}

function setTableCreatedAt(db: TestDb, tableId: string, createdAtMs: number) {
	db.update(schema.tables)
		.set({ createdAt: createdAtMs })
		.where(eq(schema.tables.id, tableId))
		.run();
}

const HOUR = 60 * 60 * 1000;

describe('demo-cleanup.cleanupExpiredDemoTables', () => {
	let db: TestDb;
	const now = () => Date.UTC(2026, 3, 18, 12, 0, 0);

	beforeEach(() => {
		db = createTestDb();
		seedDemoCouncil(db);
	});

	it('deletes demo tables older than ttlHours', () => {
		const { tableId } = createDemoTable({ db, dilemma: 'old' });
		setTableCreatedAt(db, tableId, now() - 25 * HOUR);

		const deleted = cleanupExpiredDemoTables({ db, ttlHours: 24, now });

		expect(deleted).toBe(1);
		expect(db.select().from(schema.tables).all()).toHaveLength(0);
	});

	it('keeps demo tables newer than ttlHours', () => {
		createDemoTable({ db, dilemma: 'fresh' });
		// Fresh table — created_at is real Date.now, not under ttl

		const deleted = cleanupExpiredDemoTables({ db, ttlHours: 24, now });

		expect(deleted).toBe(0);
		expect(db.select().from(schema.tables).all()).toHaveLength(1);
	});

	it('never touches non-demo tables, even if they are old', () => {
		// Insert an owned (non-demo) table older than ttl
		db.insert(schema.tables)
			.values({
				id: 'owned-old',
				dilemma: 'persistent',
				councilId: 'demo',
				status: 'completed',
				isDemo: 0,
				createdAt: now() - 100 * HOUR
			})
			.run();

		const deleted = cleanupExpiredDemoTables({ db, ttlHours: 24, now });

		expect(deleted).toBe(0);
		const remaining = db.select().from(schema.tables).all();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe('owned-old');
	});

	it('cascades: deletes table_parties, turns, and the ephemeral party row', () => {
		const { tableId, partyId } = createDemoTable({ db, dilemma: 'old' });
		// Add a fake turn to confirm cascade
		db.insert(schema.turns).values({ id: 'turn-1', tableId, round: 1, partyId, text: 'hi' }).run();
		setTableCreatedAt(db, tableId, now() - 25 * HOUR);

		cleanupExpiredDemoTables({ db, ttlHours: 24, now });

		expect(db.select().from(schema.tables).all()).toHaveLength(0);
		expect(db.select().from(schema.tableParties).all()).toHaveLength(0);
		expect(db.select().from(schema.turns).all()).toHaveLength(0);
		// Demo parties are ephemeral — clean up so the parties table doesn't grow forever
		expect(db.select().from(schema.parties).all()).toHaveLength(0);
	});

	it('handles multiple expired demos in one sweep', () => {
		const a = createDemoTable({ db, dilemma: 'a' });
		const b = createDemoTable({ db, dilemma: 'b' });
		const c = createDemoTable({ db, dilemma: 'c' });
		setTableCreatedAt(db, a.tableId, now() - 50 * HOUR);
		setTableCreatedAt(db, b.tableId, now() - 30 * HOUR);
		setTableCreatedAt(db, c.tableId, now() - 1 * HOUR);

		const deleted = cleanupExpiredDemoTables({ db, ttlHours: 24, now });

		expect(deleted).toBe(2);
		const remaining = db.select().from(schema.tables).all();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe(c.tableId);
	});

	it('preserves a party that is also linked to a non-demo table (M3 safety)', () => {
		// Today every demo creates its own party (see A1), but the schema
		// doesn't enforce it. M3's two-party flow could legitimately link
		// an owned party to a demo table; the cleanup must not orphan
		// the owned table by deleting that party.
		const { tableId: demoTableId, partyId: sharedPartyId } = createDemoTable({
			db,
			dilemma: 'old demo'
		});
		setTableCreatedAt(db, demoTableId, now() - 25 * HOUR);

		// Same party also linked to a non-demo table.
		db.insert(schema.tables)
			.values({
				id: 'owned-1',
				dilemma: 'persistent',
				councilId: 'demo',
				status: 'completed',
				isDemo: 0,
				createdAt: now() - 5 * HOUR
			})
			.run();
		db.insert(schema.tableParties)
			.values({ tableId: 'owned-1', partyId: sharedPartyId, role: 'initiator' })
			.run();

		cleanupExpiredDemoTables({ db, ttlHours: 24, now });

		// Demo table is gone; owned table and shared party survive.
		expect(
			db
				.select()
				.from(schema.tables)
				.all()
				.map((t) => t.id)
		).toEqual(['owned-1']);
		expect(
			db.select().from(schema.parties).where(eq(schema.parties.id, sharedPartyId)).all()
		).toHaveLength(1);
		// The owned table's link is intact.
		expect(
			db
				.select()
				.from(schema.tableParties)
				.where(eq(schema.tableParties.partyId, sharedPartyId))
				.all()
		).toHaveLength(1);
	});
});

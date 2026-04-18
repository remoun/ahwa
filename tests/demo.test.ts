// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { createTestDb, type TestDb } from './helpers';
import { createDemoTable, MAX_DEMO_DILEMMA_LEN } from '../src/lib/server/demo';
import { verifyShareToken } from '../src/lib/server/share';

function seedDemoCouncil(db: TestDb) {
	db.insert(schema.personas)
		.values([
			{ id: 'demo-a', name: 'A', emoji: '🅰️', systemPrompt: 'You are A.' },
			{ id: 'demo-b', name: 'B', emoji: '🅱️', systemPrompt: 'You are B.' }
		])
		.run();
	db.insert(schema.councils)
		.values({
			id: 'demo',
			name: 'Demo',
			personaIds: ['demo-a', 'demo-b'],
			synthesisPrompt: 'Synthesize.',
			roundStructure: {
				rounds: [{ kind: 'opening', prompt_suffix: 'Speak.' }],
				synthesize: true
			}
		})
		.run();
}

describe('demo.createDemoTable', () => {
	let db: TestDb;
	beforeEach(() => {
		db = createTestDb();
		seedDemoCouncil(db);
	});

	it('creates a table flagged as is_demo=1', () => {
		const { tableId } = createDemoTable({ db, dilemma: 'Should I switch jobs?' });

		const row = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		expect(row).toBeDefined();
		expect(row!.isDemo).toBe(1);
	});

	it('always uses the demo council, ignoring caller intent', () => {
		const { tableId } = createDemoTable({ db, dilemma: 'Test' });

		const row = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		expect(row!.councilId).toBe('demo');
	});

	it('creates a fresh party per call (not the singleton "me")', () => {
		const a = createDemoTable({ db, dilemma: 'First' });
		const b = createDemoTable({ db, dilemma: 'Second' });

		expect(a.partyId).not.toBe(b.partyId);
		const parties = db.select().from(schema.parties).all();
		expect(parties).toHaveLength(2);
		for (const p of parties) {
			expect(p.displayName).toBe('demo');
			// Demo parties never carry SSO identity — anonymous + ephemeral.
			expect(p.externalId).toBeNull();
		}
	});

	it('links the party to the table as initiator', () => {
		const { tableId, partyId } = createDemoTable({ db, dilemma: 'Test' });

		const link = db
			.select()
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, tableId))
			.get();
		expect(link).toBeDefined();
		expect(link!.partyId).toBe(partyId);
		expect(link!.role).toBe('initiator');
	});

	it('returns a share token that verifies for the table+party pair', () => {
		const { tableId, partyId, token } = createDemoTable({ db, dilemma: 'Test' });

		expect(tableId).toBeTruthy();
		expect(partyId).toBeTruthy();
		expect(verifyShareToken(tableId, partyId, token)).toBe(true);
	});

	it('rejects an empty dilemma without writing to the DB', () => {
		expect(() => createDemoTable({ db, dilemma: '' })).toThrow(/dilemma/i);
		expect(() => createDemoTable({ db, dilemma: '   ' })).toThrow(/dilemma/i);

		expect(db.select().from(schema.tables).all()).toHaveLength(0);
		expect(db.select().from(schema.parties).all()).toHaveLength(0);
	});

	it('rejects a dilemma longer than MAX_DEMO_DILEMMA_LEN without writing', () => {
		const overflow = 'x'.repeat(MAX_DEMO_DILEMMA_LEN + 1);

		expect(() => createDemoTable({ db, dilemma: overflow })).toThrow(/too long/i);
		expect(db.select().from(schema.tables).all()).toHaveLength(0);
		expect(db.select().from(schema.parties).all()).toHaveLength(0);
	});

	it('accepts a dilemma exactly at MAX_DEMO_DILEMMA_LEN', () => {
		const justRight = 'x'.repeat(MAX_DEMO_DILEMMA_LEN);

		expect(() => createDemoTable({ db, dilemma: justRight })).not.toThrow();
	});

	it('throws when the demo council is missing (defense against misconfigured deploys)', () => {
		const emptyDb = createTestDb(); // no seedDemoCouncil
		expect(() => createDemoTable({ db: emptyDb, dilemma: 'test' })).toThrow(/demo council/i);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Full integration test: DB setup → seed → deliberation → verify event
 * sequence → verify DB state. Mocked LLM per CLAUDE.md ("Mock the LLM
 * provider always"). Covers everything except the thin SvelteKit HTTP layer.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { seedFromDisk } from '../src/lib/server/db/seed';
import { runDeliberation } from '../src/lib/server/orchestrator';
import type { SseEvent } from '../src/lib/schemas/events';
import { createTestDb, mockComplete, type TestDb } from './helpers';

describe('e2e: full deliberation with real councils', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
		seedFromDisk(db);
	});

	it('runs a complete deliberation with the default council (5 personas, 2 rounds, synthesis)', async () => {
		// Verify seed worked
		const councils = db.select().from(schema.councils).all();
		expect(councils.length).toBeGreaterThanOrEqual(2);

		const defaultCouncil = councils.find((c) => c.id === 'default');
		expect(defaultCouncil).toBeDefined();

		const personas = db.select().from(schema.personas).all();
		expect(personas.length).toBeGreaterThanOrEqual(5);

		// Create a party
		db.insert(schema.parties).values({ id: 'e2e-party', displayName: 'me' }).run();

		// Run the full deliberation
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			dilemma: 'Should I quit my job to start a cooperative?',
			councilId: 'default',
			partyId: 'e2e-party',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		// Verify event sequence
		const types = events.map((e) => e.type);

		// Must start with table_opened
		expect(types[0]).toBe('table_opened');

		// Must end with table_closed
		expect(types[types.length - 1]).toBe('table_closed');

		// Must have exactly 2 round_started events (opening + cross_examination)
		const roundStarts = events.filter((e) => e.type === 'round_started');
		expect(roundStarts.length).toBe(2);
		expect((roundStarts[0] as any).kind).toBe('opening');
		expect((roundStarts[1] as any).kind).toBe('cross_examination');

		// Must have 10 persona_turn_started events (5 personas x 2 rounds)
		const turnStarts = events.filter((e) => e.type === 'persona_turn_started');
		expect(turnStarts.length).toBe(10);

		// Must have 10 persona_turn_completed events
		const turnCompletes = events.filter((e) => e.type === 'persona_turn_completed');
		expect(turnCompletes.length).toBe(10);

		// Must have synthesis_started
		expect(types).toContain('synthesis_started');

		// Must have at least one synthesis_token
		const synthTokens = events.filter((e) => e.type === 'synthesis_token');
		expect(synthTokens.length).toBeGreaterThan(0);

		// Must have token events (at least one per persona turn)
		const tokens = events.filter((e) => e.type === 'token');
		expect(tokens.length).toBeGreaterThanOrEqual(10);

		// Verify event ordering: table_opened < round_started < ... < synthesis_started < table_closed
		const tableOpenedIdx = types.indexOf('table_opened');
		const firstRoundIdx = types.indexOf('round_started');
		const synthStartIdx = types.indexOf('synthesis_started');
		const tableClosedIdx = types.indexOf('table_closed');
		expect(tableOpenedIdx).toBeLessThan(firstRoundIdx);
		expect(firstRoundIdx).toBeLessThan(synthStartIdx);
		expect(synthStartIdx).toBeLessThan(tableClosedIdx);
	});

	it('persists all turns and synthesis to the database', async () => {
		db.insert(schema.parties).values({ id: 'e2e-party', displayName: 'me' }).run();

		let tableId = '';
		for await (const event of runDeliberation(db, {
			dilemma: 'Test dilemma for persistence check',
			councilId: 'default',
			partyId: 'e2e-party',
			completeFn: mockComplete
		})) {
			if (event.type === 'table_opened') tableId = event.tableId;
		}

		// Verify table row
		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		expect(table).toBeDefined();
		expect(table!.status).toBe('completed');
		expect(table!.synthesis).toBeTruthy();
		expect(table!.dilemma).toBe('Test dilemma for persistence check');

		// Verify turns: 5 personas x 2 rounds + 1 synthesis = 11
		const turns = db.select().from(schema.turns).all();
		expect(turns.length).toBe(11);

		// Verify each turn has text content
		for (const turn of turns) {
			expect(turn.text).toBeTruthy();
		}

		// Verify visible_to is set on every turn (invariant #8)
		for (const turn of turns) {
			expect(turn.visibleTo).toBeTruthy();
			const parsed = JSON.parse(turn.visibleTo!);
			expect(Array.isArray(parsed)).toBe(true);
		}

		// Verify table_parties link exists
		const links = db.select().from(schema.tableParties).all();
		expect(links.length).toBeGreaterThanOrEqual(1);
		expect(links[0].partyId).toBe('e2e-party');
	});

	it('historian persona is seeded with requires: ["memory"]', () => {
		const historian = db.select().from(schema.personas).where(eq(schema.personas.id, 'historian')).get();
		expect(historian).toBeDefined();
		expect(JSON.parse(historian!.requires!)).toEqual(['memory']);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { runDeliberation } from '../src/lib/server/orchestrator';
import type { SseEvent } from '../src/lib/schemas/events';
import { createTestDb, mockComplete, type TestDb } from './helpers';

function seedMiniCouncil(db: TestDb) {
	db.insert(schema.personas).values([
		{ id: 'elder', name: 'The Elder', emoji: '🌿', systemPrompt: 'You are an elder.' },
		{ id: 'mirror', name: 'The Mirror', emoji: '🪞', systemPrompt: 'You are a mirror.' }
	]).run();

	db.insert(schema.councils).values({
		id: 'test-council',
		name: 'Test Council',
		personaIds: JSON.stringify(['elder', 'mirror']),
		synthesisPrompt: 'Synthesize the deliberation.',
		roundStructure: JSON.stringify({
			rounds: [
				{ kind: 'opening', prompt_suffix: 'Give your opening take.' },
				{ kind: 'cross_examination', prompt_suffix: 'Push back.' }
			],
			synthesize: true
		})
	}).run();

	db.insert(schema.parties).values({ id: 'party-1', displayName: 'me' }).run();
}

describe('orchestrator', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
		seedMiniCouncil(db);
	});

	it('emits table_opened before the first round', async () => {
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			dilemma: 'Should I take the job?',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		expect(events[0].type).toBe('table_opened');
	});

	it('emits round_started for each round', async () => {
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		const roundStarts = events.filter((e) => e.type === 'round_started');
		expect(roundStarts.length).toBe(2);
		expect((roundStarts[0] as any).kind).toBe('opening');
		expect((roundStarts[1] as any).kind).toBe('cross_examination');
	});

	it('emits persona_turn_started and persona_turn_completed for each persona in each round', async () => {
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		const turnStarts = events.filter((e) => e.type === 'persona_turn_started');
		const turnCompletes = events.filter((e) => e.type === 'persona_turn_completed');
		// 2 personas × 2 rounds = 4 turn starts/completes
		expect(turnStarts.length).toBe(4);
		expect(turnCompletes.length).toBe(4);
	});

	it('emits synthesis_started and table_closed at the end', async () => {
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		const types = events.map((e) => e.type);
		expect(types).toContain('synthesis_started');
		expect(types[types.length - 1]).toBe('table_closed');
	});

	it('persists all turns to the database', async () => {
		for await (const _ of runDeliberation(db, {
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			// consume all events
		}

		const turns = db.select().from(schema.turns).all();
		// 2 personas × 2 rounds + 1 synthesis = 5 turns
		expect(turns.length).toBe(5);
	});

	it('stores synthesis on the table row', async () => {
		let tableId = '';
		for await (const event of runDeliberation(db, {
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			if (event.type === 'table_opened') tableId = event.tableId;
		}

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		expect(table).toBeDefined();
		expect(table!.synthesis).toBeTruthy();
		expect(table!.status).toBe('completed');
	});
});

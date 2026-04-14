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

/** Pre-create a table row so the orchestrator can use it */
function createTable(db: TestDb, id: string, dilemma: string, councilId: string, partyId: string) {
	db.insert(schema.tables).values({
		id,
		dilemma,
		councilId,
		status: 'pending'
	}).run();
	db.insert(schema.tableParties).values({ tableId: id, partyId, role: 'initiator' }).run();
}

describe('orchestrator', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
		seedMiniCouncil(db);
	});

	it('emits table_opened before the first round', async () => {
		createTable(db, 'tbl-1', 'Should I take the job?', 'test-council', 'party-1');
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-1',
			dilemma: 'Should I take the job?',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		expect(events[0].type).toBe('table_opened');
		expect((events[0] as any).tableId).toBe('tbl-1');
	});

	it('emits round_started for each round', async () => {
		createTable(db, 'tbl-2', 'Test dilemma', 'test-council', 'party-1');
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-2',
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
		createTable(db, 'tbl-3', 'Test dilemma', 'test-council', 'party-1');
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-3',
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
		createTable(db, 'tbl-4', 'Test dilemma', 'test-council', 'party-1');
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-4',
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
		createTable(db, 'tbl-5', 'Test dilemma', 'test-council', 'party-1');
		for await (const _ of runDeliberation(db, {
			tableId: 'tbl-5',
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
		createTable(db, 'tbl-6', 'Test dilemma', 'test-council', 'party-1');
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-6',
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			// consume all events
		}

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-6')).get();
		expect(table).toBeDefined();
		expect(table!.synthesis).toBeTruthy();
		expect(table!.status).toBe('completed');
	});

	it('updates table status to running when deliberation starts', async () => {
		createTable(db, 'tbl-7', 'Test dilemma', 'test-council', 'party-1');

		// Verify starts as pending
		const before = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-7')).get();
		expect(before!.status).toBe('pending');

		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-7',
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
			// Check status after first event
			if (events.length === 1) {
				const during = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-7')).get();
				expect(during!.status).toBe('running');
			}
		}
	});

	it('passes council model_config to completeFn', async () => {
		// Create a council with explicit model_config
		db.insert(schema.councils).values({
			id: 'configured-council',
			name: 'Configured',
			personaIds: JSON.stringify(['elder']),
			synthesisPrompt: 'Synthesize.',
			roundStructure: JSON.stringify({
				rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
				synthesize: false
			}),
			modelConfig: JSON.stringify({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' })
		}).run();

		createTable(db, 'tbl-cfg', 'Config test', 'configured-council', 'party-1');

		const receivedConfigs: Array<{ model: string; provider?: string }> = [];
		const trackingComplete = async (req: any) => {
			receivedConfigs.push({ model: req.model, provider: req.modelConfig?.provider });
			return mockComplete(req);
		};

		for await (const _ of runDeliberation(db, {
			tableId: 'tbl-cfg',
			dilemma: 'Config test',
			councilId: 'configured-council',
			partyId: 'party-1',
			completeFn: trackingComplete
		})) {
			// consume
		}

		expect(receivedConfigs.length).toBeGreaterThan(0);
		expect(receivedConfigs[0].model).toBe('claude-sonnet-4-20250514');
		expect(receivedConfigs[0].provider).toBe('anthropic');
	});

	it('sets table status to failed when completeFn throws', async () => {
		createTable(db, 'tbl-fail', 'Failure test', 'test-council', 'party-1');

		const failingComplete = async () => {
			throw new Error('LLM provider down');
		};

		const events: SseEvent[] = [];
		try {
			for await (const event of runDeliberation(db, {
				tableId: 'tbl-fail',
				dilemma: 'Failure test',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: failingComplete
			})) {
				events.push(event);
			}
		} catch (err: any) {
			expect(err.message).toBe('LLM provider down');
		}

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-fail')).get();
		expect(table!.status).toBe('failed');
	});

	it('throws when council does not exist', async () => {
		createTable(db, 'tbl-nocouncil', 'No council', 'nonexistent', 'party-1');

		let threw = false;
		try {
			for await (const _ of runDeliberation(db, {
				tableId: 'tbl-nocouncil',
				dilemma: 'No council',
				councilId: 'nonexistent',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				// consume
			}
		} catch (err: any) {
			threw = true;
			expect(err.message).toContain('Council not found');
		}
		expect(threw).toBe(true);
	});

	it('filters out personas with unmet feature requirements', async () => {
		// Add a persona that requires "memory" (unavailable in M1)
		db.insert(schema.personas).values({
			id: 'needs-memory',
			name: 'Memory Persona',
			emoji: '🧠',
			systemPrompt: 'You need memory.',
			requires: JSON.stringify(['memory'])
		}).run();

		// Create a council that includes both a normal persona and the gated one
		db.insert(schema.councils).values({
			id: 'gated-council',
			name: 'Gated',
			personaIds: JSON.stringify(['elder', 'needs-memory']),
			synthesisPrompt: 'Summarize.',
			roundStructure: JSON.stringify({
				rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
				synthesize: false
			})
		}).run();

		createTable(db, 'tbl-gated', 'Feature test', 'gated-council', 'party-1');

		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-gated',
			dilemma: 'Feature test',
			councilId: 'gated-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		// Only elder should have turns — needs-memory should be filtered out
		const turnStarts = events.filter((e) => e.type === 'persona_turn_started');
		expect(turnStarts.length).toBe(1);
		expect((turnStarts[0] as any).personaName).toBe('The Elder');
	});

	it('skips synthesis when council has synthesize: false', async () => {
		db.insert(schema.councils).values({
			id: 'no-synth',
			name: 'No Synthesis',
			personaIds: JSON.stringify(['elder']),
			synthesisPrompt: 'Should not run.',
			roundStructure: JSON.stringify({
				rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
				synthesize: false
			})
		}).run();

		createTable(db, 'tbl-nosynth', 'No synthesis test', 'no-synth', 'party-1');

		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-nosynth',
			dilemma: 'No synthesis test',
			councilId: 'no-synth',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		const types = events.map((e) => e.type);
		expect(types).not.toContain('synthesis_started');
		expect(types).not.toContain('synthesis_token');
		expect(types[types.length - 1]).toBe('table_closed');

		// No synthesis turn in DB
		const turns = db.select().from(schema.turns).all();
		const synthesisTurns = turns.filter((t) => t.round === 0);
		expect(synthesisTurns.length).toBe(0);

		// Table should be marked completed even without synthesis
		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-nosynth')).get();
		expect(table!.status).toBe('completed');
		expect(table!.synthesis).toBeNull();
	});
});

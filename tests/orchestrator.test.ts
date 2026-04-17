// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { runDeliberation } from '../src/lib/server/orchestrator';
import type { SseEvent } from '../src/lib/schemas/events';
import { createTestDb, mockComplete, type TestDb } from './helpers';
import { seedMiniCouncil, createTable } from './fixtures';

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
		for await (const _ of runDeliberation(db, {
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

	it('transitions table from pending to running to completed', async () => {
		createTable(db, 'tbl-7', 'Test dilemma', 'test-council', 'party-1');

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
			if (events.length === 1) {
				const during = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-7')).get();
				expect(during!.status).toBe('running');
			}
		}

		const after = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-7')).get();
		expect(after!.status).toBe('completed');
	});

	it('passes council model_config to completeFn', async () => {
		// Create a council with explicit model_config
		db.insert(schema.councils)
			.values({
				id: 'configured-council',
				name: 'Configured',
				personaIds: JSON.stringify(['elder']),
				synthesisPrompt: 'Synthesize.',
				roundStructure: JSON.stringify({
					rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
					synthesize: false
				}),
				modelConfig: JSON.stringify({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' })
			})
			.run();

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

	it('fails when the LLM returns an empty stream (no tokens)', async () => {
		createTable(db, 'tbl-empty', 'Empty response test', 'test-council', 'party-1');

		const emptyComplete = async () => ({
			textStream: (async function* () {
				// yields nothing
			})()
		});

		const events: SseEvent[] = [];
		let threw = false;
		try {
			for await (const event of runDeliberation(db, {
				tableId: 'tbl-empty',
				dilemma: 'Empty response test',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: emptyComplete
			})) {
				events.push(event);
			}
		} catch (err: any) {
			threw = true;
			// Message should name the persona so ops can diagnose which provider call silently failed
			expect(err.message).toMatch(/empty|no tokens/i);
		}
		expect(threw).toBe(true);

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-empty')).get();
		expect(table!.status).toBe('failed');
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
		expect(table!.errorMessage).toBe('LLM provider down');
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
		db.insert(schema.personas)
			.values({
				id: 'needs-memory',
				name: 'Memory Persona',
				emoji: '🧠',
				systemPrompt: 'You need memory.',
				requires: JSON.stringify(['memory'])
			})
			.run();

		// Create a council that includes both a normal persona and the gated one
		db.insert(schema.councils)
			.values({
				id: 'gated-council',
				name: 'Gated',
				personaIds: JSON.stringify(['elder', 'needs-memory']),
				synthesisPrompt: 'Summarize.',
				roundStructure: JSON.stringify({
					rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
					synthesize: false
				})
			})
			.run();

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
		db.insert(schema.councils)
			.values({
				id: 'no-synth',
				name: 'No Synthesis',
				personaIds: JSON.stringify(['elder']),
				synthesisPrompt: 'Should not run.',
				roundStructure: JSON.stringify({
					rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
					synthesize: false
				})
			})
			.run();

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

	it('stops deliberation when abort signal fires between rounds', async () => {
		createTable(db, 'tbl-abort', 'Abort test', 'test-council', 'party-1');

		const controller = new AbortController();

		const events: SseEvent[] = [];
		try {
			for await (const event of runDeliberation(db, {
				tableId: 'tbl-abort',
				dilemma: 'Abort test',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: mockComplete,
				signal: controller.signal
			})) {
				events.push(event);
				// Abort after round 1 finishes but before round 2 starts.
				// Parallel within-round means we can't cancel mid-round;
				// between-rounds is the natural seam.
				if (
					event.type === 'persona_turn_completed' &&
					events.filter((e) => e.type === 'persona_turn_completed').length === 2
				) {
					controller.abort();
				}
			}
		} catch (err: any) {
			expect(err.message).toContain('aborted');
		}

		// Round 1 completed (2 personas), round 2 never started.
		const allTurnCompletes = events.filter((e) => e.type === 'persona_turn_completed');
		expect(allTurnCompletes.length).toBe(2);
		const roundStarts = events.filter((e) => e.type === 'round_started');
		expect(roundStarts.length).toBe(1);

		// Table should be marked failed (aborted = not completed)
		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'tbl-abort')).get();
		expect(table!.status).toBe('failed');
	});

	it('runs all personas concurrently within a round', async () => {
		createTable(db, 'tbl-parallel', 'Test dilemma', 'test-council', 'party-1');

		let inFlight = 0;
		let maxConcurrent = 0;
		const gate = Promise.withResolvers<void>();
		let started = 0;

		const trackingComplete = async (opts: any) => {
			inFlight++;
			maxConcurrent = Math.max(maxConcurrent, inFlight);
			started++;
			// Wait until all personas in the round have started before letting any finish
			if (started >= 2) gate.resolve();
			await gate.promise;
			inFlight--;
			return mockComplete(opts);
		};

		for await (const _ of runDeliberation(db, {
			tableId: 'tbl-parallel',
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: trackingComplete
		})) {
			// consume
		}

		// Both personas must have been in flight at the same time.
		expect(maxConcurrent).toBeGreaterThanOrEqual(2);
	});

	it('persists turns in council order regardless of completion order', async () => {
		createTable(db, 'tbl-order', 'Test dilemma', 'test-council', 'party-1');

		// Elder intentionally finishes *after* Mirror — mimics real API jitter.
		// Council order is [elder, mirror]; the DB should reflect that order.
		const delayedComplete = async (opts: any) => {
			const isElder = opts.system.toLowerCase().includes('elder');
			if (isElder) await new Promise((r) => setTimeout(r, 20));
			return mockComplete(opts);
		};

		for await (const _ of runDeliberation(db, {
			tableId: 'tbl-order',
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: delayedComplete
		})) {
			// consume
		}

		// Round 1 persona turns in insertion order.
		const round1 = db
			.select()
			.from(schema.turns)
			.where(eq(schema.turns.round, 1))
			.all()
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
		expect(round1.map((t) => t.personaName)).toEqual(['The Elder', 'The Mirror']);
	});

	it('emits persona_turn_started for all personas in a round before any tokens', async () => {
		createTable(db, 'tbl-stagger', 'Test dilemma', 'test-council', 'party-1');
		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-stagger',
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mockComplete
		})) {
			events.push(event);
		}

		// Inside round 1: persona_turn_started events for both personas must
		// precede the first token event so the frontend can open N cards upfront.
		const round1Start = events.findIndex((e) => e.type === 'round_started');
		const round2Start = events.findIndex(
			(e, i) => i > round1Start && e.type === 'round_started'
		);
		const round1Events = events.slice(round1Start, round2Start);

		const firstTokenIdx = round1Events.findIndex((e) => e.type === 'token');
		const turnStartsBeforeFirstToken = round1Events
			.slice(0, firstTokenIdx)
			.filter((e) => e.type === 'persona_turn_started');
		expect(turnStartsBeforeFirstToken.length).toBe(2);
	});
});

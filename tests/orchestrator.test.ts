// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { SseEvent } from '../src/lib/schemas/events';
import * as schema from '../src/lib/server/db/schema';
import { runDeliberation } from '../src/lib/server/orchestrator';
import { createTable, seedMiniCouncil } from './fixtures';
import { createTestDb, mockComplete, type TestDb } from './helpers';

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

	it('sums totalTokens across all completeFn calls and reports on table_closed', async () => {
		// Critical for demo budget reconcile: if this math is wrong, the
		// pre-charge / actuals diff is computed against a bad number and
		// the daily cap drifts on every demo.
		createTable(db, 'tbl-tokens', 'Token sum test', 'test-council', 'party-1');

		const PER_CALL = 250;
		const callTokens: number[] = [];
		const trackingComplete = async () => {
			callTokens.push(PER_CALL);
			return {
				textStream: (async function* () {
					yield 'fixed';
				})(),
				finished: Promise.resolve({ truncated: false, totalTokens: PER_CALL })
			};
		};

		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-tokens',
			dilemma: 'Token sum test',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: trackingComplete
		})) {
			events.push(event);
		}

		// 2 personas × 2 rounds + 1 synthesis = 5 calls
		expect(callTokens).toHaveLength(5);
		const closed = events.find((e) => e.type === 'table_closed') as Extract<
			SseEvent,
			{ type: 'table_closed' }
		>;
		expect(closed.totalTokens).toBe(PER_CALL * callTokens.length);
	});

	it('reports totalTokens=undefined when ANY completeFn omits usage', async () => {
		// Mixed-provider council (one mock without usage among reporting ones)
		// must downgrade to undefined rather than under-count silently.
		createTable(db, 'tbl-mixed', 'Mixed test', 'test-council', 'party-1');

		let i = 0;
		const mixedComplete = async () => ({
			textStream: (async function* () {
				yield 'x';
			})(),
			finished: Promise.resolve(
				i++ === 0 ? { truncated: false, totalTokens: 100 } : { truncated: false }
			)
		});

		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-mixed',
			dilemma: 'Mixed test',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: mixedComplete
		})) {
			events.push(event);
		}

		const closed = events.find((e) => e.type === 'table_closed') as Extract<
			SseEvent,
			{ type: 'table_closed' }
		>;
		expect(closed.totalTokens).toBeUndefined();
	});

	it('reports totalTokens=0 when every call returned 0 (cached / synthetic provider)', async () => {
		// Sum is 0, NOT undefined — reconcile then refunds the entire
		// pre-charge, which is correct for a "cached zero-cost" deliberation.
		createTable(db, 'tbl-zero', 'Zero test', 'test-council', 'party-1');

		const zeroComplete = async () => ({
			textStream: (async function* () {
				yield 'cached';
			})(),
			finished: Promise.resolve({ truncated: false, totalTokens: 0 })
		});

		const events: SseEvent[] = [];
		for await (const event of runDeliberation(db, {
			tableId: 'tbl-zero',
			dilemma: 'Zero test',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: zeroComplete
		})) {
			events.push(event);
		}

		const closed = events.find((e) => e.type === 'table_closed') as Extract<
			SseEvent,
			{ type: 'table_closed' }
		>;
		expect(closed.totalTokens).toBe(0);
	});

	it('passes council model_config to completeFn', async () => {
		// Create a council with explicit model_config
		db.insert(schema.councils)
			.values({
				id: 'configured-council',
				name: 'Configured',
				personaIds: ['elder'],
				synthesisPrompt: 'Synthesize.',
				roundStructure: {
					rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
					synthesize: false
				},
				modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }
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
			})(),
			finished: Promise.resolve({ truncated: false })
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

	it('sets table status to failed when an early load error throws', async () => {
		// Regression: errors raised before the orchestrator's main try
		// (e.g. council load, model-config resolution, persona load)
		// used to leave the row stuck in 'pending', so the UI showed
		// "Deliberation in progress" forever. The whole generator body
		// must be guarded so any throw transitions status to 'failed'.
		createTable(db, 'tbl-early-fail', 'Early-fail test', 'nonexistent', 'party-1');

		try {
			for await (const _ of runDeliberation(db, {
				tableId: 'tbl-early-fail',
				dilemma: 'Early-fail test',
				councilId: 'nonexistent',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				// consume
			}
		} catch {
			// expected
		}

		const table = db
			.select()
			.from(schema.tables)
			.where(eq(schema.tables.id, 'tbl-early-fail'))
			.get();
		expect(table!.status).toBe('failed');
		expect(table!.errorMessage).toMatch(/council not found/i);
	});

	it('filters out personas with unmet feature requirements', async () => {
		// Add a persona that requires "memory" (unavailable in M1)
		db.insert(schema.personas)
			.values({
				id: 'needs-memory',
				name: 'Memory Persona',
				emoji: '🧠',
				systemPrompt: 'You need memory.',
				requires: ['memory']
			})
			.run();

		// Create a council that includes both a normal persona and the gated one
		db.insert(schema.councils)
			.values({
				id: 'gated-council',
				name: 'Gated',
				personaIds: ['elder', 'needs-memory'],
				synthesisPrompt: 'Summarize.',
				roundStructure: {
					rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
					synthesize: false
				}
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
				personaIds: ['elder'],
				synthesisPrompt: 'Should not run.',
				roundStructure: {
					rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }],
					synthesize: false
				}
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
		const round2Start = events.findIndex((e, i) => i > round1Start && e.type === 'round_started');
		const round1Events = events.slice(round1Start, round2Start);

		const firstTokenIdx = round1Events.findIndex((e) => e.type === 'token');
		const turnStartsBeforeFirstToken = round1Events
			.slice(0, firstTokenIdx)
			.filter((e) => e.type === 'persona_turn_started');
		expect(turnStartsBeforeFirstToken.length).toBe(2);
	});

	it('persists truncated=1 on turns where the LLM hit maxOutputTokens', async () => {
		createTable(db, 'tbl-trunc', 'Test dilemma', 'test-council', 'party-1');

		const truncatingComplete = async (opts: any) => {
			const base = await mockComplete(opts);
			// Only truncate Elder — Mirror finishes normally.
			const truncated = opts.system.toLowerCase().includes('elder');
			return { ...base, finished: Promise.resolve({ truncated }) };
		};

		for await (const _ of runDeliberation(db, {
			tableId: 'tbl-trunc',
			dilemma: 'Test dilemma',
			councilId: 'test-council',
			partyId: 'party-1',
			completeFn: truncatingComplete
		})) {
			// consume
		}

		const turns = db.select().from(schema.turns).where(eq(schema.turns.tableId, 'tbl-trunc')).all();
		const elderTurns = turns.filter((t) => t.personaName === 'The Elder');
		const mirrorTurns = turns.filter((t) => t.personaName === 'The Mirror');
		expect(elderTurns.every((t) => t.truncated === 1)).toBe(true);
		expect(mirrorTurns.every((t) => t.truncated === 0)).toBe(true);
	});

	describe('invariant #8: visible_to in multi-party tables', () => {
		it('persona turns in a multi-party table are private to the running party', async () => {
			// Two-party table: A is initiator, B is invited
			db.insert(schema.parties).values({ id: 'party-B', displayName: 'B' }).run();
			createTable(db, 'tbl-mp', 'shared dilemma', 'test-council', 'party-1');
			db.insert(schema.tableParties)
				.values({ tableId: 'tbl-mp', partyId: 'party-B', role: 'invited' })
				.run();

			for await (const _ of runDeliberation(db, {
				tableId: 'tbl-mp',
				dilemma: 'shared dilemma',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				// consume
			}

			const personaTurns = db
				.select()
				.from(schema.turns)
				.where(eq(schema.turns.tableId, 'tbl-mp'))
				.all()
				.filter((t) => t.partyId !== 'synthesizer');

			expect(personaTurns.length).toBeGreaterThan(0);
			for (const t of personaTurns) {
				expect(t.visibleTo).toEqual(['party-1']);
			}
		});

		it('does not auto-run synthesis in a multi-party table (deferred to manual trigger)', async () => {
			db.insert(schema.parties).values({ id: 'party-B', displayName: 'B' }).run();
			createTable(db, 'tbl-mp2', 'shared dilemma', 'test-council', 'party-1');
			db.insert(schema.tableParties)
				.values({ tableId: 'tbl-mp2', partyId: 'party-B', role: 'invited' })
				.run();

			for await (const _ of runDeliberation(db, {
				tableId: 'tbl-mp2',
				dilemma: 'shared dilemma',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				// consume
			}

			const synth = db
				.select()
				.from(schema.turns)
				.where(eq(schema.turns.tableId, 'tbl-mp2'))
				.all()
				.find((t) => t.partyId === 'synthesizer');
			expect(synth).toBeUndefined();

			// Table stays 'running' until synthesis trigger fires.
			const table = db
				.select()
				.from(schema.tables)
				.where(eq(schema.tables.id, 'tbl-mp2'))
				.get();
			expect(table?.status).toBe('running');
		});

		it('respects tables.max_rounds: 4 rounds when council defines 2', async () => {
			createTable(db, 'tbl-rounds', 'd', 'test-council', 'party-1');
			db.update(schema.tables)
				.set({ maxRounds: 4 })
				.where(eq(schema.tables.id, 'tbl-rounds'))
				.run();

			const events: SseEvent[] = [];
			for await (const e of runDeliberation(db, {
				tableId: 'tbl-rounds',
				dilemma: 'd',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				events.push(e);
			}

			const rounds = events.filter((e) => e.type === 'round_started');
			expect(rounds).toHaveLength(4);
		});

		it("marks the running party's runStatus completed at end of run", async () => {
			db.insert(schema.parties).values({ id: 'party-B', displayName: 'B' }).run();
			createTable(db, 'tbl-mp3', 'shared dilemma', 'test-council', 'party-1');
			db.insert(schema.tableParties)
				.values({ tableId: 'tbl-mp3', partyId: 'party-B', role: 'invited' })
				.run();

			for await (const _ of runDeliberation(db, {
				tableId: 'tbl-mp3',
				dilemma: 'shared dilemma',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				// consume
			}

			const links = db
				.select()
				.from(schema.tableParties)
				.where(eq(schema.tableParties.tableId, 'tbl-mp3'))
				.all();
			const a = links.find((l) => l.partyId === 'party-1');
			const b = links.find((l) => l.partyId === 'party-B');
			expect(a?.runStatus).toBe('completed');
			// B never ran — still pending, so they can claim later
			expect(b?.runStatus).toBe('pending');
		});

		it('single-party table keeps the existing visible_to = [all parties] shape', async () => {
			createTable(db, 'tbl-sp', 'solo dilemma', 'test-council', 'party-1');

			for await (const _ of runDeliberation(db, {
				tableId: 'tbl-sp',
				dilemma: 'solo dilemma',
				councilId: 'test-council',
				partyId: 'party-1',
				completeFn: mockComplete
			})) {
				// consume
			}

			const personaTurns = db
				.select()
				.from(schema.turns)
				.where(eq(schema.turns.tableId, 'tbl-sp'))
				.all()
				.filter((t) => t.partyId !== 'synthesizer');

			for (const t of personaTurns) {
				expect(t.visibleTo).toEqual(['party-1']);
			}
		});
	});
});

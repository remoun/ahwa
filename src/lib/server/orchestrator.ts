// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { Events, type SseEvent } from '../schemas/events';
import { errorMessage } from '../util';
import type { DB } from './db';
import * as schema from './db/schema';
import { filterPersonas } from './features';
import {
	complete as defaultComplete,
	type CompleteRequest,
	type CompleteResult,
	resolveCouncilModelConfig,
	resolveModelConfig
} from './llm';
import type { TableBus } from './table-bus';

type CompleteFn = (request: CompleteRequest) => Promise<CompleteResult>;

export interface DeliberationRequest {
	tableId: string;
	dilemma: string;
	councilId: string;
	partyId: string;
	bus: TableBus;
	completeFn?: CompleteFn;
	signal?: AbortSignal;
}

type PersonaRow = typeof schema.personas.$inferSelect;
type CouncilRow = typeof schema.councils.$inferSelect;

interface RoundDef {
	kind: string;
	prompt_suffix: string;
}

type RoundTurn = { personaName: string; text: string };
type ConsensusVerdict = { verdict: 'consensus' | 'continue'; reason: string };

/**
 * Run a full deliberation as an async generator of typed SSE events.
 * The caller (SSE endpoint) iterates and serializes each event.
 *
 * Thin wrapper around Orchestrator: prepare context, drive the state
 * machine, surface failures. The class holds the deliberation's
 * mutable state (turns-so-far, token accumulators) so the helpers
 * don't have to re-thread it through every signature.
 */
export async function* runDeliberation(
	db: DB,
	request: DeliberationRequest
): AsyncGenerator<SseEvent> {
	// Preflight: missing-row and terminal-state errors throw without
	// any DB writes — re-issuing a deliberation against a completed
	// table shouldn't degrade the calling party's status to 'failed'.
	// Only failures past this point go through markPartyFailed.
	preflight(db, request.tableId);

	try {
		const ctx = prepareContext(db, request);
		const orchestrator = new Orchestrator(ctx);
		yield* orchestrator.run();
	} catch (err) {
		// Catches both preparation errors (council not found, persona
		// load issues, etc.) and run-time errors. The original
		// implementation wrapped the whole generator body in one try;
		// preserve that — otherwise an early load error leaves the
		// table stuck in 'pending'.
		markPartyFailed(db, request.tableId, request.partyId, err);
		request.bus.publish(request.tableId, Events.partyRunFailed(request.partyId));
		throw err;
	}
}

function preflight(db: DB, tableId: string): void {
	const existing = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
	if (!existing) throw new Error(`Table not found: ${tableId}`);
	if (existing.status !== 'pending' && existing.status !== 'running') {
		throw new Error(`Table is in terminal state: ${existing.status}`);
	}
}

/**
 * Loaded + validated state for one party's run. All immutable; the
 * Orchestrator class owns the mutable per-run state on top of this.
 */
interface DeliberationContext {
	db: DB;
	bus: TableBus;
	tableId: string;
	partyId: string;
	dilemma: string;
	stance: string | null;
	council: CouncilRow;
	personas: PersonaRow[];
	roundPlan: RoundDef[];
	visibleTo: string[];
	synthVisibleTo: string[];
	isMultiParty: boolean;
	consensusEnabled: boolean;
	consensusMaxRounds: number;
	targetRoundCount: number;
	resolvedConfig: ReturnType<typeof resolveModelConfig>;
	completeFn: CompleteFn;
	signal: AbortSignal | undefined;
}

function prepareContext(db: DB, request: DeliberationRequest): DeliberationContext {
	const {
		tableId,
		dilemma,
		councilId,
		partyId,
		bus,
		completeFn = defaultComplete,
		signal
	} = request;

	// Preflight already verified the row exists and isn't terminal; the
	// re-fetch here is just for the snapshot fields we need below.
	const existing = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get()!;

	const council = db.select().from(schema.councils).where(eq(schema.councils.id, councilId)).get();
	if (!council) throw new Error(`Council not found: ${councilId}`);
	// JSON-mode columns: Drizzle gives us parsed values directly. The
	// shape is enforced at write time via Zod (CouncilBodySchema +
	// council seed JSON validation), so trust the read.
	if (!council.personaIds) throw new Error(`council.${councilId}: missing personaIds`);
	if (!council.roundStructure) throw new Error(`council.${councilId}: missing roundStructure`);

	// AHWA_COUNCIL_<ID>_PROVIDER + _MODEL env vars override the stored
	// config — lets a deploy re-pin demo (or any other council) without
	// editing the council JSON.
	const modelConfig = resolveCouncilModelConfig(councilId, council.modelConfig ?? undefined);
	const resolvedConfig = resolveModelConfig(modelConfig);

	const allPersonas = db.select().from(schema.personas).all();
	const requestedPersonas: PersonaRow[] = council.personaIds
		.map((id) => allPersonas.find((p) => p.id === id))
		.filter((p): p is PersonaRow => p !== undefined);
	const { eligible: personas, excluded } = filterPersonas(requestedPersonas);
	if (excluded.length > 0) {
		// Warn visibly when personas are dropped — invariant #10 says the UI
		// should surface this. For M1 we log; M3 adds proper UI warnings.
		console.warn(
			`orchestrator: excluded ${excluded.length} persona(s) from council "${councilId}" due to unmet feature requirements: ${excluded.map((p) => p.id).join(', ')}`
		);
	}

	// Invariant #8: in multi-party tables, each party's raw persona
	// turns are private to that party (and the synthesizer) until an
	// explicit reveal. In single-party tables, visible_to = [all
	// parties] (which collapses to [partyId] in practice).
	// Synthesis turns always go to every party.
	const allPartyIds = db
		.select({ partyId: schema.tableParties.partyId })
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all()
		.map((r) => r.partyId);
	const isMultiParty = allPartyIds.length > 1;
	const visibleTo = isMultiParty ? [partyId] : allPartyIds.length > 0 ? allPartyIds : [partyId];
	const synthVisibleTo = allPartyIds.length > 0 ? allPartyIds : [partyId];

	const partyLink = db
		.select()
		.from(schema.tableParties)
		.where(and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId)))
		.get();
	const stance = partyLink?.stance ?? null;

	// Set status to 'running' if it wasn't already (guard may have done it).
	if (existing.status === 'pending') {
		db.update(schema.tables)
			.set({ status: 'running', updatedAt: Date.now() })
			.where(eq(schema.tables.id, tableId))
			.run();
	}

	// Stopping configuration. 'rounds' (default) caps at maxRounds (or
	// council default). 'consensus' adds a per-round LLM check after
	// the defined rounds; consensusMaxRounds is the hard cap.
	const definedRounds = council.roundStructure.rounds;
	const consensusEnabled =
		existing.consensusTarget === 'consensus' && council.consensusCheck?.enabled === true;
	const consensusMaxRounds = council.consensusCheck?.max_rounds ?? 8;
	const targetRoundCount =
		existing.maxRounds && existing.maxRounds > 0 ? existing.maxRounds : definedRounds.length;

	return {
		db,
		bus,
		tableId,
		partyId,
		dilemma,
		stance,
		council,
		personas,
		roundPlan: definedRounds,
		visibleTo,
		synthVisibleTo,
		isMultiParty,
		consensusEnabled,
		consensusMaxRounds,
		targetRoundCount,
		resolvedConfig,
		completeFn,
		signal
	};
}

/**
 * State machine for one party's deliberation. Holds mutable per-run
 * state (turns-so-far map, token accumulators) so the helper methods
 * don't have to re-thread it through every signature.
 */
class Orchestrator {
	private turnsByRound: Map<number, RoundTurn[]> = new Map();
	private summedTotalTokens = 0;
	private allCallsReportedUsage = true;

	constructor(private readonly ctx: DeliberationContext) {}

	/** Drive the deliberation end-to-end. */
	async *run(): AsyncGenerator<SseEvent> {
		const { tableId, partyId, bus, isMultiParty, council, signal } = this.ctx;

		yield { type: 'table_opened', tableId };
		// Tell every other viewer this party started running. Their
		// MultiPartyControls re-renders the badge from "pending" → "running".
		bus.publish(tableId, Events.partyRunStarted(partyId));

		// Run rounds. Personas within a round run in parallel; rounds
		// themselves are serial because each round reads the complete
		// transcript of prior rounds.
		let roundIdx = 0;
		while (true) {
			// Abort between rounds — mid-round cancellation would orphan
			// in-flight LLM calls. Between-rounds is the natural seam.
			if (signal?.aborted) throw new Error('Deliberation aborted');

			yield* this.runOneRound(roundIdx);
			roundIdx++;

			const decision = await this.decideStop(roundIdx);
			if (decision.event) yield decision.event;
			if (decision.stop) break;
		}

		// Synthesis runs inline only for single-party tables. Multi-party
		// tables defer synthesis to a manual trigger that fires after
		// every party has completed their run.
		if (
			!isMultiParty &&
			council.roundStructure!.synthesize &&
			council.synthesisPrompt &&
			!signal?.aborted
		) {
			yield* this.runSynthesisInline();
		}

		this.markSucceeded();
		bus.publish(tableId, Events.partyRunCompleted(partyId));
		yield {
			type: 'table_closed',
			totalTokens: this.allCallsReportedUsage ? this.summedTotalTokens : undefined
		};
	}

	/** Run a single round: emit events, persist turns, update transcript. */
	private async *runOneRound(roundIdx: number): AsyncGenerator<SseEvent> {
		const { personas, dilemma, stance, resolvedConfig, completeFn, roundPlan } = this.ctx;
		const round = roundPlan[Math.min(roundIdx, roundPlan.length - 1)];

		yield { type: 'round_started', round: roundIdx + 1, kind: round.kind };

		// Emit all persona_turn_started events up front so the frontend
		// can open N cards simultaneously. Council order is preserved
		// here regardless of which LLM call finishes first.
		for (const persona of personas) {
			yield {
				type: 'persona_turn_started',
				personaId: persona.id,
				personaName: persona.name ?? persona.id,
				emoji: persona.emoji ?? '💬'
			};
		}

		// Kick off all LLM calls in parallel; persist in council order
		// at the end so reload renders top-to-bottom in council order
		// regardless of which provider call finished first.
		const fullTexts: string[] = personas.map(() => '');
		const truncatedFlags: boolean[] = personas.map(() => false);
		const personaStreams = personas.map((persona, idx) =>
			async function* (this: Orchestrator): AsyncGenerator<SseEvent> {
				const messages = buildMessages(dilemma, stance, round, roundIdx, this.turnsByRound);
				const result = await completeFn({
					model: resolvedConfig.model,
					system: persona.systemPrompt ?? '',
					messages,
					stream: true,
					modelConfig: resolvedConfig
				});

				for await (const chunk of result.textStream) {
					fullTexts[idx] += chunk;
					yield { type: 'token', personaId: persona.id, text: chunk };
				}

				// Empty response = silent provider failure (rate-limit, bad
				// model id, dead connection). Fail loudly instead of
				// persisting an empty turn.
				if (fullTexts[idx] === '') {
					throw new Error(
						`LLM returned empty response for ${persona.name ?? persona.id} (provider: ${resolvedConfig.provider}, model: ${resolvedConfig.model}). Check provider credentials and model availability.`
					);
				}

				// Truncation isn't fatal (we have partial content) but
				// worth flagging so a reloader sees the text is incomplete
				// and ops can decide whether to raise the cap.
				const { truncated, totalTokens } = await result.finished;
				truncatedFlags[idx] = truncated;
				this.accumulateUsage(totalTokens);
				if (truncated) {
					console.warn(
						`orchestrator: persona "${persona.name ?? persona.id}" was truncated at maxOutputTokens in round ${roundIdx + 1}`
					);
				}

				yield { type: 'persona_turn_completed', personaId: persona.id };
			}.call(this)
		);

		for await (const event of mergeAsync(personaStreams)) {
			yield event;
		}

		this.persistRoundTurns(roundIdx, personas, fullTexts, truncatedFlags);
	}

	private persistRoundTurns(
		roundIdx: number,
		personas: PersonaRow[],
		fullTexts: string[],
		truncatedFlags: boolean[]
	): void {
		const { db, tableId, partyId, visibleTo } = this.ctx;
		const roundTurns: RoundTurn[] = [];
		for (let i = 0; i < personas.length; i++) {
			const persona = personas[i];
			db.insert(schema.turns)
				.values({
					id: nanoid(),
					tableId,
					round: roundIdx + 1,
					partyId,
					personaName: persona.name,
					text: fullTexts[i],
					visibleTo,
					truncated: truncatedFlags[i] ? 1 : 0
				})
				.run();
			roundTurns.push({ personaName: persona.name ?? persona.id, text: fullTexts[i] });
		}
		this.turnsByRound.set(roundIdx, roundTurns);
	}

	/** Inline synthesis for single-party tables. */
	private async *runSynthesisInline(): AsyncGenerator<SseEvent> {
		const { db, tableId, council, completeFn, resolvedConfig, synthVisibleTo } = this.ctx;
		yield { type: 'synthesis_started' };

		const allTurns = Array.from(this.turnsByRound.values()).flat();
		const deliberationText = allTurns.map((t) => `**${t.personaName}:** ${t.text}`).join('\n\n');

		// Synthesis is the load-bearing output users actually act on —
		// letting ops swap in a stronger model just for this one call
		// (e.g. Opus for a Sonnet default) buys depth on the only part
		// of a deliberation that's a recommendation, for ~1/N of cost.
		const synthesisModel = process.env.AHWA_SYNTHESIS_MODEL || resolvedConfig.model;
		const synthesisConfig = { ...resolvedConfig, model: synthesisModel };

		const result = await completeFn({
			model: synthesisModel,
			system: council.synthesisPrompt!,
			messages: [
				{ role: 'user', content: `Here is the full deliberation:\n\n${deliberationText}` }
			],
			stream: true,
			modelConfig: synthesisConfig
		});

		let synthesisText = '';
		for await (const chunk of result.textStream) {
			synthesisText += chunk;
			yield { type: 'synthesis_token', text: chunk };
		}
		const { truncated: synthTruncated, totalTokens: synthTokens } = await result.finished;
		this.accumulateUsage(synthTokens);
		if (synthTruncated) console.warn('orchestrator: synthesis was truncated at maxOutputTokens');

		db.insert(schema.turns)
			.values({
				id: nanoid(),
				tableId,
				round: 0, // synthesis is round 0
				partyId: 'synthesizer',
				personaName: 'Synthesizer',
				text: synthesisText,
				visibleTo: synthVisibleTo,
				truncated: synthTruncated ? 1 : 0
			})
			.run();
		db.update(schema.tables)
			.set({ synthesis: synthesisText, updatedAt: Date.now() })
			.where(eq(schema.tables.id, tableId))
			.run();
	}

	/**
	 * Decide whether the round loop stops after the round that just
	 * persisted. Three regimes:
	 *   - Fixed-rounds: stop when `roundIdx >= targetRoundCount`.
	 *   - Consensus, before defined rounds done: never stop.
	 *   - Consensus, defined rounds done: hard-cap first; otherwise
	 *     run the check call. 'consensus' verdict stops the loop.
	 */
	private async decideStop(roundIdx: number): Promise<{ stop: boolean; event?: SseEvent }> {
		const { consensusEnabled, roundPlan, consensusMaxRounds, targetRoundCount } = this.ctx;
		if (!consensusEnabled) return { stop: roundIdx >= targetRoundCount };
		// Always play out the council's defined rounds before consensus
		// checks — the structure (opening, cross-examination, etc.)
		// needs room to surface real disagreement first.
		if (roundIdx < roundPlan.length) return { stop: false };
		// Hard cap trumps consensus signal.
		if (roundIdx >= consensusMaxRounds) return { stop: true };

		const verdict = await this.runConsensusCheck();
		return {
			stop: verdict.verdict === 'consensus',
			event: { type: 'consensus_checked', verdict: verdict.verdict, reason: verdict.reason }
		};
	}

	/**
	 * Single check call. Falls through to 'continue' on any error so a
	 * flaky check doesn't end deliberation early — the hard cap is
	 * the runaway guard, not check reliability.
	 */
	private async runConsensusCheck(): Promise<ConsensusVerdict> {
		const { completeFn, resolvedConfig, council } = this.ctx;
		const transcript = Array.from(this.turnsByRound.values())
			.flat()
			.map((t) => `**${t.personaName}:** ${t.text}`)
			.join('\n\n');
		try {
			const result = await completeFn({
				model: resolvedConfig.model,
				system: council.consensusCheck!.prompt,
				messages: [
					{
						role: 'user',
						content: `Read this council deliberation and return a verdict.\n\nReply with EXACTLY one word as the first token: "consensus" if the council's central recommendations clearly align, or "continue" otherwise. After the verdict, give a one-sentence reason.\n\nDeliberation:\n\n${transcript}`
					}
				],
				stream: true,
				modelConfig: resolvedConfig
			});
			let text = '';
			for await (const chunk of result.textStream) text += chunk;
			const { totalTokens } = await result.finished;
			this.accumulateUsage(totalTokens);
			const trimmed = text.trim();
			const verdict: 'consensus' | 'continue' = trimmed.toLowerCase().startsWith('consensus')
				? 'consensus'
				: 'continue';
			return { verdict, reason: trimmed.slice(0, 200) };
		} catch (err) {
			return { verdict: 'continue', reason: `check failed: ${errorMessage(err)}` };
		}
	}

	private accumulateUsage(totalTokens?: number): void {
		if (typeof totalTokens === 'number') this.summedTotalTokens += totalTokens;
		else this.allCallsReportedUsage = false;
	}

	/**
	 * End-of-run DB writes for a successful party. Multi-party tables
	 * stay 'running' on the table row until synthesis fires.
	 */
	private markSucceeded(): void {
		const { db, tableId, partyId, isMultiParty } = this.ctx;
		db.update(schema.tableParties)
			.set({ runStatus: 'completed' })
			.where(
				and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId))
			)
			.run();
		if (!isMultiParty) {
			db.update(schema.tables)
				.set({ status: 'completed', updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		}
	}
}

/**
 * End-of-run failure writes. Free function (not a method) so the outer
 * catch in runDeliberation can call it whether or not preparation
 * succeeded — early load errors don't yet have an Orchestrator. The
 * per-party errorMessage carries the cause; the table-level
 * errorMessage is reserved for the all-failed terminal state (a
 * stale per-party error would mislead anyone reloading after a later
 * successful synthesis).
 */
function markPartyFailed(db: DB, tableId: string, partyId: string, err: unknown): void {
	const message = errorMessage(err);
	db.update(schema.tableParties)
		.set({ runStatus: 'failed', errorMessage: message })
		.where(and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId)))
		.run();
	const allFailed = db
		.select()
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all()
		.every((tp) => tp.runStatus === 'failed');
	db.update(schema.tables)
		.set(
			allFailed
				? { status: 'failed', errorMessage: message, updatedAt: Date.now() }
				: { updatedAt: Date.now() }
		)
		.where(eq(schema.tables.id, tableId))
		.run();
}

function buildMessages(
	dilemma: string,
	stance: string | null,
	round: RoundDef,
	roundIdx: number,
	turnsByRound: Map<number, RoundTurn[]>
): Array<{ role: 'user' | 'assistant'; content: string }> {
	const stanceBlock = stance?.trim()
		? `\n\nThe person you're advising frames it this way:\n\n${stance.trim()}`
		: '';

	if (roundIdx === 0) {
		return [
			{
				role: 'user',
				content: `The person is facing this dilemma:\n\n${dilemma}${stanceBlock}\n\n${round.prompt_suffix}`
			}
		];
	}

	const priorTurns = Array.from(turnsByRound.entries())
		.filter(([idx]) => idx < roundIdx)
		.flatMap(([, turns]) => turns);

	const context = priorTurns.map((t) => `**${t.personaName}:** ${t.text}`).join('\n\n');

	return [
		{
			role: 'user',
			content: `The person is facing this dilemma:\n\n${dilemma}${stanceBlock}\n\nHere is what the council has said so far:\n\n${context}\n\n${round.prompt_suffix}`
		}
	];
}

/**
 * Fair merge of N async iterators: yields items as soon as any source has one
 * ready. If any source rejects, the merged stream rejects (other in-flight
 * sources are left to be GCd — acceptable for orchestrator-scoped lifetimes).
 */
async function* mergeAsync<T>(streams: AsyncGenerator<T>[]): AsyncGenerator<T> {
	const iters = streams.map((s) => s[Symbol.asyncIterator]());
	const pending = new Map<number, Promise<{ idx: number; result: IteratorResult<T> }>>();

	iters.forEach((iter, idx) => {
		pending.set(
			idx,
			iter.next().then((result) => ({ idx, result }))
		);
	});

	while (pending.size > 0) {
		const { idx, result } = await Promise.race(pending.values());
		if (result.done) {
			pending.delete(idx);
		} else {
			yield result.value;
			// Force a macrotask boundary so the HTTP writable can flush
			// between merged yields. Without this, N streams with buffered
			// tokens can loop entirely inside microtasks — each token gets
			// enqueued into the ReadableStream but nothing reaches the
			// socket until the stream closes, which looks to the client
			// like "all responses appear at once."
			await new Promise((resolve) => setImmediate(resolve));
			pending.set(
				idx,
				iters[idx].next().then((result) => ({ idx, result }))
			);
		}
	}
}

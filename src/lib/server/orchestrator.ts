// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
	complete as defaultComplete,
	resolveModelConfig,
	type CompleteRequest,
	type CompleteResult
} from './llm';
import { filterPersonas } from './features';
import { parseJson } from './parse';
import { errorMessage } from '../util';
import { RoundStructureSchema, ModelConfigSchema } from '../schemas/council';
import * as schema from './db/schema';
import type { SseEvent } from '../schemas/events';

const PersonaIdsSchema = z.array(z.string());

type Db = BunSQLiteDatabase<typeof schema>;
type CompleteFn = (request: CompleteRequest) => Promise<CompleteResult>;

export interface DeliberationRequest {
	tableId: string;
	dilemma: string;
	councilId: string;
	partyId: string;
	completeFn?: CompleteFn;
	signal?: AbortSignal;
}

type PersonaRow = typeof schema.personas.$inferSelect;

interface RoundDef {
	kind: string;
	prompt_suffix: string;
}

/**
 * Run a full deliberation as an async generator of typed SSE events.
 * The caller (SSE endpoint) iterates and serializes each event.
 */
export async function* runDeliberation(
	db: Db,
	request: DeliberationRequest
): AsyncGenerator<SseEvent> {
	const { tableId, dilemma, councilId, partyId, completeFn = defaultComplete, signal } = request;

	// Load the council
	const council = db.select().from(schema.councils).where(eq(schema.councils.id, councilId)).get();
	if (!council) throw new Error(`Council not found: ${councilId}`);

	const personaIds = parseJson(
		council.personaIds!,
		PersonaIdsSchema,
		`council.${councilId}.personaIds`
	);
	const roundStructure = parseJson(
		council.roundStructure!,
		RoundStructureSchema,
		`council.${councilId}.roundStructure`
	);
	const modelConfig = council.modelConfig
		? parseJson(council.modelConfig, ModelConfigSchema, `council.${councilId}.modelConfig`)
		: undefined;
	const resolvedConfig = resolveModelConfig(modelConfig);

	// Load personas, filtering out those with unmet feature requirements
	const allPersonas = db.select().from(schema.personas).all();
	const requestedPersonas: PersonaRow[] = personaIds
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

	// Load party IDs at this table for visible_to. Invariant #8:
	// in single-party tables, visible_to = [all parties]. When M3 adds
	// two-party mode, this query still returns the right set — visibility
	// filtering per-party happens at the read layer, not here.
	const allPartyIds = db
		.select({ partyId: schema.tableParties.partyId })
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all()
		.map((r) => r.partyId);
	// Fallback for callers that haven't linked the party yet (shouldn't happen in prod)
	const visibleTo = allPartyIds.length > 0 ? allPartyIds : [partyId];

	// Guard: the orchestrator should only run against pending/running tables.
	// The HTTP guard already ensures this, but callers (tests, future code)
	// might skip it. Fail loud rather than silently clobbering a completed row.
	const existing = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
	if (!existing) throw new Error(`Table not found: ${tableId}`);
	if (existing.status !== 'pending' && existing.status !== 'running') {
		throw new Error(`Table is in terminal state: ${existing.status}`);
	}

	// Set status to 'running' if it wasn't already (guard may have done it).
	if (existing.status === 'pending') {
		db.update(schema.tables)
			.set({ status: 'running', updatedAt: Date.now() })
			.where(eq(schema.tables.id, tableId))
			.run();
	}

	try {
		yield { type: 'table_opened', tableId };

		// Track all turns for cross-examination context
		const turnsByRound: Map<number, Array<{ personaName: string; text: string }>> = new Map();

		// Run each round. Personas within a round run in parallel; rounds
		// themselves are serial because each round reads the complete
		// transcript of prior rounds.
		for (let roundIdx = 0; roundIdx < roundStructure.rounds.length; roundIdx++) {
			const round = roundStructure.rounds[roundIdx];

			// Abort between rounds — mid-round cancellation would orphan
			// in-flight LLM calls. Between-rounds is the natural seam.
			if (signal?.aborted) {
				throw new Error('Deliberation aborted');
			}

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

			// Kick off all LLM calls in parallel. Each persona gets the same
			// prior-round context built from turnsByRound.
			const fullTexts: string[] = personas.map(() => '');
			const personaStreams = personas.map((persona, idx) =>
				(async function* (): AsyncGenerator<SseEvent> {
					const messages = buildMessages(dilemma, round, roundIdx, turnsByRound);
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

					yield { type: 'persona_turn_completed', personaId: persona.id };
				})()
			);

			// Interleave token + completion events from all streams.
			for await (const event of mergeAsync(personaStreams)) {
				yield event;
			}

			// Persist in council order — not completion order — so reload of
			// a completed table renders the same top-to-bottom sequence the
			// user saw streaming.
			const roundTurns: Array<{ personaName: string; text: string }> = [];
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
						visibleTo: JSON.stringify(visibleTo)
					})
					.run();
				roundTurns.push({
					personaName: persona.name ?? persona.id,
					text: fullTexts[i]
				});
			}

			turnsByRound.set(roundIdx, roundTurns);
		}

		// Run synthesis if configured (and not aborted)
		if (roundStructure.synthesize && council.synthesisPrompt && !signal?.aborted) {
			yield { type: 'synthesis_started' };

			const allTurns = Array.from(turnsByRound.values()).flat();
			const deliberationText = allTurns.map((t) => `**${t.personaName}:** ${t.text}`).join('\n\n');

			const result = await completeFn({
				model: resolvedConfig.model,
				system: council.synthesisPrompt,
				messages: [
					{ role: 'user', content: `Here is the full deliberation:\n\n${deliberationText}` }
				],
				stream: true,
				modelConfig: resolvedConfig
			});

			let synthesisText = '';
			for await (const chunk of result.textStream) {
				synthesisText += chunk;
				yield { type: 'synthesis_token', text: chunk };
			}

			// Persist synthesis turn
			db.insert(schema.turns)
				.values({
					id: nanoid(),
					tableId,
					round: 0, // synthesis is round 0
					partyId: 'synthesizer',
					personaName: 'Synthesizer',
					text: synthesisText,
					visibleTo: JSON.stringify(visibleTo)
				})
				.run();

			// Persist synthesis text on the table row
			db.update(schema.tables)
				.set({ synthesis: synthesisText, updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		}

		// Mark table completed regardless of whether synthesis ran
		db.update(schema.tables)
			.set({ status: 'completed', updatedAt: Date.now() })
			.where(eq(schema.tables.id, tableId))
			.run();

		yield { type: 'table_closed' };
	} catch (err) {
		// Mark table as failed so it doesn't stay stuck in 'running'.
		// Persist the error message so users see the cause when they
		// revisit the table instead of a generic "encountered an error".
		db.update(schema.tables)
			.set({ status: 'failed', errorMessage: errorMessage(err), updatedAt: Date.now() })
			.where(eq(schema.tables.id, tableId))
			.run();
		throw err;
	}
}

function buildMessages(
	dilemma: string,
	round: RoundDef,
	roundIdx: number,
	turnsByRound: Map<number, Array<{ personaName: string; text: string }>>
): Array<{ role: 'user' | 'assistant'; content: string }> {
	if (roundIdx === 0) {
		// Opening round: just the dilemma
		return [
			{
				role: 'user',
				content: `The person is facing this dilemma:\n\n${dilemma}\n\n${round.prompt_suffix}`
			}
		];
	}

	// Cross-examination and later rounds: include prior context
	const priorTurns = Array.from(turnsByRound.entries())
		.filter(([idx]) => idx < roundIdx)
		.flatMap(([, turns]) => turns);

	const context = priorTurns.map((t) => `**${t.personaName}:** ${t.text}`).join('\n\n');

	return [
		{
			role: 'user',
			content: `The person is facing this dilemma:\n\n${dilemma}\n\nHere is what the council has said so far:\n\n${context}\n\n${round.prompt_suffix}`
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

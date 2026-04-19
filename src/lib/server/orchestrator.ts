// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { SseEvent } from '../schemas/events';
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
	db: DB,
	request: DeliberationRequest
): AsyncGenerator<SseEvent> {
	const { tableId, dilemma, councilId, partyId, completeFn = defaultComplete, signal } = request;

	// Verify the row exists before doing anything else. If it doesn't,
	// there's nothing to mark 'failed' on a later throw — fail loud here
	// instead so the caller sees a clean missing-row error.
	const existing = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
	if (!existing) throw new Error(`Table not found: ${tableId}`);
	if (existing.status !== 'pending' && existing.status !== 'running') {
		throw new Error(`Table is in terminal state: ${existing.status}`);
	}

	try {
		// Load the council
		const council = db
			.select()
			.from(schema.councils)
			.where(eq(schema.councils.id, councilId))
			.get();
		if (!council) throw new Error(`Council not found: ${councilId}`);

		// JSON-mode columns: Drizzle gives us parsed values directly. The
		// shape is enforced at write time via Zod (CouncilBodySchema +
		// council seed JSON validation), so trust the read.
		if (!council.personaIds) throw new Error(`council.${councilId}: missing personaIds`);
		if (!council.roundStructure) {
			throw new Error(`council.${councilId}: missing roundStructure`);
		}
		const personaIds = council.personaIds;
		const roundStructure = council.roundStructure;
		const storedModelConfig = council.modelConfig ?? undefined;
		// AHWA_COUNCIL_<ID>_PROVIDER + _MODEL env vars override the stored
		// config — lets a deploy re-pin demo (or any other council) without
		// editing the council JSON.
		const modelConfig = resolveCouncilModelConfig(councilId, storedModelConfig);
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

		// Invariant #8: in multi-party tables, each party's raw persona
		// turns are private to that party (and the synthesizer) until an
		// explicit reveal. In single-party tables, visible_to = [all
		// parties] (which collapses to [partyId] in practice).
		// Synthesis turns always go to every party (set further below).
		const allPartyIds = db
			.select({ partyId: schema.tableParties.partyId })
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, tableId))
			.all()
			.map((r) => r.partyId);
		const isMultiParty = allPartyIds.length > 1;
		const visibleTo = isMultiParty
			? [partyId]
			: allPartyIds.length > 0
				? allPartyIds
				: [partyId];
		const synthVisibleTo = allPartyIds.length > 0 ? allPartyIds : [partyId];

		// Load this party's stance — the council reads it as the party's
		// framing on the dilemma. Single-party tables typically have no
		// stance (the dilemma is enough); multi-party tables have one
		// stance per party (gated above).
		const partyLink = db
			.select()
			.from(schema.tableParties)
			.where(
				and(
					eq(schema.tableParties.tableId, tableId),
					eq(schema.tableParties.partyId, partyId)
				)
			)
			.get();
		const stance = partyLink?.stance ?? null;

		// Set status to 'running' if it wasn't already (guard may have done it).
		if (existing.status === 'pending') {
			db.update(schema.tables)
				.set({ status: 'running', updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		}

		yield { type: 'table_opened', tableId };

		// Track all turns for cross-examination context
		const turnsByRound: Map<number, Array<{ personaName: string; text: string }>> = new Map();

		// Sum totalTokens reported by every completeFn call (rounds + synthesis).
		// If any call returns undefined (mock without usage / provider that
		// doesn't surface it), we report undefined in table_closed so the
		// route handler skips reconcile rather than under-report.
		let summedTotalTokens = 0;
		let allCallsReportedUsage = true;
		const accumulateUsage = (totalTokens?: number) => {
			if (typeof totalTokens === 'number') summedTotalTokens += totalTokens;
			else allCallsReportedUsage = false;
		};

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
			const truncatedFlags: boolean[] = personas.map(() => false);
			const personaStreams = personas.map((persona, idx) =>
				(async function* (): AsyncGenerator<SseEvent> {
					const messages = buildMessages(dilemma, stance, round, roundIdx, turnsByRound);
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

					// Truncation happens when the model hits maxOutputTokens mid-
					// response. Not a fatal error (we have partial content), but
					// worth flagging so a reloader can see the text is incomplete
					// and ops can decide whether to raise the cap.
					const { truncated, totalTokens } = await result.finished;
					truncatedFlags[idx] = truncated;
					accumulateUsage(totalTokens);
					if (truncated) {
						console.warn(
							`orchestrator: persona "${persona.name ?? persona.id}" was truncated at maxOutputTokens in round ${roundIdx + 1}`
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
						visibleTo,
						truncated: truncatedFlags[i] ? 1 : 0
					})
					.run();
				roundTurns.push({
					personaName: persona.name ?? persona.id,
					text: fullTexts[i]
				});
			}

			turnsByRound.set(roundIdx, roundTurns);
		}

		// Synthesis runs inline only for single-party tables. Multi-party
		// tables defer synthesis to a manual trigger that fires after
		// every party has completed their run — their raw turns aren't
		// finished yet from this stream's POV.
		if (
			!isMultiParty &&
			roundStructure.synthesize &&
			council.synthesisPrompt &&
			!signal?.aborted
		) {
			yield { type: 'synthesis_started' };

			const allTurns = Array.from(turnsByRound.values()).flat();
			const deliberationText = allTurns.map((t) => `**${t.personaName}:** ${t.text}`).join('\n\n');

			// Synthesis is the load-bearing output users actually act on —
			// letting ops swap in a stronger model just for this one call
			// (e.g. Opus for the Sonnet default) buys noticeable depth on
			// the only part of a deliberation that's a recommendation, for
			// a small fraction of total deliberation cost (~1 call of 11).
			const synthesisModel = process.env.AHWA_SYNTHESIS_MODEL || resolvedConfig.model;
			const synthesisConfig = { ...resolvedConfig, model: synthesisModel };

			const result = await completeFn({
				model: synthesisModel,
				system: council.synthesisPrompt,
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
			accumulateUsage(synthTokens);
			if (synthTruncated) {
				console.warn('orchestrator: synthesis was truncated at maxOutputTokens');
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
					visibleTo: synthVisibleTo,
					truncated: synthTruncated ? 1 : 0
				})
				.run();

			// Persist synthesis text on the table row
			db.update(schema.tables)
				.set({ synthesis: synthesisText, updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		}

		// This party's run is done. Multi-party tables stay 'running' on
		// the table row until synthesis fires. Single-party tables
		// transition straight to completed alongside their party.
		db.update(schema.tableParties)
			.set({ runStatus: 'completed' })
			.where(
				and(
					eq(schema.tableParties.tableId, tableId),
					eq(schema.tableParties.partyId, partyId)
				)
			)
			.run();

		if (!isMultiParty) {
			db.update(schema.tables)
				.set({ status: 'completed', updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		}

		yield {
			type: 'table_closed',
			totalTokens: allCallsReportedUsage ? summedTotalTokens : undefined
		};
	} catch (err) {
		// Mark this party's run as failed. In multi-party tables the
		// table itself stays 'running' if other parties are still going;
		// in single-party tables the table also flips to 'failed' so
		// the list view shows the error and the user sees the cause on
		// reload instead of a generic "encountered an error".
		db.update(schema.tableParties)
			.set({ runStatus: 'failed' })
			.where(
				and(
					eq(schema.tableParties.tableId, tableId),
					eq(schema.tableParties.partyId, partyId)
				)
			)
			.run();
		const allPartiesFailed = db
			.select()
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, tableId))
			.all()
			.every((tp) => tp.runStatus === 'failed');
		if (allPartiesFailed) {
			db.update(schema.tables)
				.set({ status: 'failed', errorMessage: errorMessage(err), updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		} else {
			db.update(schema.tables)
				.set({ errorMessage: errorMessage(err), updatedAt: Date.now() })
				.where(eq(schema.tables.id, tableId))
				.run();
		}
		throw err;
	}
}

function buildMessages(
	dilemma: string,
	stance: string | null,
	round: RoundDef,
	roundIdx: number,
	turnsByRound: Map<number, Array<{ personaName: string; text: string }>>
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

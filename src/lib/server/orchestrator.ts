// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { complete as defaultComplete, resolveModelConfig, type CompleteRequest, type CompleteResult } from './llm';
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

	const personaIds = parseJson(council.personaIds!, PersonaIdsSchema, `council.${councilId}.personaIds`);
	const roundStructure = parseJson(council.roundStructure!, RoundStructureSchema, `council.${councilId}.roundStructure`);
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
	const allPartyIds = db.select({ partyId: schema.tableParties.partyId })
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

	// Run each round
	for (let roundIdx = 0; roundIdx < roundStructure.rounds.length; roundIdx++) {
		const round = roundStructure.rounds[roundIdx];
		yield { type: 'round_started', round: roundIdx + 1, kind: round.kind };

		const roundTurns: Array<{ personaName: string; text: string }> = [];

		for (const persona of personas) {
			// Check for cancellation between turns (not mid-token — partial
			// turns would be lost). This is the natural cancellation point.
			if (signal?.aborted) {
				throw new Error('Deliberation aborted');
			}

			yield {
				type: 'persona_turn_started',
				personaId: persona.id,
				personaName: persona.name ?? persona.id,
				emoji: persona.emoji ?? '💬'
			};

			// Build messages for this persona
			const messages = buildMessages(dilemma, round, roundIdx, turnsByRound, persona);

			// Call LLM
			const result = await completeFn({
				model: resolvedConfig.model,
				system: persona.systemPrompt ?? '',
				messages,
				stream: true,
				modelConfig: resolvedConfig
			});

			// Collect the full text while streaming tokens
			let fullText = '';
			for await (const chunk of result.textStream) {
				fullText += chunk;
				yield { type: 'token', personaId: persona.id, text: chunk };
			}

			yield { type: 'persona_turn_completed', personaId: persona.id };

			// Persist the turn
			db.insert(schema.turns)
				.values({
					id: nanoid(),
					tableId,
					round: roundIdx + 1,
					partyId,
					personaName: persona.name,
					text: fullText,
					visibleTo: JSON.stringify(visibleTo)
				})
				.run();

			roundTurns.push({ personaName: persona.name ?? persona.id, text: fullText });
		}

		turnsByRound.set(roundIdx, roundTurns);
	}

	// Run synthesis if configured (and not aborted)
	if (roundStructure.synthesize && council.synthesisPrompt && !signal?.aborted) {
		yield { type: 'synthesis_started' };

		const allTurns = Array.from(turnsByRound.values()).flat();
		const deliberationText = allTurns
			.map((t) => `**${t.personaName}:** ${t.text}`)
			.join('\n\n');

		const result = await completeFn({
			model: resolvedConfig.model,
			system: council.synthesisPrompt,
			messages: [{ role: 'user', content: `Here is the full deliberation:\n\n${deliberationText}` }],
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
	turnsByRound: Map<number, Array<{ personaName: string; text: string }>>,
	persona: PersonaRow
): Array<{ role: 'user' | 'assistant'; content: string }> {
	if (roundIdx === 0) {
		// Opening round: just the dilemma
		return [{
			role: 'user',
			content: `The person is facing this dilemma:\n\n${dilemma}\n\n${round.prompt_suffix}`
		}];
	}

	// Cross-examination and later rounds: include prior context
	const priorTurns = Array.from(turnsByRound.entries())
		.filter(([idx]) => idx < roundIdx)
		.flatMap(([, turns]) => turns);

	const context = priorTurns
		.map((t) => `**${t.personaName}:** ${t.text}`)
		.join('\n\n');

	return [{
		role: 'user',
		content: `The person is facing this dilemma:\n\n${dilemma}\n\nHere is what the council has said so far:\n\n${context}\n\n${round.prompt_suffix}`
	}];
}

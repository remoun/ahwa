// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { nanoid } from 'nanoid';
import { complete as defaultComplete, resolveModelConfig, type CompleteRequest, type CompleteResult, type ModelConfig } from './llm';
import { filterPersonas } from './features';
import * as schema from './db/schema';
import type { SseEvent } from '../schemas/events';

type Db = BunSQLiteDatabase<typeof schema>;
type CompleteFn = (request: CompleteRequest) => Promise<CompleteResult>;

export interface DeliberationRequest {
	tableId: string;
	dilemma: string;
	councilId: string;
	partyId: string;
	completeFn?: CompleteFn;
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
	const { tableId, dilemma, councilId, partyId, completeFn = defaultComplete } = request;

	// Load the council
	const council = db.select().from(schema.councils).where(eq(schema.councils.id, councilId)).get();
	if (!council) throw new Error(`Council not found: ${councilId}`);

	const personaIds: string[] = JSON.parse(council.personaIds!);
	const roundStructure: { rounds: RoundDef[]; synthesize: boolean } = JSON.parse(council.roundStructure!);
	const modelConfig: ModelConfig | undefined = council.modelConfig
		? JSON.parse(council.modelConfig)
		: undefined;
	const resolvedConfig = resolveModelConfig(modelConfig);

	// Load personas, filtering out those with unmet feature requirements
	const allPersonas = db.select().from(schema.personas).all();
	const requestedPersonas: PersonaRow[] = personaIds
		.map((id) => allPersonas.find((p) => p.id === id))
		.filter((p): p is PersonaRow => p !== undefined);
	const { eligible: personas } = filterPersonas(requestedPersonas);

	// Mark the pre-created table as running
	db.update(schema.tables)
		.set({ status: 'running', updatedAt: Date.now() })
		.where(eq(schema.tables.id, tableId))
		.run();

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
					visibleTo: JSON.stringify([partyId])
				})
				.run();

			roundTurns.push({ personaName: persona.name ?? persona.id, text: fullText });
		}

		turnsByRound.set(roundIdx, roundTurns);
	}

	// Run synthesis if configured
	if (roundStructure.synthesize && council.synthesisPrompt) {
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
				visibleTo: JSON.stringify([partyId])
			})
			.run();

		// Update table with synthesis and mark completed
		db.update(schema.tables)
			.set({ synthesis: synthesisText, status: 'completed', updatedAt: Date.now() })
			.where(eq(schema.tables.id, tableId))
			.run();
	}

	yield { type: 'table_closed' };

	} catch (err) {
		// Mark table as failed so it doesn't stay stuck in 'running'
		db.update(schema.tables)
			.set({ status: 'failed', updatedAt: Date.now() })
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

// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { Events } from '../schemas/events';
import * as schema from './db/schema';
import type { HandlerDeps } from './deps';
import type { ResolvedParty } from './identity';
import {
	complete as defaultComplete,
	type CompleteRequest,
	type CompleteResult,
	resolveCouncilModelConfig,
	resolveModelConfig
} from './llm';

/**
 * Manual synthesis trigger for multi-party tables. Single-party tables
 * synthesize inline at the end of runDeliberation; multi-party defer
 * here so every party's stance + raw turns are in before the
 * synthesizer reads them.
 *
 * Gate: every party at the table must have runStatus completed or
 * failed. Party stances are presented to the synthesizer alongside
 * the deliberation transcript so the output reconciles framings, not
 * just talking points.
 */
export interface SynthesizeRequest {
	tableId: string;
	party: ResolvedParty;
}

export interface SynthesizeDeps extends HandlerDeps {
	completeFn?: (request: CompleteRequest) => Promise<CompleteResult>;
}

export function createSynthesizeHandler(deps: SynthesizeDeps) {
	const completeFn = deps.completeFn ?? defaultComplete;

	return async ({ tableId, party }: SynthesizeRequest): Promise<Response> => {
		const db = deps.getDb();

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		if (!table) return json({ error: 'Table not found' }, { status: 404 });
		if (table.status === 'completed') {
			return json({ error: 'Table already synthesized' }, { status: 409 });
		}

		const links = db
			.select()
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, tableId))
			.all();
		if (!links.find((l) => l.partyId === party.id)) {
			return json({ error: 'Not a member of this table' }, { status: 403 });
		}

		const allDone = links.every((l) => l.runStatus === 'completed' || l.runStatus === 'failed');
		if (!allDone) {
			return json({ error: 'Some parties have not finished yet' }, { status: 409 });
		}

		const council = table.councilId
			? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
			: null;
		if (!council?.synthesisPrompt) {
			return json({ error: 'Council has no synthesis prompt' }, { status: 400 });
		}

		const turns = db
			.select()
			.from(schema.turns)
			.where(eq(schema.turns.tableId, tableId))
			.all()
			.filter((t) => t.partyId !== 'synthesizer');

		// Build the synthesizer's input. Stances first (so the model
		// reads each party's framing before their council's reaction);
		// then the deliberation transcript, party by party.
		const stancesBlock = links
			.filter((l) => l.stance?.trim())
			.map((l) => `**${l.partyId}'s stance:** ${l.stance}`)
			.join('\n\n');

		const deliberationBlock = links
			.map((l) => {
				const partyTurns = turns.filter((t) => t.partyId === l.partyId);
				const transcript = partyTurns.map((t) => `**${t.personaName}:** ${t.text}`).join('\n\n');
				return `### ${l.partyId}'s council\n\n${transcript}`;
			})
			.join('\n\n');

		const userMessage = [
			`The dilemma:\n\n${table.dilemma}`,
			stancesBlock ? `\nParty stances:\n\n${stancesBlock}` : '',
			`\nDeliberations:\n\n${deliberationBlock}`
		].join('\n');

		const modelConfig = resolveCouncilModelConfig(
			table.councilId!,
			council.modelConfig ?? undefined
		);
		const resolved = resolveModelConfig(modelConfig);
		const synthesisModel = process.env.AHWA_SYNTHESIS_MODEL || resolved.model;
		const synthesisConfig = { ...resolved, model: synthesisModel };

		const result = await completeFn({
			model: synthesisModel,
			system: council.synthesisPrompt,
			messages: [{ role: 'user', content: userMessage }],
			stream: true,
			modelConfig: synthesisConfig
		});

		let synthesisText = '';
		for await (const chunk of result.textStream) {
			synthesisText += chunk;
		}

		// Two writes: persist the synthesis turn + flip the table to
		// completed. If the table update failed after the turn insert,
		// you'd see a synthesis turn on a still-'running' table — the
		// "synthesize again" button would re-fire and double the row.
		// Wrap in a tx so either both land or neither does.
		const visibleTo = links.map((l) => l.partyId);
		db.transaction((tx) => {
			tx.insert(schema.turns)
				.values({
					id: nanoid(),
					tableId,
					round: 0,
					partyId: 'synthesizer',
					personaName: 'Synthesizer',
					text: synthesisText,
					visibleTo
				})
				.run();
			tx.update(schema.tables)
				.set({ synthesis: synthesisText, status: 'completed', updatedAt: Date.now() })
				.where(and(eq(schema.tables.id, tableId), eq(schema.tables.status, 'running')))
				.run();
		});

		deps.bus.publish(tableId, Events.tableSynthesized());
		return json({ ok: true, synthesis: synthesisText });
	};
}

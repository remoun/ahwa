// SPDX-License-Identifier: AGPL-3.0-or-later
import * as schema from '../src/lib/server/db/schema';
import type { TestDb } from './helpers';

/**
 * Seed a small two-persona council for orchestrator/guard tests.
 * Council id: 'test-council', personas: 'elder' + 'mirror', party: 'party-1'.
 */
export function seedMiniCouncil(db: TestDb) {
	db.insert(schema.personas)
		.values([
			{ id: 'elder', name: 'The Elder', emoji: '🌿', systemPrompt: 'You are an elder.' },
			{ id: 'mirror', name: 'The Mirror', emoji: '🪞', systemPrompt: 'You are a mirror.' }
		])
		.run();

	db.insert(schema.councils)
		.values({
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
		})
		.run();

	db.insert(schema.parties).values({ id: 'party-1', displayName: 'me' }).run();
}

/** Insert a party row */
export function createParty(db: TestDb, id: string, displayName = 'me') {
	db.insert(schema.parties).values({ id, displayName }).run();
}

/**
 * Pre-create a table row and link a party to it. The orchestrator
 * expects the table to exist in 'pending' state before it runs.
 */
export function createTable(
	db: TestDb,
	id: string,
	dilemma: string,
	councilId: string,
	partyId: string,
	status: 'pending' | 'running' | 'completed' | 'failed' = 'pending'
) {
	db.insert(schema.tables).values({ id, dilemma, councilId, status }).run();
	db.insert(schema.tableParties).values({ tableId: id, partyId, role: 'initiator' }).run();
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { CouncilSchema, PersonaSchema } from '../../schemas/council';
import { parseJsonSafe } from '../parse';
import { personaRow } from '../persona-row';
import * as schema from './schema';

type Db = BunSQLiteDatabase<typeof schema>;

// Council rows split the same way: shared mapping for both insert and
// onConflictDoUpdate so adding a council field is one edit. Drizzle's
// mode:'json' columns auto-serialise personaIds/roundStructure/modelConfig.
type CouncilInsert = typeof schema.councils.$inferInsert;

function councilRow(parsed: {
	name: string;
	description?: string;
	personaIds: string[];
	synthesis_prompt: string;
	round_structure: CouncilInsert['roundStructure'];
	model_config?: CouncilInsert['modelConfig'];
}) {
	return {
		name: parsed.name,
		description: parsed.description ?? null,
		personaIds: parsed.personaIds,
		synthesisPrompt: parsed.synthesis_prompt,
		roundStructure: parsed.round_structure,
		modelConfig: parsed.model_config ?? null
	};
}

/**
 * Seed councils and personas from JSON files on disk.
 * Idempotent — uses INSERT OR REPLACE so it's safe to call on every startup.
 */
export function seedFromDisk(db: Db, councilsDir = 'councils', personasDir = 'personas'): void {
	// Load council JSON files
	let councilFiles: string[] = [];
	try {
		councilFiles = readdirSync(councilsDir).filter((f) => f.endsWith('.json'));
	} catch {
		// Directory may not exist yet
	}

	for (const file of councilFiles) {
		const raw = readFileSync(join(councilsDir, file), 'utf-8');
		const result = parseJsonSafe(raw, CouncilSchema);
		if (!result.ok) {
			console.warn(`seed: skipping ${file}: ${result.error}`);
			continue;
		}
		const parsed = result.data;

		// Upsert each persona from this council
		for (const persona of parsed.personas) {
			db.insert(schema.personas)
				.values({ id: persona.id, ...personaRow(persona), ownerParty: null })
				.onConflictDoUpdate({ target: schema.personas.id, set: personaRow(persona) })
				.run();
		}

		// Upsert the council
		const council = { ...parsed, personaIds: parsed.personas.map((p) => p.id) };
		db.insert(schema.councils)
			.values({ id: parsed.id, ...councilRow(council), ownerParty: null })
			.onConflictDoUpdate({ target: schema.councils.id, set: councilRow(council) })
			.run();
	}

	// Load standalone persona files
	let personaFiles: string[] = [];
	try {
		personaFiles = readdirSync(personasDir).filter((f) => f.endsWith('.json'));
	} catch {
		// Directory may not exist yet
	}

	for (const file of personaFiles) {
		const raw = readFileSync(join(personasDir, file), 'utf-8');
		const result = parseJsonSafe(raw, PersonaSchema);
		if (!result.ok) {
			console.warn(`seed: skipping ${file}: ${result.error}`);
			continue;
		}
		const parsed = result.data;

		db.insert(schema.personas)
			.values({ id: parsed.id, ...personaRow(parsed), ownerParty: null })
			.onConflictDoUpdate({ target: schema.personas.id, set: personaRow(parsed) })
			.run();
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { CouncilSchema, PersonaSchema } from '../../schemas/council';
import { councilRow } from '../council-row';
import { parseJsonSafe } from '../parse';
import { personaRow } from '../persona-row';
import type { DB } from '.';
import * as schema from './schema';

/**
 * Seed councils and personas from JSON files on disk.
 * Idempotent — uses INSERT OR REPLACE so it's safe to call on every startup.
 */
export function seedFromDisk(db: DB, councilsDir = 'councils', personasDir = 'personas'): void {
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

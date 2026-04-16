// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { CouncilSchema, PersonaSchema } from '../../schemas/council';
import { parseJsonSafe } from '../parse';
import { jsonOrNull } from '../../util';
import * as schema from './schema';

type Db = BunSQLiteDatabase<typeof schema>;

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
				.values({
					id: persona.id,
					name: persona.name,
					emoji: persona.emoji,
					systemPrompt: persona.system_prompt,
					requires: jsonOrNull(persona.requires),
					ownerParty: null
				})
				.onConflictDoUpdate({
					target: schema.personas.id,
					set: {
						name: persona.name,
						emoji: persona.emoji,
						systemPrompt: persona.system_prompt,
						requires: jsonOrNull(persona.requires)
					}
				})
				.run();
		}

		// Upsert the council
		const personaIds = parsed.personas.map((p) => p.id);
		const modelConfig = jsonOrNull(parsed.model_config);
		db.insert(schema.councils)
			.values({
				id: parsed.id,
				name: parsed.name,
				personaIds: JSON.stringify(personaIds),
				synthesisPrompt: parsed.synthesis_prompt,
				roundStructure: JSON.stringify(parsed.round_structure),
				modelConfig,
				ownerParty: null
			})
			.onConflictDoUpdate({
				target: schema.councils.id,
				set: {
					name: parsed.name,
					personaIds: JSON.stringify(personaIds),
					synthesisPrompt: parsed.synthesis_prompt,
					roundStructure: JSON.stringify(parsed.round_structure),
					modelConfig
				}
			})
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
			.values({
				id: parsed.id,
				name: parsed.name,
				emoji: parsed.emoji,
				systemPrompt: parsed.system_prompt,
				requires: jsonOrNull(parsed.requires),
				ownerParty: null
			})
			.onConflictDoUpdate({
				target: schema.personas.id,
				set: {
					name: parsed.name,
					emoji: parsed.emoji,
					systemPrompt: parsed.system_prompt,
					requires: jsonOrNull(parsed.requires)
				}
			})
			.run();
	}
}

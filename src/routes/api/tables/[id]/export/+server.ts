// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, and, asc, inArray } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { generateMarkdown } from '$lib/server/export';
import type { RequestHandler } from './$types';

/**
 * Export a completed table as a markdown file download.
 *
 * M1 TODO: no party-membership check. See GET /api/tables/[id] for context.
 * Demo tables are excluded per invariant #11.
 */
export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const table = db
		.select()
		.from(schema.tables)
		.where(and(eq(schema.tables.id, params.id), eq(schema.tables.isDemo, 0)))
		.get();

	if (!table) {
		return new Response('Table not found', { status: 404 });
	}

	if (table.status !== 'completed') {
		return new Response('Table is not yet completed', { status: 400 });
	}

	const turns = db
		.select()
		.from(schema.turns)
		.where(eq(schema.turns.tableId, params.id))
		.orderBy(asc(schema.turns.round), asc(schema.turns.createdAt))
		.all();

	const council = table.councilId
		? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
		: null;

	// Only this council's personas appear in this table's turns, so scope
	// the persona lookup to those ids — no need to scan every custom
	// persona in the DB.
	const personaIds = council?.personaIds ?? [];
	const personas = personaIds.length
		? db.select().from(schema.personas).where(inArray(schema.personas.id, personaIds)).all()
		: [];
	const byId = new Map(personas.map((p) => [p.id, p]));
	// Preserve the council's persona order for the roster — drizzle's WHERE
	// IN doesn't guarantee it.
	const orderedPersonas = personaIds.map((id) => byId.get(id)).filter((p) => !!p);
	const emojiByName = new Map(personas.map((p) => [p.name, p.emoji]));

	const md = generateMarkdown(
		table,
		turns.map((t) => ({
			round: t.round,
			personaName: t.personaName,
			emoji: emojiByName.get(t.personaName ?? '') ?? null,
			text: t.text
		})),
		{ name: council?.name ?? null, personas: orderedPersonas },
		table.synthesis
	);

	return new Response(md, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="table-${params.id}.md"`
		}
	});
};

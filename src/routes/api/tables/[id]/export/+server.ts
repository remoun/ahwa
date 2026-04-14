// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { generateMarkdown } from '$lib/server/export';
import type { RequestHandler } from './$types';

/** Export a completed table as a markdown file download */
export const GET: RequestHandler = async ({ params }) => {
	const table = db
		.select()
		.from(schema.tables)
		.where(eq(schema.tables.id, params.id))
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
		.all();

	const council = table.councilId
		? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
		: null;

	const md = generateMarkdown(
		table,
		turns.map((t) => ({
			round: t.round,
			personaName: t.personaName,
			text: t.text
		})),
		{ name: council?.name ?? null },
		table.synthesis
	);

	return new Response(md, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="table-${params.id}.md"`
		}
	});
};

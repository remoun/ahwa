// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** Get a single table with its turns */
export const GET: RequestHandler = async ({ params }) => {
	const table = db
		.select()
		.from(schema.tables)
		.where(eq(schema.tables.id, params.id))
		.get();

	if (!table) {
		return json({ error: 'Table not found' }, { status: 404 });
	}

	const turns = db
		.select()
		.from(schema.turns)
		.where(eq(schema.turns.tableId, params.id))
		.all();

	const council = table.councilId
		? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
		: null;

	return json({ ...table, turns, council });
};

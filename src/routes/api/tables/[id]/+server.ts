// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Get a single table with its turns.
 *
 * M1 TODO: no party-membership check. Acceptable because M1 is
 * localhost-only behind reverse-proxy auth (invariant #5). M3 adds
 * party-scoped read access when two-party share links land.
 *
 * Demo tables (is_demo=1) are hidden per invariant #11 — they must
 * never mix with owned tables even on direct lookup.
 */
export const GET: RequestHandler = async ({ params }) => {
	const table = db
		.select()
		.from(schema.tables)
		.where(and(eq(schema.tables.id, params.id), eq(schema.tables.isDemo, 0)))
		.get();

	if (!table) {
		return json({ error: 'Table not found' }, { status: 404 });
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

	return json({ ...table, turns, council });
};

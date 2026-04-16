// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { loadOrFail } from '$lib/server/load';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => loadOrFail('t/[id]', () => {
	const tableId = params.id;
	const partyId = url.searchParams.get('party') ?? '';

	const table = db
		.select()
		.from(schema.tables)
		.where(eq(schema.tables.id, tableId))
		.get();

	if (!table) {
		return { tableId, partyId, table: null, turns: [], council: null };
	}

	const turns = db
		.select()
		.from(schema.turns)
		.where(eq(schema.turns.tableId, tableId))
		.all();

	const council = table.councilId
		? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
		: null;

	return { tableId, partyId, table, turns, council };
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const tables = db
		.select()
		.from(schema.tables)
		.where(eq(schema.tables.isDemo, 0))
		.orderBy(desc(schema.tables.createdAt))
		.all();

	const councils = db.select().from(schema.councils).all();

	// Look up party IDs for each table so we can link to them
	const tableParties = db.select().from(schema.tableParties).all();
	const partyByTable = new Map<string, string>();
	for (const tp of tableParties) {
		if (!partyByTable.has(tp.tableId)) {
			partyByTable.set(tp.tableId, tp.partyId);
		}
	}

	return {
		tables: tables.map((t) => ({
			...t,
			partyId: partyByTable.get(t.id) ?? ''
		})),
		councils
	};
};

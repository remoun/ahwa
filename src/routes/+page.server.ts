// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { loadOrFail } from '$lib/server/load';
import { signShareToken } from '$lib/server/share';
import { expandCouncilPersonas } from '$lib/server/councils';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () =>
	loadOrFail('home', () => {
		const tables = db
			.select()
			.from(schema.tables)
			.where(eq(schema.tables.isDemo, 0))
			.orderBy(desc(schema.tables.createdAt))
			.all();

		// Put the default council first so the preselected option leads the
		// picker grid; everything else keeps insertion order.
		const councils = db
			.select()
			.from(schema.councils)
			.all()
			.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : 0));
		const personas = db.select().from(schema.personas).all();

		// M1: one party per table, so last-write-wins is fine. M3 will need
		// to filter by role === 'initiator' when two-party tables exist.
		const tableParties = db.select().from(schema.tableParties).all();
		const partyByTable = new Map(tableParties.map((tp) => [tp.tableId, tp.partyId]));

		return {
			tables: tables.map((t) => {
				const partyId = partyByTable.get(t.id) ?? '';
				return {
					...t,
					partyId,
					token: partyId ? signShareToken(t.id, partyId) : ''
				};
			}),
			councils: councils.map((c) => expandCouncilPersonas(c, personas))
		};
	});

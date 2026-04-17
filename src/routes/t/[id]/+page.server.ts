// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { loadOrFail } from '$lib/server/load';
import { attachPersonaEmojis } from '$lib/server/councils';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) =>
	loadOrFail('t/[id]', () => {
		const tableId = params.id;
		const partyId = url.searchParams.get('party') ?? '';
		const token = url.searchParams.get('token') ?? '';

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();

		if (!table) {
			return { tableId, partyId, token, table: null, turns: [], council: null };
		}

		const rawTurns = db
			.select()
			.from(schema.turns)
			.where(eq(schema.turns.tableId, tableId))
			.orderBy(asc(schema.turns.round), asc(schema.turns.createdAt))
			.all();

		// Turns store persona_name but not emoji; look it up now so
		// historical renders show the same avatars the live SSE path does.
		const personas = db.select().from(schema.personas).all();
		const turns = attachPersonaEmojis(rawTurns, personas);

		const council = table.councilId
			? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
			: null;

		return { tableId, partyId, token, table, turns, council };
	});

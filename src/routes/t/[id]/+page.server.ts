// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, asc, inArray } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { loadOrFail } from '$lib/server/load';
import { attachPersonaMeta } from '$lib/server/councils';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) =>
	loadOrFail('t/[id]', () => {
		const tableId = params.id;
		const partyId = url.searchParams.get('party') ?? '';
		const token = url.searchParams.get('token') ?? '';

		const db = getDb();
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

		const council = table.councilId
			? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
			: null;

		// Turns store persona_name but not emoji; look it up now so
		// historical renders show the same avatars the live SSE path does.
		// Scope the persona select to this table's council — no point
		// reading every custom persona in the DB just to look up five.
		const personaIds: string[] = council?.personaIds ?? [];
		const personas = personaIds.length
			? db.select().from(schema.personas).where(inArray(schema.personas.id, personaIds)).all()
			: [];
		const turns = attachPersonaMeta(rawTurns, personas);

		// name -> description map for the SSE-driven turns. Live turns
		// don't go through attachPersonaMeta, so the page needs this
		// to populate the avatar tooltip without a per-event DB hit.
		const personaMeta: Record<string, string> = {};
		for (const p of personas) {
			if (p.name && p.description) personaMeta[p.name] = p.description;
		}

		return { tableId, partyId, token, table, turns, council, personaMeta };
	});

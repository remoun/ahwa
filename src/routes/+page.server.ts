// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { loadOrFail } from '$lib/server/load';
import { signShareToken } from '$lib/server/share';
import { expandCouncilPersonas } from '$lib/server/councils';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

/**
 * Public-demo instances flip `/` from "your tables" to a landing page
 * with the demo CTA. Self-hosted instances leave it as-is — they get
 * the table-list as the home, which is what existing bookmarks expect.
 */
const PUBLIC_DEMO = process.env.AHWA_PUBLIC_DEMO === '1';

export const load: PageServerLoad = () =>
	loadOrFail('home', () => {
		if (PUBLIC_DEMO) {
			// Demo mode: skip the DB roundtrip — landing page needs no data.
			return { mode: 'demo' as const };
		}

		const tables = db
			.select()
			.from(schema.tables)
			.where(eq(schema.tables.isDemo, 0))
			.orderBy(desc(schema.tables.createdAt))
			.all();

		// Put the default council first so the preselected option leads the
		// picker grid; everything else keeps insertion order. Councils
		// whose id starts with `_` are treated as internal (e.g. `_smoke`
		// used by the post-deploy smoke test) and hidden from the picker.
		const councils = db
			.select()
			.from(schema.councils)
			.all()
			.filter((c) => !c.id.startsWith('_'))
			.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : 0));
		const personas = db.select().from(schema.personas).all();

		// M1: one party per table, so last-write-wins is fine. M3 will need
		// to filter by role === 'initiator' when two-party tables exist.
		const tableParties = db.select().from(schema.tableParties).all();
		const partyByTable = new Map(tableParties.map((tp) => [tp.tableId, tp.partyId]));

		return {
			mode: 'app' as const,
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

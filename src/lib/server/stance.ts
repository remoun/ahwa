// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import type { DB } from './db';
import * as schema from './db/schema';
import type { ResolvedParty } from './identity';
import { verifyShareToken } from './share';

/**
 * Edit a party's stance — their POV/framing on the dilemma. The council
 * reads this when running that party's deliberation. Drafts are mutable
 * until the run starts; once run_status leaves 'pending' (or the table
 * is fully synthesized), the stance is frozen.
 *
 * Auth: caller must either be the party themselves (locals.party.id ===
 * partyId) or hold a valid share token for that party slot. The token
 * path is what lets an anonymous invitee edit their own stance.
 */
export interface StanceRequest {
	tableId: string;
	partyId: string;
	stance: string;
	party: ResolvedParty;
	token?: string;
}

export interface StanceDeps {
	getDb: () => DB;
}

export function createStanceHandler(deps: StanceDeps) {
	return async ({ tableId, partyId, stance, party, token }: StanceRequest): Promise<Response> => {
		const db = deps.getDb();

		const text = stance.trim();
		if (!text) return json({ error: 'stance required' }, { status: 400 });

		const link = db
			.select()
			.from(schema.tableParties)
			.where(
				and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId))
			)
			.get();
		if (!link) return json({ error: 'Not found' }, { status: 404 });

		const callerIsParty = party.id === partyId;
		const tokenValid = !!token && verifyShareToken(tableId, partyId, token);
		if (!callerIsParty && !tokenValid) {
			return json({ error: 'Cannot edit another party stance' }, { status: 403 });
		}

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		if (table?.status === 'completed') {
			return json({ error: 'Table is already synthesized' }, { status: 409 });
		}
		if (link.runStatus !== 'pending') {
			return json({ error: `Run is already ${link.runStatus}` }, { status: 409 });
		}

		db.update(schema.tableParties)
			.set({ stance: text })
			.where(
				and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId))
			)
			.run();

		return json({ ok: true, stance: text });
	};
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { Events } from '../schemas/events';
import type { DB } from './db';
import * as schema from './db/schema';
import type { ResolvedParty } from './identity';
import { verifyShareToken } from './share';
import { publish } from './table-bus';

/**
 * Revoke a party's finished run before synthesis fires. Effect: the
 * party's persona turns are deleted and runStatus resets to pending,
 * so they can edit their stance and re-run. Allowed only while the
 * table is still 'running' — once synthesis lands, all stances are
 * frozen because the synthesizer's output references them.
 */
export interface UncommitRequest {
	tableId: string;
	partyId: string;
	party: ResolvedParty;
	token?: string;
}

export interface UncommitDeps {
	getDb: () => DB;
}

export function createUncommitHandler(deps: UncommitDeps) {
	return async ({ tableId, partyId, party, token }: UncommitRequest): Promise<Response> => {
		const db = deps.getDb();

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
			return json({ error: 'Cannot uncommit another party run' }, { status: 403 });
		}

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		if (table?.status === 'completed') {
			return json({ error: 'Table is already synthesized' }, { status: 409 });
		}
		if (link.runStatus !== 'completed' && link.runStatus !== 'failed') {
			return json({ error: `Run is ${link.runStatus} — nothing to uncommit` }, { status: 409 });
		}

		db.delete(schema.turns)
			.where(and(eq(schema.turns.tableId, tableId), eq(schema.turns.partyId, partyId)))
			.run();
		db.update(schema.tableParties)
			.set({ runStatus: 'pending', errorMessage: null })
			.where(
				and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId))
			)
			.run();

		// Tell every viewer the party reset — their UI re-renders with
		// the runStatus badge back to pending and (for the party
		// themselves) the stance editor available again. We piggyback
		// on partyRunStarted because subscribers treat it as "refetch
		// this party's state"; they don't care about the actual transition.
		publish(tableId, Events.partyRunStarted(partyId));
		return json({ ok: true });
	};
}

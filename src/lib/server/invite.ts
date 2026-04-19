// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { DB } from './db';
import * as schema from './db/schema';
import type { ResolvedParty } from './identity';
import { signShareToken } from './share';

/**
 * Mints an "invited" placeholder party on a table and returns a share URL.
 * Invariant #5: links are `/t/{table_id}?party={party_id}&token={hmac}`.
 *
 * The placeholder party has no externalId — possession of the link is the
 * identity. When the invitee opens the link, the claim flow either binds
 * their SSO identity to this row or leaves it anonymous (link == identity,
 * like a magic link).
 */
export interface InviteRequest {
	tableId: string;
	party: ResolvedParty;
}

export interface InviteDeps {
	getDb: () => DB;
}

export function createInviteHandler(deps: InviteDeps) {
	return async ({ tableId, party }: InviteRequest): Promise<Response> => {
		const db = deps.getDb();

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		if (!table) return json({ error: 'Table not found' }, { status: 404 });
		// Invariant #11: demo tables are second-class — never multi-party,
		// memory, or sync. Refusing the invite at the source keeps every
		// downstream "is_demo + multi-party" guard a no-op.
		if (table.isDemo === 1) {
			return json({ error: 'Cannot invite to a demo table' }, { status: 403 });
		}

		const callerLink = db
			.select()
			.from(schema.tableParties)
			.where(
				and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, party.id))
			)
			.get();
		if (!callerLink) {
			return json({ error: 'Not a member of this table' }, { status: 403 });
		}

		const partyId = nanoid();
		db.insert(schema.parties).values({ id: partyId, displayName: 'invited' }).run();
		db.insert(schema.tableParties).values({ tableId, partyId, role: 'invited' }).run();

		const token = signShareToken(tableId, partyId);
		const url = `/t/${tableId}?party=${partyId}&token=${token}`;

		return json({ partyId, token, url }, { status: 201 });
	};
}

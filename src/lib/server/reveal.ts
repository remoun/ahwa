// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { Events } from '../schemas/events';
import * as schema from './db/schema';
import type { HandlerDeps } from './deps';
import type { ResolvedParty } from './identity';

/**
 * One-way reveal: the turn's author appends a recipient party to the
 * turn's visible_to. There is no revoke verb on purpose — once shared,
 * shared. Pinned by reveal.test.ts so a future "let me take that back"
 * change is a deliberate decision, not an accident.
 */
export interface RevealRequest {
	turnId: string;
	withPartyId: string;
	party: ResolvedParty;
}

export type RevealDeps = HandlerDeps;

export function createRevealHandler(deps: RevealDeps) {
	return async ({ turnId, withPartyId, party }: RevealRequest): Promise<Response> => {
		const db = deps.getDb();

		const turn = db.select().from(schema.turns).where(eq(schema.turns.id, turnId)).get();
		if (!turn) return json({ error: 'Turn not found' }, { status: 404 });

		if (turn.partyId !== party.id) {
			return json({ error: 'Only the author can reveal this turn' }, { status: 403 });
		}

		const recipientLink = db
			.select()
			.from(schema.tableParties)
			.where(
				and(
					eq(schema.tableParties.tableId, turn.tableId),
					eq(schema.tableParties.partyId, withPartyId)
				)
			)
			.get();
		if (!recipientLink) {
			return json({ error: 'Recipient is not a member of this table' }, { status: 400 });
		}

		const current = turn.visibleTo ?? [];
		if (current.includes(withPartyId)) {
			return json({ ok: true, visibleTo: current });
		}

		const updated = [...current, withPartyId];
		db.update(schema.turns).set({ visibleTo: updated }).where(eq(schema.turns.id, turnId)).run();

		deps.bus.publish(turn.tableId, Events.turnRevealed(turnId, withPartyId));
		return json({ ok: true, visibleTo: updated });
	};
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { asc, eq } from 'drizzle-orm';

import type { DB } from './db';
import * as schema from './db/schema';

export type Turn = typeof schema.turns.$inferSelect;

/**
 * Invariant #8: turns carry visible_to. This is the cross-leak guard for
 * two/N-party mediation — every turn read for display goes through here.
 *
 * Single-party tables short-circuit (visible_to is redundant when there's
 * only one party). Multi-party filters in JS rather than SQL because
 * visible_to is a JSON array column; SQLite has no native JSON-array-
 * contains and the row count per table stays small (tens).
 *
 * Synthesis turns (round 0, party = 'synthesizer') are visible to every
 * member regardless of the persisted visible_to — the synthesizer's job
 * is to produce a shared output. If the orchestrator omits a party from
 * visible_to here, that's a bug we want to mask, not propagate.
 */
export function visibleTurns(db: DB, tableId: string, viewerPartyId: string): Turn[] {
	const memberships = db
		.select()
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all();

	const isMember = memberships.some((m) => m.partyId === viewerPartyId);
	if (!isMember) return [];

	const turns = db
		.select()
		.from(schema.turns)
		.where(eq(schema.turns.tableId, tableId))
		.orderBy(asc(schema.turns.round), asc(schema.turns.createdAt))
		.all();

	if (memberships.length <= 1) return turns;

	return turns.filter((t) => {
		if (t.partyId === 'synthesizer') return true;
		const vis = t.visibleTo ?? [];
		return vis.includes(viewerPartyId);
	});
}

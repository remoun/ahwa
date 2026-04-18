// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, inArray, lt } from 'drizzle-orm';

import type { DB } from './db';
import * as schema from './db/schema';

export interface CleanupInput {
	db: DB;
	ttlHours: number;
	now?: () => number;
}

/**
 * Delete demo tables created more than `ttlHours` ago, plus their
 * cascading rows: table_parties, turns, and the ephemeral demo party.
 *
 * Demos are second-class per invariant #11 — short-lived, anonymous,
 * not worth keeping around once the human has finished looking at the
 * synthesis. Owned tables (is_demo=0) are never touched here.
 *
 * Intended to run on a recurring interval (setInterval in the server
 * hook is enough — no external scheduler needed).
 *
 * @returns number of demo tables removed
 */
export function cleanupExpiredDemoTables({ db, ttlHours, now }: CleanupInput): number {
	const cutoff = (now ?? Date.now)() - ttlHours * 60 * 60 * 1000;

	const expired = db
		.select({ id: schema.tables.id })
		.from(schema.tables)
		.where(and(eq(schema.tables.isDemo, 1), lt(schema.tables.createdAt, cutoff)))
		.all();

	if (expired.length === 0) return 0;

	const tableIds = expired.map((t) => t.id);

	// Collect parties linked to expired demo tables — candidates for
	// cleanup. Today every demo creates a fresh anonymous party (see A1)
	// so these are always exclusive to the demo, but the schema doesn't
	// enforce that. M3's two-party flow could legitimately link an owned
	// party to a demo table; we must NOT delete a party that's also tied
	// to a non-demo or surviving table.
	const candidatePartyIds = db
		.select({ partyId: schema.tableParties.partyId })
		.from(schema.tableParties)
		.where(inArray(schema.tableParties.tableId, tableIds))
		.all()
		.map((r) => r.partyId);

	db.delete(schema.turns).where(inArray(schema.turns.tableId, tableIds)).run();
	db.delete(schema.tableParties).where(inArray(schema.tableParties.tableId, tableIds)).run();
	db.delete(schema.tables).where(inArray(schema.tables.id, tableIds)).run();

	if (candidatePartyIds.length > 0) {
		// Only delete parties that no longer have ANY remaining table_parties
		// row (the deletes above already removed the demo-table links). A
		// shared party with a surviving non-demo link is filtered out here.
		const stillReferenced = db
			.selectDistinct({ partyId: schema.tableParties.partyId })
			.from(schema.tableParties)
			.where(inArray(schema.tableParties.partyId, candidatePartyIds))
			.all()
			.map((r) => r.partyId);

		const safeToDelete = candidatePartyIds.filter((id) => !stillReferenced.includes(id));
		if (safeToDelete.length > 0) {
			db.delete(schema.parties).where(inArray(schema.parties.id, safeToDelete)).run();
		}
	}

	return expired.length;
}

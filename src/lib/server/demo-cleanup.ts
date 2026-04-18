// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { and, eq, inArray, lt } from 'drizzle-orm';
import * as schema from './db/schema';

type Db = BunSQLiteDatabase<typeof schema>;

export interface CleanupInput {
	db: Db;
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

	// Collect the demo parties tied to these tables BEFORE deleting the
	// link rows — we want to clean up the parties too (they're ephemeral
	// per A1: a fresh anonymous party per demo).
	const partyIds = db
		.select({ partyId: schema.tableParties.partyId })
		.from(schema.tableParties)
		.where(inArray(schema.tableParties.tableId, tableIds))
		.all()
		.map((r) => r.partyId);

	db.delete(schema.turns).where(inArray(schema.turns.tableId, tableIds)).run();
	db.delete(schema.tableParties).where(inArray(schema.tableParties.tableId, tableIds)).run();
	db.delete(schema.tables).where(inArray(schema.tables.id, tableIds)).run();
	if (partyIds.length > 0) {
		db.delete(schema.parties).where(inArray(schema.parties.id, partyIds)).run();
	}

	return expired.length;
}

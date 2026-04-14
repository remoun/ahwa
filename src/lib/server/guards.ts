// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';

type Db = BunSQLiteDatabase<typeof schema>;

export interface GuardError {
	ok: false;
	status: number;
	message: string;
}

export interface GuardSuccess {
	ok: true;
	table: typeof schema.tables.$inferSelect;
}

/**
 * Validate that a deliberation can be started for the given table and party.
 * Returns the table row on success, or an error with HTTP status on failure.
 */
export function validateDeliberationRequest(
	db: Db,
	tableId: string,
	partyId: string | null
): GuardSuccess | GuardError {
	const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
	if (!table) {
		return { ok: false, status: 404, message: 'Table not found' };
	}

	if (!partyId) {
		return { ok: false, status: 400, message: 'party parameter required' };
	}

	const link = db.select().from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all()
		.find((tp) => tp.partyId === partyId);
	if (!link) {
		return { ok: false, status: 403, message: 'party is not a member of this table' };
	}

	if (table.status !== 'pending') {
		return { ok: false, status: 409, message: `Table is already ${table.status}` };
	}

	return { ok: true, table };
}

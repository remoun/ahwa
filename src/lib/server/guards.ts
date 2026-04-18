// SPDX-License-Identifier: AGPL-3.0-or-later
import { and,eq } from 'drizzle-orm';

import type { DB } from './db';
import * as schema from './db/schema';
import { verifyShareToken } from './share';

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
 * Validate and atomically claim a table for deliberation.
 *
 * The status transition (pending → running) happens inside this function
 * via a conditional UPDATE, not in the orchestrator. This eliminates the
 * race window between "check status" and "set running" — if two requests
 * hit a pending table simultaneously, exactly one wins.
 */
export function validateDeliberationRequest(
	db: DB,
	tableId: string,
	partyId: string | null,
	token: string | null = null
): GuardSuccess | GuardError {
	const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
	if (!table) {
		return { ok: false, status: 404, message: 'Table not found' };
	}

	if (!partyId) {
		return { ok: false, status: 400, message: 'party parameter required' };
	}

	const link = db
		.select()
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all()
		.find((tp) => tp.partyId === partyId);
	if (!link) {
		return { ok: false, status: 403, message: 'party is not a member of this table' };
	}

	// If a token is supplied, it must verify. Callers that don't pass a
	// token (e.g., localhost direct access) are allowed through — M1 is
	// localhost-only. M2 public demo + M3 share links pass tokens.
	if (token !== null && !verifyShareToken(tableId, partyId, token)) {
		return { ok: false, status: 403, message: 'invalid share token' };
	}

	// Atomic claim: only transitions pending → running.
	// If another request already claimed it, changes === 0.
	const result = db
		.update(schema.tables)
		.set({ status: 'running', updatedAt: Date.now() })
		.where(and(eq(schema.tables.id, tableId), eq(schema.tables.status, 'pending')))
		.run() as unknown as { changes: number };

	if (result.changes === 0) {
		// Re-read to get current status for the error message
		const current = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
		return { ok: false, status: 409, message: `Table is already ${current?.status ?? 'unknown'}` };
	}

	// Return the table with the updated status
	return { ok: true, table: { ...table, status: 'running' } };
}

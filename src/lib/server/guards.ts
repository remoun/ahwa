// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq } from 'drizzle-orm';

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
 * Validate and atomically claim a deliberation slot for one party at one
 * table. Per-party gating (not table gating) so multi-party tables let
 * each party run the council independently — A's run can't block B's.
 *
 * The atomic claim happens on table_parties.runStatus, transitioning
 * pending → running. If two requests for the same party hit at once,
 * exactly one wins. tables.status is bumped to 'running' alongside the
 * first party's claim so the table list reflects in-progress activity.
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
		.where(and(eq(schema.tableParties.tableId, tableId), eq(schema.tableParties.partyId, partyId)))
		.get();
	if (!link) {
		return { ok: false, status: 403, message: 'party is not a member of this table' };
	}

	// If a token is supplied, it must verify. Callers that don't pass a
	// token (e.g., localhost direct access) are allowed through — M1 is
	// localhost-only. M2 public demo + M3 share links pass tokens.
	if (token !== null && !verifyShareToken(tableId, partyId, token)) {
		return { ok: false, status: 403, message: 'invalid share token' };
	}

	// In multi-party tables a party must author a stance before they
	// can run. Single-party keeps the old "dilemma is enough" semantics
	// so existing tables (no stance) still work.
	const partyCount = db
		.select()
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all().length;
	if (partyCount > 1 && !link.stance?.trim()) {
		return { ok: false, status: 412, message: 'stance required before running' };
	}

	// Atomic per-party claim: only transitions pending → running.
	const result = db
		.update(schema.tableParties)
		.set({ runStatus: 'running' })
		.where(
			and(
				eq(schema.tableParties.tableId, tableId),
				eq(schema.tableParties.partyId, partyId),
				eq(schema.tableParties.runStatus, 'pending')
			)
		)
		.run() as unknown as { changes: number };

	if (result.changes === 0) {
		return {
			ok: false,
			status: 409,
			message: `Party run is already ${link.runStatus ?? 'unknown'}`
		};
	}

	// Bump table.status from pending → running on the first party claim.
	// No-op if some other party already started.
	if (table.status === 'pending') {
		db.update(schema.tables)
			.set({ status: 'running', updatedAt: Date.now() })
			.where(and(eq(schema.tables.id, tableId), eq(schema.tables.status, 'pending')))
			.run();
	}

	return { ok: true, table: { ...table, status: 'running' } };
}

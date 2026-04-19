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
	token: string | null = null,
	callerPartyId: string | null = null
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

	// Auth: caller must either be the party themselves (their session
	// matches partyId) OR present a valid share token for that slot.
	// Without identity match, a missing-or-invalid token means anyone
	// who knows the partyId could otherwise hijack the run on M2 where
	// SSE is reachable by any authenticated user. The legacy permissive
	// path (no caller, no token) is preserved for direct test callers
	// that pre-date this argument; routes pass callerPartyId from locals.
	if (token !== null && !verifyShareToken(tableId, partyId, token)) {
		return { ok: false, status: 403, message: 'invalid share token' };
	}
	const tokenValid = token !== null && verifyShareToken(tableId, partyId, token);
	const callerIsParty = callerPartyId === partyId;
	if (callerPartyId !== null && !callerIsParty && !tokenValid) {
		return { ok: false, status: 403, message: 'identity mismatch and no valid token' };
	}

	// Stance gate + atomic claim + table-status bump run inside one
	// transaction. Without the wrapper, an invite landing between the
	// partyCount read and the claim could sneak a single-party initiator
	// past the "multi-party requires stance" rule; the tx serializes
	// these writes via SQLite's usual guarantees.
	return db.transaction((tx): GuardSuccess | GuardError => {
		const partyCount = tx
			.select()
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, tableId))
			.all().length;
		if (partyCount > 1 && !link.stance?.trim()) {
			return { ok: false, status: 412, message: 'stance required before running' };
		}

		const result = tx
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

		if (table.status === 'pending') {
			tx.update(schema.tables)
				.set({ status: 'running', updatedAt: Date.now() })
				.where(and(eq(schema.tables.id, tableId), eq(schema.tables.status, 'pending')))
				.run();
		}

		return { ok: true, table: { ...table, status: 'running' } };
	});
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import * as schema from '../src/lib/server/db/schema';
import { validateDeliberationRequest } from '../src/lib/server/guards';
import { createTestDb, type TestDb } from './helpers';

describe('validateDeliberationRequest', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();

		db.insert(schema.parties).values({ id: 'alice', displayName: 'Alice' }).run();
		db.insert(schema.parties).values({ id: 'bob', displayName: 'Bob' }).run();

		db.insert(schema.tables).values({
			id: 'pending-table',
			dilemma: 'A pending dilemma',
			councilId: 'default',
			status: 'pending'
		}).run();
		db.insert(schema.tableParties).values({
			tableId: 'pending-table',
			partyId: 'alice',
			role: 'initiator'
		}).run();

		db.insert(schema.tables).values({
			id: 'completed-table',
			dilemma: 'A completed dilemma',
			councilId: 'default',
			status: 'completed',
			synthesis: 'Done.'
		}).run();
		db.insert(schema.tableParties).values({
			tableId: 'completed-table',
			partyId: 'alice',
			role: 'initiator'
		}).run();

		db.insert(schema.tables).values({
			id: 'running-table',
			dilemma: 'An in-progress dilemma',
			councilId: 'default',
			status: 'running'
		}).run();
		db.insert(schema.tableParties).values({
			tableId: 'running-table',
			partyId: 'alice',
			role: 'initiator'
		}).run();

		db.insert(schema.tables).values({
			id: 'failed-table',
			dilemma: 'A failed dilemma',
			councilId: 'default',
			status: 'failed'
		}).run();
		db.insert(schema.tableParties).values({
			tableId: 'failed-table',
			partyId: 'alice',
			role: 'initiator'
		}).run();
	});

	it('returns ok for a pending table with a valid party', () => {
		const result = validateDeliberationRequest(db, 'pending-table', 'alice');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.table.id).toBe('pending-table');
		}
	});

	it('returns 404 for a nonexistent table', () => {
		const result = validateDeliberationRequest(db, 'nonexistent', 'alice');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
			expect(result.message).toContain('not found');
		}
	});

	it('returns 400 when partyId is null', () => {
		const result = validateDeliberationRequest(db, 'pending-table', null);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
			expect(result.message).toContain('party');
		}
	});

	it('returns 400 when partyId is empty string', () => {
		const result = validateDeliberationRequest(db, 'pending-table', '');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
		}
	});

	it('returns 403 when party is not a member of the table', () => {
		const result = validateDeliberationRequest(db, 'pending-table', 'bob');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
			expect(result.message).toContain('not a member');
		}
	});

	it('returns 409 for a completed table', () => {
		const result = validateDeliberationRequest(db, 'completed-table', 'alice');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(409);
			expect(result.message).toContain('completed');
		}
	});

	it('returns 409 for a running table', () => {
		const result = validateDeliberationRequest(db, 'running-table', 'alice');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(409);
			expect(result.message).toContain('running');
		}
	});

	it('returns 409 for a failed table', () => {
		const result = validateDeliberationRequest(db, 'failed-table', 'alice');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(409);
			expect(result.message).toContain('failed');
		}
	});

	it('checks guards in the correct order: 404 before 400', () => {
		// Both table missing AND partyId null — should get 404, not 400
		const result = validateDeliberationRequest(db, 'nonexistent', null);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
		}
	});

	it('checks guards in the correct order: 400 before 403', () => {
		// partyId null AND party not member — should get 400, not 403
		const result = validateDeliberationRequest(db, 'pending-table', null);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
		}
	});

	it('checks guards in the correct order: 403 before 409', () => {
		// bob is not a member AND table is completed — should get 403, not 409
		const result = validateDeliberationRequest(db, 'completed-table', 'bob');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
		}
	});
});

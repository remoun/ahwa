// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { validateDeliberationRequest } from '../src/lib/server/guards';
import { createTestDb, type TestDb } from './helpers';
import { createParty, createTable } from './fixtures';

describe('validateDeliberationRequest', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();

		createParty(db, 'alice', 'Alice');
		createParty(db, 'bob', 'Bob');

		createTable(db, 'pending-table', 'A pending dilemma', 'default', 'alice', 'pending');

		db.insert(schema.tables)
			.values({
				id: 'completed-table',
				dilemma: 'A completed dilemma',
				councilId: 'default',
				status: 'completed',
				synthesis: 'Done.'
			})
			.run();
		db.insert(schema.tableParties)
			.values({
				tableId: 'completed-table',
				partyId: 'alice',
				role: 'initiator'
			})
			.run();

		createTable(db, 'running-table', 'An in-progress dilemma', 'default', 'alice', 'running');
		createTable(db, 'failed-table', 'A failed dilemma', 'default', 'alice', 'failed');
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

	it('atomic claim: second call on same pending table gets 409', () => {
		// First call claims it
		const first = validateDeliberationRequest(db, 'pending-table', 'alice');
		expect(first.ok).toBe(true);

		// Second call should fail — table is now running
		const second = validateDeliberationRequest(db, 'pending-table', 'alice');
		expect(second.ok).toBe(false);
		if (!second.ok) {
			expect(second.status).toBe(409);
			expect(second.message).toContain('running');
		}
	});

	it('atomic claim: table status is running after successful validation', () => {
		const result = validateDeliberationRequest(db, 'pending-table', 'alice');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.table.status).toBe('running');
		}

		// Confirm in DB too
		const row = db.select().from(schema.tables).where(eq(schema.tables.id, 'pending-table')).get();
		expect(row!.status).toBe('running');
	});
});

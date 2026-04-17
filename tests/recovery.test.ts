// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { recoverOrphanedTables } from '../src/lib/server/db/recovery';
import { createTestDb, type TestDb } from './helpers';

describe('recoverOrphanedTables', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it('marks running tables as failed on startup', () => {
		db.insert(schema.tables)
			.values({
				id: 'orphan-1',
				dilemma: 'Was running when process crashed',
				councilId: 'default',
				status: 'running'
			})
			.run();

		const count = recoverOrphanedTables(db);

		expect(count).toBe(1);
		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'orphan-1')).get();
		expect(table!.status).toBe('failed');
		// Users navigating back should see a useful reason, not a blank
		// "encountered an error and could not complete."
		expect(table!.errorMessage).toMatch(/server restarted/i);
	});

	it('leaves pending tables alone', () => {
		db.insert(schema.tables)
			.values({
				id: 'fresh',
				dilemma: 'Just created',
				councilId: 'default',
				status: 'pending'
			})
			.run();

		recoverOrphanedTables(db);

		const table = db.select().from(schema.tables).where(eq(schema.tables.id, 'fresh')).get();
		expect(table!.status).toBe('pending');
	});

	it('leaves completed and failed tables alone', () => {
		db.insert(schema.tables)
			.values({
				id: 'done',
				dilemma: 'Finished fine',
				councilId: 'default',
				status: 'completed',
				synthesis: 'Here is the synthesis.'
			})
			.run();
		db.insert(schema.tables)
			.values({
				id: 'already-failed',
				dilemma: 'Failed earlier',
				councilId: 'default',
				status: 'failed'
			})
			.run();

		recoverOrphanedTables(db);

		const done = db.select().from(schema.tables).where(eq(schema.tables.id, 'done')).get();
		const failed = db
			.select()
			.from(schema.tables)
			.where(eq(schema.tables.id, 'already-failed'))
			.get();
		expect(done!.status).toBe('completed');
		expect(done!.synthesis).toBe('Here is the synthesis.');
		expect(failed!.status).toBe('failed');
	});

	it('returns zero when there are no orphaned tables', () => {
		db.insert(schema.tables)
			.values({
				id: 'fresh',
				dilemma: 'Just created',
				councilId: 'default',
				status: 'pending'
			})
			.run();

		const count = recoverOrphanedTables(db);
		expect(count).toBe(0);
	});

	it('recovers multiple orphaned tables in one call', () => {
		db.insert(schema.tables)
			.values([
				{ id: 'a', dilemma: 'A', councilId: 'default', status: 'running' },
				{ id: 'b', dilemma: 'B', councilId: 'default', status: 'running' },
				{ id: 'c', dilemma: 'C', councilId: 'default', status: 'pending' }
			])
			.run();

		const count = recoverOrphanedTables(db);
		expect(count).toBe(2);

		const tables = db.select().from(schema.tables).all();
		const byStatus = Object.fromEntries(
			['pending', 'failed'].map((s) => [s, tables.filter((t) => t.status === s).length])
		);
		expect(byStatus.failed).toBe(2);
		expect(byStatus.pending).toBe(1);
	});
});

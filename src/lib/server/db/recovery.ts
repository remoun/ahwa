// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

type DB = BunSQLiteDatabase<typeof schema>;

/**
 * Mark any tables stuck in 'running' as 'failed' on startup.
 *
 * A table can only be in 'running' state if an orchestrator is actively
 * processing it. Since the orchestrator runs in-process (no persistent
 * job queue), any 'running' table at startup is an orphan from a previous
 * process that crashed or restarted mid-deliberation.
 *
 * Returns the number of tables recovered (useful for logging).
 */
export function recoverOrphanedTables(db: DB): number {
	const result = db
		.update(schema.tables)
		.set({
			status: 'failed',
			errorMessage:
				'The server restarted mid-deliberation. Create a new table to try this dilemma again.',
			updatedAt: Date.now()
		})
		.where(eq(schema.tables.status, 'running'))
		.run() as unknown as { changes: number };

	return result.changes;
}

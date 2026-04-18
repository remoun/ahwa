// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../src/lib/server/db/schema';
import { ensureMigrated } from '../src/lib/server/db/migrate-runner';
import {
	detectPersonaName,
	mockCompleteResult,
	type CompleteRequest,
	type CompleteResult
} from '../src/lib/server/llm';

/**
 * In-memory DB seeded by running the same migrations as production.
 * Keeps tests in lock-step with schema changes — no parallel DDL string
 * to drift out of sync when columns are added.
 */
export function createTestDb() {
	const client = new Database(':memory:');
	const db = drizzle(client, { schema });
	ensureMigrated(db);
	return db;
}

export type TestDb = ReturnType<typeof createTestDb>;

/** Deterministic mock LLM: identifies persona from system prompt, returns labeled response */
export async function mockComplete(opts: CompleteRequest): Promise<CompleteResult> {
	const name = detectPersonaName(opts.system, 'Unknown');
	return mockCompleteResult([`[${name}] `, 'I have considered this dilemma carefully.']);
}

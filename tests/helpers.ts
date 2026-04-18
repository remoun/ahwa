// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../src/lib/server/db/schema';
import { ensureMigrated } from '../src/lib/server/db/migrate-runner';
import type { CompleteRequest, CompleteResult } from '../src/lib/server/llm';

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
	const prompt = opts.system.toLowerCase();
	let name = 'Unknown';
	if (prompt.includes('elder')) name = 'Elder';
	else if (prompt.includes('mirror')) name = 'Mirror';
	else if (prompt.includes('engineer') || prompt.includes('systems')) name = 'Engineer';
	else if (prompt.includes('weaver') || prompt.includes('relational')) name = 'Weaver';
	else if (prompt.includes('instigator') || prompt.includes('agency')) name = 'Instigator';
	else if (prompt.includes('synthesiz')) name = 'Synthesizer';

	return {
		textStream: (async function* () {
			yield `[${name}] `;
			yield 'I have considered this dilemma carefully.';
		})(),
		finished: Promise.resolve({ truncated: false })
	};
}

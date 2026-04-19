// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import type { SseEvent } from '../src/lib/schemas/events';
import { ensureMigrated } from '../src/lib/server/db/migrate-runner';
import * as schema from '../src/lib/server/db/schema';
import {
	type CompleteRequest,
	type CompleteResult,
	detectPersonaName,
	mockCompleteResult
} from '../src/lib/server/llm';
import {
	type DeliberationRequest,
	runDeliberation as productionRunDeliberation
} from '../src/lib/server/orchestrator';
import { TableBus } from '../src/lib/server/table-bus';

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

/**
 * Wrap runDeliberation with a default `bus: new TableBus()` so test
 * call sites don't need to construct one each time. Production code
 * passes the singleton from table-bus.ts; tests rarely care about
 * the bus contents (they assert on DB state), so a throwaway
 * instance is the right default.
 */
export function runDeliberation(
	db: TestDb,
	request: Omit<DeliberationRequest, 'bus'> & { bus?: DeliberationRequest['bus'] }
): AsyncGenerator<SseEvent> {
	return productionRunDeliberation(db, { ...request, bus: request.bus ?? new TableBus() });
}

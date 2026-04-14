// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../src/lib/server/db/schema';

const DDL = `
	CREATE TABLE parties (id TEXT PRIMARY KEY, display_name TEXT, created_at INTEGER);
	CREATE TABLE tables (id TEXT PRIMARY KEY, title TEXT, dilemma TEXT, council_id TEXT, status TEXT DEFAULT 'pending', synthesis TEXT, is_demo INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER);
	CREATE TABLE table_parties (table_id TEXT NOT NULL, party_id TEXT NOT NULL, role TEXT, PRIMARY KEY (table_id, party_id));
	CREATE TABLE turns (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, round INTEGER NOT NULL, party_id TEXT, persona_name TEXT, text TEXT, visible_to TEXT, created_at INTEGER);
	CREATE TABLE personas (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, system_prompt TEXT, requires TEXT, owner_party TEXT, created_at INTEGER);
	CREATE TABLE councils (id TEXT PRIMARY KEY, name TEXT, persona_ids TEXT, synthesis_prompt TEXT, round_structure TEXT, owner_party TEXT, created_at INTEGER);
	CREATE TABLE memory (party_id TEXT PRIMARY KEY, content TEXT, updated_at INTEGER);
`;

export function createTestDb() {
	const client = new Database(':memory:');
	for (const stmt of DDL.split(';').filter((s) => s.trim())) {
		client.run(stmt);
	}
	return drizzle(client, { schema });
}

export type TestDb = ReturnType<typeof createTestDb>;

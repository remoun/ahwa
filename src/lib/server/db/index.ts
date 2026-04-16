// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'fs';
import * as schema from './schema';
import { seedFromDisk } from './seed';
import { recoverOrphanedTables } from './recovery';

const dataDir = process.env.AHWA_DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });
const dbPath = `${dataDir}/ahwa.db`;

const client = new Database(dbPath, { create: true });
client.exec('PRAGMA journal_mode=WAL');

// Create tables if they don't exist (M0: inline DDL, M1: drizzle-kit migrations)
client.exec(`
	CREATE TABLE IF NOT EXISTS parties (
		id TEXT PRIMARY KEY,
		display_name TEXT,
		created_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS tables (
		id TEXT PRIMARY KEY,
		title TEXT,
		dilemma TEXT,
		council_id TEXT,
		status TEXT DEFAULT 'pending',
		synthesis TEXT,
		is_demo INTEGER DEFAULT 0,
		created_at INTEGER,
		updated_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS table_parties (
		table_id TEXT NOT NULL,
		party_id TEXT NOT NULL,
		role TEXT,
		PRIMARY KEY (table_id, party_id)
	);
	CREATE TABLE IF NOT EXISTS turns (
		id TEXT PRIMARY KEY,
		table_id TEXT NOT NULL,
		round INTEGER NOT NULL,
		party_id TEXT,
		persona_name TEXT,
		text TEXT,
		visible_to TEXT,
		created_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS personas (
		id TEXT PRIMARY KEY,
		name TEXT,
		emoji TEXT,
		system_prompt TEXT,
		requires TEXT,
		owner_party TEXT,
		created_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS councils (
		id TEXT PRIMARY KEY,
		name TEXT,
		persona_ids TEXT,
		synthesis_prompt TEXT,
		round_structure TEXT,
		model_config TEXT,
		owner_party TEXT,
		created_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS memory (
		party_id TEXT PRIMARY KEY,
		content TEXT,
		updated_at INTEGER
	);
`);

export const db = drizzle(client, { schema });

// Seed councils and personas from JSON files on startup
seedFromDisk(db);

// Recover orphaned tables from a previous process (crashed mid-deliberation).
// Any table still in 'running' state at startup is an orphan — the orchestrator
// that was processing it no longer exists. Mark them failed.
const recovered = recoverOrphanedTables(db);
if (recovered > 0) {
	console.warn(`recovery: marked ${recovered} orphaned 'running' table(s) as 'failed'`);
}

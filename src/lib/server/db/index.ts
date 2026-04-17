// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'fs';
import * as schema from './schema';
import { seedFromDisk } from './seed';
import { recoverOrphanedTables } from './recovery';
import { ensureMigrated } from './migrate-runner';

const dataDir = process.env.AHWA_DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });
const dbPath = `${dataDir}/ahwa.db`;

const client = new Database(dbPath, { create: true });
client.exec('PRAGMA journal_mode=WAL');

export const db = drizzle(client, { schema });

// Bring schema up to date via drizzle-kit migrations.
ensureMigrated(db);

// Seed councils and personas from JSON files on startup
seedFromDisk(db);

// Recover orphaned tables from a previous process (crashed mid-deliberation).
// Any table still in 'running' state at startup is an orphan — the orchestrator
// that was processing it no longer exists. Mark them failed.
const recovered = recoverOrphanedTables(db);
if (recovered > 0) {
	console.warn(`recovery: marked ${recovered} orphaned 'running' table(s) as 'failed'`);
}

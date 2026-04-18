// SPDX-License-Identifier: AGPL-3.0-or-later
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'fs';
import { ensureMigrated } from './migrate-runner';
import { recoverOrphanedTables } from './recovery';
import * as schema from './schema';
import { seedFromDisk } from './seed';

// Canonical DB type — every server module that takes a db param imports
// from here. Single-source-of-truth so a schema change doesn't have to
// ripple through ten copy-pasted `type DB = BunSQLiteDatabase<...>` lines.
export type DB = BunSQLiteDatabase<typeof schema>;

// Lazy because SvelteKit's bundler imports server modules during
// `bun run build` to extract handlers. Doing the mkdir/open/migrate
// dance at module top-level created an orphan ./data/ahwa.db at the
// build cwd. getDb() defers all work until first runtime call.
let _db: DB | null = null;

function initDb(): DB {
	const dataDir = process.env.AHWA_DATA_DIR ?? './data';
	mkdirSync(dataDir, { recursive: true });
	const dbPath = `${dataDir}/ahwa.db`;

	const client = new Database(dbPath, { create: true });
	client.exec('PRAGMA journal_mode=WAL');

	const d = drizzle(client, { schema });

	ensureMigrated(d);
	seedFromDisk(d);

	const recovered = recoverOrphanedTables(d);
	if (recovered > 0) {
		console.warn(`recovery: marked ${recovered} orphaned 'running' table(s) as 'failed'`);
	}

	return d;
}

export function getDb(): DB {
	return (_db ??= initDb());
}

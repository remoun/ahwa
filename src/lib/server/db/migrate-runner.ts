// SPDX-License-Identifier: AGPL-3.0-or-later
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Locate the migrations folder in both dev and built output.
 * Drizzle's bundle inlines nothing; we read SQL from disk.
 */
export function resolveMigrationsFolder(): string {
	const candidates = [
		new URL('./migrations', import.meta.url).pathname,
		join(process.cwd(), 'src/lib/server/db/migrations'),
		join(process.cwd(), 'migrations')
	];
	for (const p of candidates) {
		try {
			readdirSync(p);
			return p;
		} catch {
			// not this one
		}
	}
	throw new Error('could not locate migrations folder');
}

/** Bring the DB schema up to date via drizzle-kit migrations. */
export function ensureMigrated(
	db: BunSQLiteDatabase<Record<string, unknown>>,
	migrationsFolder = resolveMigrationsFolder()
): void {
	migrate(db, { migrationsFolder });
}

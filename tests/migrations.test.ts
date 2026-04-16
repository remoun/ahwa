// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { ensureMigrated } from '../src/lib/server/db/migrate-runner';
import * as schema from '../src/lib/server/db/schema';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'src/lib/server/db/migrations');

function hasTable(client: Database, name: string): boolean {
	return !!client
		.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
		.get(name);
}

describe('ensureMigrated', () => {
	it('creates all tables on a fresh DB', () => {
		const client = new Database(':memory:');
		const db = drizzle(client, { schema });
		ensureMigrated(db, MIGRATIONS);

		for (const name of ['parties', 'tables', 'table_parties', 'turns', 'personas', 'councils', 'memory']) {
			expect(hasTable(client, name)).toBe(true);
		}
		expect(hasTable(client, '__drizzle_migrations')).toBe(true);
	});

	it('produces a usable schema after migration', () => {
		const client = new Database(':memory:');
		const db = drizzle(client, { schema });
		ensureMigrated(db, MIGRATIONS);

		db.insert(schema.parties).values({ id: 'p1', displayName: 'test' }).run();
		const parties = db.select().from(schema.parties).all();
		expect(parties.length).toBe(1);
		expect(parties[0].displayName).toBe('test');
	});

	it('is idempotent across multiple calls', () => {
		const client = new Database(':memory:');
		const db = drizzle(client, { schema });
		ensureMigrated(db, MIGRATIONS);
		ensureMigrated(db, MIGRATIONS);
		// Still works — no duplicate-table errors
		const tables = db.select().from(schema.tables).all();
		expect(tables.length).toBe(0);
	});
});

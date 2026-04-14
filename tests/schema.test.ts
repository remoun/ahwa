// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { sql } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';

describe('schema', () => {
	let client: Database;
	let db: ReturnType<typeof drizzle>;

	beforeAll(() => {
		client = new Database(':memory:');
		db = drizzle(client, { schema });

		// Create tables from Drizzle schema objects
		for (const table of Object.values(schema)) {
			if (typeof table === 'object' && table !== null && Symbol.for('drizzle:Name') in table) {
				const tableName = (table as any)[Symbol.for('drizzle:Name')];
				const columns = (table as any)[Symbol.for('drizzle:Columns')];
				const colDefs: string[] = [];

				for (const [, col] of Object.entries(columns) as any) {
					const name = col.name;
					const type = col.columnType === 'SQLiteText' ? 'TEXT' : 'INTEGER';
					let def = `"${name}" ${type}`;
					if (col.primary) def += ' PRIMARY KEY';
					if (col.notNull) def += ' NOT NULL';
					if (col.hasDefault && col.default !== undefined) {
						def += ` DEFAULT ${typeof col.default === 'string' ? `'${col.default}'` : col.default}`;
					}
					colDefs.push(def);
				}

				client.run(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')})`);
			}
		}
	});

	afterAll(() => {
		client.close();
	});

	it('creates all seven tables', () => {
		const result = db.all<{ name: string }>(
			sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
		);
		const names = result.map((r) => r.name);

		expect(names).toContain('parties');
		expect(names).toContain('tables');
		expect(names).toContain('table_parties');
		expect(names).toContain('turns');
		expect(names).toContain('personas');
		expect(names).toContain('councils');
		expect(names).toContain('memory');
	});

	it('tables has is_demo column defaulting to 0', () => {
		const cols = client.prepare("PRAGMA table_info('tables')").all() as any[];
		const isDemo = cols.find((c: any) => c.name === 'is_demo');
		expect(isDemo).toBeDefined();
		expect(isDemo.dflt_value).toBe('0');
	});

	it('turns has visible_to column', () => {
		const cols = client.prepare("PRAGMA table_info('turns')").all() as any[];
		const visibleTo = cols.find((c: any) => c.name === 'visible_to');
		expect(visibleTo).toBeDefined();
		expect(visibleTo.type).toBe('TEXT');
	});

	it('personas has requires column', () => {
		const cols = client.prepare("PRAGMA table_info('personas')").all() as any[];
		const requires = cols.find((c: any) => c.name === 'requires');
		expect(requires).toBeDefined();
		expect(requires.type).toBe('TEXT');
	});

	it('table_parties has both table_id and party_id columns', () => {
		const cols = client.prepare("PRAGMA table_info('table_parties')").all() as any[];
		const tableId = cols.find((c: any) => c.name === 'table_id');
		const partyId = cols.find((c: any) => c.name === 'party_id');
		expect(tableId).toBeDefined();
		expect(partyId).toBeDefined();
	});

	it('memory has party_id as primary key', () => {
		const cols = client.prepare("PRAGMA table_info('memory')").all() as any[];
		const partyId = cols.find((c: any) => c.name === 'party_id');
		expect(partyId).toBeDefined();
		expect(partyId.pk).toBe(1);
	});
});

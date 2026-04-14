// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { seedFromDisk } from '../src/lib/server/db/seed';

function createTestDb() {
	const client = new Database(':memory:');
	client.run(`CREATE TABLE parties (id TEXT PRIMARY KEY, display_name TEXT, created_at INTEGER)`);
	client.run(`CREATE TABLE tables (id TEXT PRIMARY KEY, title TEXT, dilemma TEXT, council_id TEXT, status TEXT DEFAULT 'pending', synthesis TEXT, is_demo INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER)`);
	client.run(`CREATE TABLE table_parties (table_id TEXT, party_id TEXT, role TEXT, PRIMARY KEY (table_id, party_id))`);
	client.run(`CREATE TABLE turns (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, round INTEGER NOT NULL, party_id TEXT, persona_name TEXT, text TEXT, visible_to TEXT, created_at INTEGER)`);
	client.run(`CREATE TABLE personas (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, system_prompt TEXT, requires TEXT, owner_party TEXT, created_at INTEGER)`);
	client.run(`CREATE TABLE councils (id TEXT PRIMARY KEY, name TEXT, persona_ids TEXT, synthesis_prompt TEXT, round_structure TEXT, owner_party TEXT, created_at INTEGER)`);
	client.run(`CREATE TABLE memory (party_id TEXT PRIMARY KEY, content TEXT, updated_at INTEGER)`);
	return drizzle(client, { schema });
}

describe('seedFromDisk', () => {
	let db: ReturnType<typeof drizzle>;

	beforeEach(() => {
		db = createTestDb();
	});

	it('loads default and federation councils into the councils table', () => {
		seedFromDisk(db);
		const rows = db.select().from(schema.councils).all();
		const ids = rows.map((r) => r.id);
		expect(ids).toContain('default');
		expect(ids).toContain('federation');
	});

	it('loads all personas from default council into personas table', () => {
		seedFromDisk(db);
		const rows = db.select().from(schema.personas).all();
		const ids = rows.map((r) => r.id);
		expect(ids).toContain('elder');
		expect(ids).toContain('mirror');
		expect(ids).toContain('engineer');
		expect(ids).toContain('weaver');
		expect(ids).toContain('instigator');
	});

	it('loads standalone personas from personas/ directory', () => {
		seedFromDisk(db);
		const rows = db.select().from(schema.personas).where(eq(schema.personas.id, 'historian')).all();
		expect(rows.length).toBe(1);
		expect(JSON.parse(rows[0].requires!)).toEqual(['memory']);
	});

	it('is idempotent on re-run', () => {
		seedFromDisk(db);
		seedFromDisk(db);
		const councils = db.select().from(schema.councils).all();
		const personas = db.select().from(schema.personas).all();
		// Should not duplicate rows
		expect(councils.filter((c) => c.id === 'default').length).toBe(1);
		expect(personas.filter((p) => p.id === 'elder').length).toBe(1);
	});

	it('stores persona_ids as JSON array on council row', () => {
		seedFromDisk(db);
		const row = db.select().from(schema.councils).where(eq(schema.councils.id, 'default')).get();
		expect(row).toBeDefined();
		const ids = JSON.parse(row!.personaIds!);
		expect(ids).toContain('elder');
		expect(ids).toContain('mirror');
		expect(ids.length).toBe(5);
	});
});

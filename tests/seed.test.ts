// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { seedFromDisk } from '../src/lib/server/db/seed';
import { createTestDb, type TestDb } from './helpers';

describe('seedFromDisk', () => {
	let db: TestDb;

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

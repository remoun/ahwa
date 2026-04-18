// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createTestDb } from './helpers';
import * as schema from '../src/lib/server/db/schema';
import { getPartyFromRequest } from '../src/lib/server/identity';

function makeRequest(headers: Record<string, string> = {}): Request {
	return new Request('http://localhost/', { headers });
}

describe('identity.getPartyFromRequest', () => {
	it('falls back to the singleton "me" party when trust is off and no header is present', () => {
		const db = createTestDb();
		const env = { trustIdentity: false, headerName: 'x-remote-user' };

		const party = getPartyFromRequest(makeRequest(), { db, env });

		expect(party.displayName).toBe('me');
		expect(party.externalId).toBeNull();
	});

	it('ignores the identity header when trust is off (defense against spoofed headers)', () => {
		const db = createTestDb();
		const env = { trustIdentity: false, headerName: 'x-remote-user' };

		const party = getPartyFromRequest(makeRequest({ 'x-remote-user': 'alice' }), { db, env });

		expect(party.displayName).toBe('me');
		expect(party.externalId).toBeNull();
	});

	it('returns the same "me" party across calls (singleton, not a fresh row each time)', () => {
		const db = createTestDb();
		const env = { trustIdentity: false, headerName: 'x-remote-user' };

		const a = getPartyFromRequest(makeRequest(), { db, env });
		const b = getPartyFromRequest(makeRequest(), { db, env });

		expect(a.id).toBe(b.id);
		const allMe = db.select().from(schema.parties).all();
		expect(allMe).toHaveLength(1);
	});

	it('creates a party keyed on external_id when trust is on and header is present', () => {
		const db = createTestDb();
		const env = { trustIdentity: true, headerName: 'x-remote-user' };

		const party = getPartyFromRequest(makeRequest({ 'x-remote-user': 'alice' }), { db, env });

		expect(party.externalId).toBe('alice');
		expect(party.displayName).toBe('alice');

		const stored = db
			.select()
			.from(schema.parties)
			.where(eq(schema.parties.externalId, 'alice'))
			.all();
		expect(stored).toHaveLength(1);
	});

	it('returns the same party for repeat calls with the same external_id (lookup, not duplicate)', () => {
		const db = createTestDb();
		const env = { trustIdentity: true, headerName: 'x-remote-user' };

		const a = getPartyFromRequest(makeRequest({ 'x-remote-user': 'alice' }), { db, env });
		const b = getPartyFromRequest(makeRequest({ 'x-remote-user': 'alice' }), { db, env });

		expect(a.id).toBe(b.id);
	});

	it('returns different parties for different external_ids', () => {
		const db = createTestDb();
		const env = { trustIdentity: true, headerName: 'x-remote-user' };

		const alice = getPartyFromRequest(makeRequest({ 'x-remote-user': 'alice' }), { db, env });
		const bob = getPartyFromRequest(makeRequest({ 'x-remote-user': 'bob' }), { db, env });

		expect(alice.id).not.toBe(bob.id);
		expect(alice.externalId).toBe('alice');
		expect(bob.externalId).toBe('bob');
	});

	it('falls back to "me" when trust is on but the header is absent', () => {
		const db = createTestDb();
		const env = { trustIdentity: true, headerName: 'x-remote-user' };

		const party = getPartyFromRequest(makeRequest(), { db, env });

		expect(party.displayName).toBe('me');
		expect(party.externalId).toBeNull();
	});

	it('treats a whitespace-only header value as absent', () => {
		const db = createTestDb();
		const env = { trustIdentity: true, headerName: 'x-remote-user' };

		const party = getPartyFromRequest(makeRequest({ 'x-remote-user': '   ' }), { db, env });

		expect(party.displayName).toBe('me');
		expect(party.externalId).toBeNull();
	});

	it('respects a custom header name', () => {
		const db = createTestDb();
		const env = { trustIdentity: true, headerName: 'auth-user' };

		const party = getPartyFromRequest(makeRequest({ 'auth-user': 'alice' }), { db, env });

		expect(party.externalId).toBe('alice');
	});
});

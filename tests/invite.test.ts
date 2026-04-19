// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import * as schema from '../src/lib/server/db/schema';
import type { ResolvedParty } from '../src/lib/server/identity';
import { createInviteHandler } from '../src/lib/server/invite';
import { verifyShareToken } from '../src/lib/server/share';
import { createTestDb, type TestDb } from './helpers';

describe('invite handler', () => {
	const originalSecret = process.env.AHWA_SHARE_SECRET;
	beforeAll(() => {
		process.env.AHWA_SHARE_SECRET = 'x'.repeat(64);
	});
	afterAll(() => {
		if (originalSecret !== undefined) process.env.AHWA_SHARE_SECRET = originalSecret;
		else delete process.env.AHWA_SHARE_SECRET;
	});

	let db: TestDb;
	const initiator: ResolvedParty = { id: 'party-A', displayName: 'A', externalId: null };

	beforeEach(() => {
		db = createTestDb();
		db.insert(schema.parties).values({ id: initiator.id, displayName: 'A' }).run();
		db.insert(schema.tables)
			.values({ id: 'tbl-1', dilemma: 'd', councilId: 'default', status: 'pending' })
			.run();
		db.insert(schema.tableParties)
			.values({ tableId: 'tbl-1', partyId: initiator.id, role: 'initiator' })
			.run();
	});

	function call(tableId: string, party: ResolvedParty = initiator) {
		const handler = createInviteHandler({ getDb: () => db });
		return handler({ tableId, party });
	}

	it('mints a placeholder party linked to the table as invited', async () => {
		const res = await call('tbl-1');
		expect(res.status).toBe(201);
		const body = (await res.json()) as { partyId: string; token: string; url: string };

		const links = db
			.select()
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, 'tbl-1'))
			.all();
		expect(links).toHaveLength(2);
		const invited = links.find((l) => l.role === 'invited');
		expect(invited?.partyId).toBe(body.partyId);
	});

	it('returns a verifiable share URL', async () => {
		const res = await call('tbl-1');
		const body = (await res.json()) as { partyId: string; token: string; url: string };

		expect(verifyShareToken('tbl-1', body.partyId, body.token)).toBe(true);
		expect(body.url).toBe(`/t/tbl-1?party=${body.partyId}&token=${body.token}`);
	});

	it('rejects when caller is not a member of the table', async () => {
		const stranger: ResolvedParty = { id: 'party-X', displayName: 'X', externalId: null };
		db.insert(schema.parties).values({ id: stranger.id, displayName: 'X' }).run();
		const res = await call('tbl-1', stranger);
		expect(res.status).toBe(403);
	});

	it('404 when the table does not exist', async () => {
		const res = await call('nope');
		expect(res.status).toBe(404);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { signShareToken } from '$lib/server/share';

import type { RequestHandler } from './$types';

/** List non-demo tables, most recent first */
export const GET: RequestHandler = async () => {
	const db = getDb();
	const tables = db
		.select()
		.from(schema.tables)
		.where(eq(schema.tables.isDemo, 0))
		.orderBy(desc(schema.tables.createdAt))
		.all();

	return json(tables);
};

/** Create a new table */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const dilemma = body.dilemma as string;
	const councilId = (body.councilId as string) || 'default';

	if (!dilemma?.trim()) {
		return json({ error: 'dilemma is required' }, { status: 400 });
	}

	const db = getDb();
	const council = db.select().from(schema.councils).where(eq(schema.councils.id, councilId)).get();
	if (!council) {
		return json({ error: `Council not found: ${councilId}` }, { status: 400 });
	}

	// Initiator party is resolved once per request by hooks.server.ts.
	// Same user across requests = same party row (invariant #1).
	const partyId = locals.party.id;

	const tableId = nanoid();
	db.insert(schema.tables)
		.values({
			id: tableId,
			dilemma,
			councilId,
			status: 'pending'
		})
		.run();

	db.insert(schema.tableParties).values({ tableId, partyId, role: 'initiator' }).run();

	return json({ tableId, partyId, token: signShareToken(tableId, partyId) });
};

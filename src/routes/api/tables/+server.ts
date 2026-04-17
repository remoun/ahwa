// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { signShareToken } from '$lib/server/share';
import * as schema from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** List non-demo tables, most recent first */
export const GET: RequestHandler = async () => {
	const tables = db
		.select()
		.from(schema.tables)
		.where(eq(schema.tables.isDemo, 0))
		.orderBy(desc(schema.tables.createdAt))
		.all();

	return json(tables);
};

/** Create a new table */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const dilemma = body.dilemma as string;
	const councilId = (body.councilId as string) || 'default';

	if (!dilemma?.trim()) {
		return json({ error: 'dilemma is required' }, { status: 400 });
	}

	// Verify council exists
	const council = db.select().from(schema.councils).where(eq(schema.councils.id, councilId)).get();
	if (!council) {
		return json({ error: `Council not found: ${councilId}` }, { status: 400 });
	}

	// Create a party for this user (M1: one party per table)
	const partyId = nanoid();
	db.insert(schema.parties).values({ id: partyId, displayName: 'me' }).run();

	// Create the table row
	const tableId = nanoid();
	db.insert(schema.tables)
		.values({
			id: tableId,
			dilemma,
			councilId,
			status: 'pending'
		})
		.run();

	// Link party to table
	db.insert(schema.tableParties).values({ tableId, partyId, role: 'initiator' }).run();

	return json({ tableId, partyId, token: signShareToken(tableId, partyId) });
};

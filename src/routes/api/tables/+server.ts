// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const dilemma = body.dilemma as string;

	if (!dilemma?.trim()) {
		return json({ error: 'dilemma is required' }, { status: 400 });
	}

	// Create a party for this user (M0: one party per table, hardcoded)
	const partyId = nanoid();
	db.insert(schema.parties)
		.values({ id: partyId, displayName: 'me' })
		.run();

	// Create the table row (M0: hardcoded to default council)
	const tableId = nanoid();
	db.insert(schema.tables)
		.values({
			id: tableId,
			dilemma,
			councilId: 'default',
			status: 'pending'
		})
		.run();

	// Link party to table
	db.insert(schema.tableParties)
		.values({ tableId, partyId, role: 'initiator' })
		.run();

	return json({ tableId, partyId });
};

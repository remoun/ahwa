// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';

import { getDb } from '$lib/server/db';
import { createStanceHandler } from '$lib/server/stance';
import { tableBus } from '$lib/server/table-bus';

import type { RequestHandler } from './$types';

const handle = createStanceHandler({ getDb, bus: tableBus });

export const PATCH: RequestHandler = async ({ params, url, request, locals }) => {
	let body: { stance?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	if (typeof body.stance !== 'string') {
		return json({ error: 'stance required' }, { status: 400 });
	}
	return handle({
		tableId: params.id,
		partyId: params.partyId,
		stance: body.stance,
		party: locals.party,
		token: url.searchParams.get('token') ?? undefined
	});
};

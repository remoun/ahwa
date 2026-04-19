// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';

import { getDb } from '$lib/server/db';
import { createRevealHandler } from '$lib/server/reveal';

import type { RequestHandler } from './$types';

const handle = createRevealHandler({ getDb });

export const POST: RequestHandler = async ({ params, request, locals }) => {
	let body: { withPartyId?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	if (!body.withPartyId) {
		return json({ error: 'withPartyId required' }, { status: 400 });
	}
	return handle({ turnId: params.id, withPartyId: body.withPartyId, party: locals.party });
};

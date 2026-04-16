// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { validateDeliberationRequest } from '$lib/server/guards';
import { runDeliberation } from '$lib/server/orchestrator';
import { toSseStream } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request }) => {
	const tableId = params.id;
	const partyId = url.searchParams.get('party');

	const guard = validateDeliberationRequest(db, tableId, partyId);
	if (!guard.ok) {
		return new Response(
			JSON.stringify({ error: guard.message }),
			{ status: guard.status, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const { table } = guard;
	const stream = toSseStream(runDeliberation(db, {
		tableId,
		dilemma: table.dilemma!,
		councilId: table.councilId!,
		partyId: partyId!,
		signal: request.signal
	}));

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

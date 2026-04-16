// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { validateDeliberationRequest } from '$lib/server/guards';
import { runDeliberation } from '$lib/server/orchestrator';
import { toSseStream } from '$lib/server/sse';
import { errorMessage } from '$lib/util';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request }) => {
	try {
		const tableId = params.id;
		const partyId = url.searchParams.get('party');
		const token = url.searchParams.get('token');

		const guard = validateDeliberationRequest(db, tableId, partyId, token);
		if (!guard.ok) {
			return new Response(JSON.stringify({ error: guard.message }), {
				status: guard.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const { table } = guard;
		const stream = toSseStream(
			runDeliberation(db, {
				tableId,
				dilemma: table.dilemma!,
				councilId: table.councilId!,
				partyId: partyId!,
				signal: request.signal
			})
		);

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				// Disable proxy buffering (Fly, nginx, etc.) so tokens arrive
				// as they're produced instead of batched when the stream ends.
				'X-Accel-Buffering': 'no'
			}
		});
	} catch (err) {
		// Handler-level failures (e.g., DB unavailable) never reach the
		// SSE stream, so return a JSON error body the client can surface.
		console.error('SSE handler error:', err);
		return new Response(JSON.stringify({ error: errorMessage(err) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

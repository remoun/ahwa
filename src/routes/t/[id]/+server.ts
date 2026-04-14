// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { validateDeliberationRequest } from '$lib/server/guards';
import { runDeliberation } from '$lib/server/orchestrator';
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
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			try {
				for await (const event of runDeliberation(db, {
					tableId,
					dilemma: table.dilemma!,
					councilId: table.councilId!,
					partyId: partyId!,
					signal: request.signal
				})) {
					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(data));
				}
			} catch (err) {
				// Don't send error events for aborts — client is already gone
				if (!(err instanceof Error && err.message.includes('aborted'))) {
					const errorEvent = `data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`;
					controller.enqueue(encoder.encode(errorEvent));
				}
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

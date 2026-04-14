// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { runDeliberation } from '$lib/server/orchestrator';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const tableId = params.id;
	const partyId = url.searchParams.get('party');

	// Look up the table
	const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();
	if (!table) {
		return new Response('Table not found', { status: 404 });
	}
	if (!partyId) {
		return new Response('party parameter required', { status: 400 });
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			try {
				for await (const event of runDeliberation(db, {
					dilemma: table.dilemma!,
					councilId: table.councilId!,
					partyId
				})) {
					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(data));
				}
			} catch (err) {
				const errorEvent = `data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`;
				controller.enqueue(encoder.encode(errorEvent));
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

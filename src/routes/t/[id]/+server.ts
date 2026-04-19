// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';

import type { TableBusEvent } from '$lib/schemas/events';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { withDemoReconcile } from '$lib/server/demo-reconcile';
import { validateDeliberationRequest } from '$lib/server/guards';
import { runDeliberation } from '$lib/server/orchestrator';
import { verifyShareToken } from '$lib/server/share';
import { toSseStream } from '$lib/server/sse';
import { subscribe } from '$lib/server/table-bus';
import { errorMessage } from '$lib/util';

import type { RequestHandler } from './$types';

// Same env defaults as src/routes/api/demo/tables/+server.ts. The
// estimate read here MUST match the one used at pre-charge time, or
// the math breaks. Both files read the same env var name.
const DEMO_ESTIMATE_TOKENS = parseInt(process.env.AHWA_DEMO_ESTIMATE_TOKENS ?? '5000', 10);
const DEMO_USD_PER_MILLION = parseFloat(process.env.AHWA_DEMO_USD_PER_MILLION_TOKENS ?? '0.75');

export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	try {
		const tableId = params.id;
		const partyId = url.searchParams.get('party');
		const token = url.searchParams.get('token');
		const subscribeOnly = url.searchParams.get('subscribe') === '1';

		const db = getDb();

		// Subscribe-only: any viewer who's a member of the table opens
		// this stream and receives state events (party_*, turn_revealed,
		// table_synthesized) as other parties act. The runner's
		// orchestrator publishes through the same bus, so this is the
		// single channel for "what's happening at this table."
		// Per-deliberation token streams are NOT broadcast — they go
		// only to the runner's connection (the non-subscribe branch
		// below) since they're high-bandwidth and party-private.
		if (subscribeOnly) {
			const subGuard = validateSubscribeRequest(db, tableId, partyId, token, locals.party.id);
			if (!subGuard.ok) {
				return new Response(JSON.stringify({ error: subGuard.message }), {
					status: subGuard.status,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			const events = subscribe({ tableId, signal: request.signal });
			const stream = toSseStream(filterForSubscriber(events, partyId!));
			return sseResponse(stream);
		}

		const guard = validateDeliberationRequest(db, tableId, partyId, token, locals.party.id);
		if (!guard.ok) {
			return new Response(JSON.stringify({ error: guard.message }), {
				status: guard.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const { table } = guard;
		const deliberation = runDeliberation(db, {
			tableId,
			dilemma: table.dilemma!,
			councilId: table.councilId!,
			partyId: partyId!,
			signal: request.signal
		});
		// Reconcile (actual - estimate) into today's demo bookkeeping
		// once the table closes. Pass-through for non-demo tables.
		const stream = toSseStream(
			withDemoReconcile(deliberation, {
				db,
				isDemo: table.isDemo === 1,
				estimateTokens: DEMO_ESTIMATE_TOKENS,
				usdPerMillion: DEMO_USD_PER_MILLION
			})
		);

		return sseResponse(stream);
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

function sseResponse(stream: ReadableStream): Response {
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			// Disable proxy buffering (Fly, nginx, etc.) so events arrive
			// as they're produced instead of batched when the stream ends.
			'X-Accel-Buffering': 'no'
		}
	});
}

/**
 * Light auth for subscribe-only viewers — they don't trigger a run, so
 * the full run gate is overkill. Need: caller is identified (matches
 * partyId or holds a valid token) and is a member of the table.
 */
function validateSubscribeRequest(
	db: ReturnType<typeof getDb>,
	tableId: string,
	partyId: string | null,
	token: string | null,
	callerPartyId: string
): { ok: true } | { ok: false; status: number; message: string } {
	if (!partyId) return { ok: false, status: 400, message: 'party required' };
	const member = db
		.select()
		.from(schema.tableParties)
		.where(eq(schema.tableParties.tableId, tableId))
		.all()
		.find((tp) => tp.partyId === partyId);
	if (!member) return { ok: false, status: 403, message: 'not a member of this table' };
	const tokenValid = !!token && verifyShareToken(tableId, partyId, token);
	if (callerPartyId !== partyId && !tokenValid) {
		return { ok: false, status: 403, message: 'identity mismatch and no valid token' };
	}
	return { ok: true };
}

/**
 * Filter bus events for a subscribe-only viewer. Token-stream events
 * (token, persona_turn_*, synthesis_token) are scoped to the running
 * party — but we don't currently know who's running for each token
 * event because the Token schema doesn't carry partyId. For now,
 * subscribe-only viewers receive ONLY state events and the structural
 * deliberation events (table_opened, round_started, etc., which are
 * coarse and party-anonymous). High-bandwidth token streams stay on
 * the runner's own connection.
 */
async function* filterForSubscriber(
	events: AsyncIterable<TableBusEvent>,
	_viewerPartyId: string
): AsyncGenerator<TableBusEvent> {
	for await (const event of events) {
		if (
			event.type === 'token' ||
			event.type === 'synthesis_token' ||
			event.type === 'persona_turn_started' ||
			event.type === 'persona_turn_completed'
		) {
			continue;
		}
		yield event;
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import { withDemoReconcile } from '$lib/server/demo-reconcile';
import { validateDeliberationRequest } from '$lib/server/guards';
import { runDeliberation } from '$lib/server/orchestrator';
import { toSseStream } from '$lib/server/sse';
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

		const db = getDb();
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

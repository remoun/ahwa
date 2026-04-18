// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { createDemoRouteHandler } from '$lib/server/demo-route';
import { createRateLimiter } from '$lib/server/rate-limit';
import { cleanupExpiredDemoTables } from '$lib/server/demo-cleanup';
import type { RequestHandler } from './$types';

const env = {
	// Hard cap on per-day demo tokens. Routes refuse demo creation when
	// today's pre-charged + reconciled total would exceed this.
	capTokens: parseInt(process.env.AHWA_DEMO_DAILY_TOKEN_CAP ?? '500000', 10),
	// Per-demo pre-charge estimate. ~5K is reasonable for the 3-persona,
	// 1-round, Haiku-pinned demo council. Reconciled to actual after the
	// deliberation finishes (TODO: wire reconciliation in the SSE handler).
	estimateTokens: parseInt(process.env.AHWA_DEMO_ESTIMATE_TOKENS ?? '5000', 10),
	usdPerMillion: parseFloat(process.env.AHWA_DEMO_USD_PER_MILLION_TOKENS ?? '0.75')
};

// Per-IP token bucket. Capacity 5, refill 1/min — enough for a
// human exploring the demo, low enough to deny script abuse.
const rateLimiter = createRateLimiter({
	capacity: parseInt(process.env.AHWA_DEMO_RATE_BURST ?? '5', 10),
	refillPerSecond: parseFloat(process.env.AHWA_DEMO_RATE_PER_SECOND ?? '0.0167') // ~1/min
});

const handle = createDemoRouteHandler({ db, env, rateLimiter });

export const POST: RequestHandler = async ({ request }) => handle(request);

// Periodically purge expired demos. setInterval is fine — single Bun
// process, no external scheduler needed. Quiet failure: log and move on
// (the next sweep will catch it).
const TTL_HOURS = parseInt(process.env.AHWA_DEMO_TTL_HOURS ?? '24', 10);
const SWEEP_MS = parseInt(process.env.AHWA_DEMO_SWEEP_MS ?? `${60 * 60 * 1000}`, 10); // hourly
setInterval(() => {
	try {
		const removed = cleanupExpiredDemoTables({ db, ttlHours: TTL_HOURS });
		if (removed > 0) console.log(`demo: cleaned up ${removed} expired table(s)`);
	} catch (err) {
		console.error('demo: cleanup failed', err);
	}
}, SWEEP_MS);

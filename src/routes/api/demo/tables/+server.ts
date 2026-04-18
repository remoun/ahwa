// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { createDemoRouteHandler } from '$lib/server/demo-route';
import { createRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const env = {
	// Hard cap on per-day demo tokens. Pre-charge refuses creation when
	// today + estimate would exceed this. Reconciled to actuals after the
	// deliberation finishes (see src/lib/server/demo-reconcile.ts wired in
	// src/routes/t/[id]/+server.ts).
	capTokens: parseInt(process.env.AHWA_DEMO_DAILY_TOKEN_CAP ?? '500000', 10),
	// Per-demo pre-charge estimate. ~5K is reasonable for the 3-persona,
	// 1-round, Haiku-pinned demo council.
	estimateTokens: parseInt(process.env.AHWA_DEMO_ESTIMATE_TOKENS ?? '5000', 10),
	usdPerMillion: parseFloat(process.env.AHWA_DEMO_USD_PER_MILLION_TOKENS ?? '0.75')
};

// Per-IP token bucket. Capacity 5, refill 1/min — enough for a human
// exploring the demo, low enough to deny script abuse.
const rateLimiter = createRateLimiter({
	capacity: parseInt(process.env.AHWA_DEMO_RATE_BURST ?? '5', 10),
	refillPerSecond: parseFloat(process.env.AHWA_DEMO_RATE_PER_SECOND ?? '0.0167') // ~1/min
});

const handle = createDemoRouteHandler({ db, env, rateLimiter });

export const POST: RequestHandler = async ({ request }) => handle(request);

// TTL cleanup wiring lives in src/hooks.server.ts so it runs once per
// process at startup, not lazily on the first POST to this route.

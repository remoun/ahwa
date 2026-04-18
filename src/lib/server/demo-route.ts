// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';
import { createDemoTable } from './demo';
import { reconcileDemoTokens, tryReserveDemoBudget } from './demo-usage';
import type { RateLimiter } from './rate-limit';

type Db = BunSQLiteDatabase<typeof schema>;

export interface DemoRouteEnv {
	capTokens: number;
	estimateTokens: number;
	usdPerMillion?: number;
}

export interface DemoRouteDeps {
	db: Db;
	env: DemoRouteEnv;
	rateLimiter: RateLimiter;
	now?: () => number;
}

/**
 * POST /api/demo/tables handler factory. The route file is a 4-line
 * wrapper that wires production deps; tests use this factory with mock
 * deps (no SvelteKit boot needed).
 *
 * Order of checks matters: rate limit BEFORE budget reserve so a
 * spammy IP can't bleed the daily cap. Budget reserve BEFORE create
 * so we don't insert a row we'd then have to delete on cap-overflow.
 */
export function createDemoRouteHandler(deps: DemoRouteDeps) {
	const { db, env, rateLimiter, now } = deps;

	return async function handle(request: Request): Promise<Response> {
		// 1. Rate limit by IP (X-Forwarded-For first hop, "unknown" if absent)
		const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
		if (!rateLimiter.tryConsume(ip)) {
			return json({ error: 'Too many demo requests from this IP. Try again in a minute.' }, 429);
		}

		// 2. Parse body before reserving budget so a malformed POST doesn't
		// burn cap tokens.
		let body: { dilemma?: string };
		try {
			body = await request.json();
		} catch {
			return json({ error: 'Request body must be valid JSON.' }, 400);
		}

		// 3. Pre-charge an estimate atomically. Refused if it would push
		// today over the cap. Wrapped: a DB failure here would otherwise
		// propagate as an uncaught 500 with no operator log AND with the
		// rate-limit token already burned (line 38).
		let reserve;
		try {
			reserve = tryReserveDemoBudget({
				db,
				capTokens: env.capTokens,
				estimateTokens: env.estimateTokens,
				now,
				usdPerMillion: env.usdPerMillion
			});
		} catch (err) {
			console.error('demo: tryReserveDemoBudget failed', err);
			return json({ error: 'Demo service unavailable. Please try again later.' }, 503);
		}
		if (!reserve.reserved) {
			return json(
				{
					error:
						'The public demo has hit its daily token cap. Try again tomorrow, or self-host the app — see https://github.com/remoun/ahwa.'
				},
				503
			);
		}

		// 4. Create the table. The catch handles two distinct cases:
		// - Validation: empty/too-long dilemma, missing demo council — 400
		// - Infra: SQLITE_BUSY, schema mismatch, etc. — log + 500
		// Both refund the pre-charge so the cap doesn't silently bleed.
		try {
			const result = createDemoTable({ db, dilemma: body.dilemma ?? '' });
			return json(result, 201);
		} catch (err) {
			reconcileDemoTokens({
				db,
				estimateTokens: env.estimateTokens,
				actualTokens: 0,
				now,
				usdPerMillion: env.usdPerMillion
			});
			const message = (err as Error).message;
			// Validation errors come from createDemoTable's own throws — the
			// messages it raises are user-facing. Anything else is infra
			// surfacing through; log it for ops and return a generic 500.
			if (isValidationError(message)) {
				return json({ error: message }, 400);
			}
			console.error('demo: createDemoTable failed', err);
			return json({ error: 'Demo creation failed. Please try again.' }, 500);
		}
	};
}

/**
 * Match the error messages createDemoTable raises for invalid inputs
 * (see src/lib/server/demo.ts). Anything that doesn't match is treated
 * as an infrastructure failure and surfaced to ops via console.error.
 */
function isValidationError(message: string): boolean {
	return /dilemma is required|dilemma too long|demo council .* is not installed/i.test(message);
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

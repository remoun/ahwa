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
		// today over the cap.
		const reserve = tryReserveDemoBudget({
			db,
			capTokens: env.capTokens,
			estimateTokens: env.estimateTokens,
			now,
			usdPerMillion: env.usdPerMillion
		});
		if (!reserve.reserved) {
			return json(
				{
					error:
						'The public demo has hit its daily token cap. Try again tomorrow, or self-host the app — see https://github.com/remoun/ahwa.'
				},
				503
			);
		}

		// 4. Create the table. If the dilemma is invalid (empty / too long)
		// or the demo council isn't installed, refund the pre-charge and
		// surface a 400.
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
			return json({ error: (err as Error).message }, 400);
		}
	};
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

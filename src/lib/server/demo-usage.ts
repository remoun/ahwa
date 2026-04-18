// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, sql } from 'drizzle-orm';

import type { DB } from './db';
import * as schema from './db/schema';

/**
 * Default per-million-token cost estimate in USD. A blended rate that
 * roughly matches Claude Haiku 4.5 ($0.25/M input + $1.25/M output) at
 * a typical 1:1 input/output ratio for short demo dilemmas. Operators
 * can override per-deploy via AHWA_DEMO_USD_PER_MILLION_TOKENS to
 * match whatever model the demo council pins to.
 */
export const DEMO_USD_PER_MILLION_TOKENS_DEFAULT = 0.75;

function utcDate(now: () => number): string {
	const d = new Date(now());
	return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function microUsdFor(tokens: number, usdPerMillion: number): number {
	return Math.round(tokens * usdPerMillion);
}

/**
 * Lowest-level primitive: signed adjustment of today's row.
 * Used by both pre-charge (positive delta) and reconcile (positive or
 * negative). Single SQLite UPSERT — atomic on the file lock, so two
 * processes calling at once accumulate correctly.
 */
function adjustDemoUsage(
	db: DB,
	tokensDelta: number,
	costMicroDelta: number,
	now: () => number
): void {
	const dateUtc = utcDate(now);
	db.insert(schema.demoUsage)
		.values({
			dateUtc,
			tokens: tokensDelta,
			costMicroUsd: costMicroDelta,
			updatedAt: now()
		})
		.onConflictDoUpdate({
			target: schema.demoUsage.dateUtc,
			set: {
				tokens: sql`${schema.demoUsage.tokens} + ${tokensDelta}`,
				costMicroUsd: sql`${schema.demoUsage.costMicroUsd} + ${costMicroDelta}`,
				updatedAt: now()
			}
		})
		.run();
}

export interface RecordDemoTokensInput {
	db: DB;
	tokens: number;
	now?: () => number;
	usdPerMillion?: number;
}

/**
 * Add `tokens` to today's running total. Use this when you have the
 * final, settled token count (no estimate involved). For the pre-charge
 * flow, prefer tryReserveDemoBudget + reconcileDemoTokens.
 */
export function recordDemoTokens(input: RecordDemoTokensInput): void {
	const now = input.now ?? Date.now;
	const usdPerMillion = input.usdPerMillion ?? DEMO_USD_PER_MILLION_TOKENS_DEFAULT;
	adjustDemoUsage(input.db, input.tokens, microUsdFor(input.tokens, usdPerMillion), now);
}

export interface DemoUsageQueryInput {
	db: DB;
	now?: () => number;
}

export interface DemoUsage {
	tokens: number;
	costMicroUsd: number;
}

/** Today's accumulated tokens + cost. Returns zeros if no activity. */
export function getDemoUsageToday(input: DemoUsageQueryInput): DemoUsage {
	const now = input.now ?? Date.now;
	const dateUtc = utcDate(now);

	const row = input.db
		.select()
		.from(schema.demoUsage)
		.where(eq(schema.demoUsage.dateUtc, dateUtc))
		.get();

	return {
		tokens: row?.tokens ?? 0,
		costMicroUsd: row?.costMicroUsd ?? 0
	};
}

export interface BudgetCheckInput extends DemoUsageQueryInput {
	capTokens: number;
}

/**
 * True when today's tokens are still under the cap. Cheap read-only
 * check — does NOT debit. The route layer should use
 * tryReserveDemoBudget instead to atomically check + pre-charge.
 */
export function withinDemoBudget(input: BudgetCheckInput): boolean {
	return getDemoUsageToday(input).tokens < input.capTokens;
}

export interface ReserveBudgetInput {
	db: DB;
	capTokens: number;
	estimateTokens: number;
	now?: () => number;
	usdPerMillion?: number;
}

export type ReserveResult =
	| { reserved: true; usageAfter: DemoUsage }
	| { reserved: false; usageNow: DemoUsage };

/**
 * Pre-charge an estimate atomically. Does check + debit in a single
 * SQLite transaction so two parallel demo creations can't both pass
 * the cap check and then both write past the limit.
 *
 * Cap is inclusive: usage + estimate <= capTokens reserves; > rejects.
 *
 * Caller must follow up with reconcileDemoTokens once the deliberation
 * finishes, passing the SAME estimateTokens and the actual token count.
 */
export function tryReserveDemoBudget(input: ReserveBudgetInput): ReserveResult {
	const now = input.now ?? Date.now;
	const usdPerMillion = input.usdPerMillion ?? DEMO_USD_PER_MILLION_TOKENS_DEFAULT;

	return input.db.transaction((tx) => {
		const usageNow = getDemoUsageToday({ db: tx, now });
		if (usageNow.tokens + input.estimateTokens > input.capTokens) {
			return { reserved: false, usageNow };
		}
		adjustDemoUsage(
			tx,
			input.estimateTokens,
			microUsdFor(input.estimateTokens, usdPerMillion),
			now
		);
		return {
			reserved: true,
			usageAfter: {
				tokens: usageNow.tokens + input.estimateTokens,
				costMicroUsd: usageNow.costMicroUsd + microUsdFor(input.estimateTokens, usdPerMillion)
			}
		};
	});
}

export interface ReconcileInput {
	db: DB;
	estimateTokens: number;
	actualTokens: number;
	now?: () => number;
	usdPerMillion?: number;
}

/**
 * Apply (actual - estimate) to today's row. Negative deltas refund the
 * overcharge from a generous estimate; positive deltas catch up when
 * the deliberation ran longer than budgeted.
 */
export function reconcileDemoTokens(input: ReconcileInput): void {
	const tokensDelta = input.actualTokens - input.estimateTokens;
	if (tokensDelta === 0) return;

	const now = input.now ?? Date.now;
	const usdPerMillion = input.usdPerMillion ?? DEMO_USD_PER_MILLION_TOKENS_DEFAULT;
	const costMicroDelta = microUsdFor(tokensDelta, usdPerMillion);
	adjustDemoUsage(input.db, tokensDelta, costMicroDelta, now);
}

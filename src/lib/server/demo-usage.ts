// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, sql } from 'drizzle-orm';
import * as schema from './db/schema';

type Db = BunSQLiteDatabase<typeof schema>;

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

export interface RecordDemoTokensInput {
	db: Db;
	tokens: number;
	now?: () => number;
	/** Override $/M tokens (default {@link DEMO_USD_PER_MILLION_TOKENS_DEFAULT}). */
	usdPerMillion?: number;
}

/**
 * Add `tokens` to today's running total. Inserts a fresh row at
 * midnight UTC; otherwise accumulates. Cost estimate is recorded
 * for observability — the enforced cap (see withinDemoBudget) is
 * on tokens.
 */
export function recordDemoTokens(input: RecordDemoTokensInput): void {
	const { db, tokens } = input;
	const now = input.now ?? Date.now;
	const usdPerMillion = input.usdPerMillion ?? DEMO_USD_PER_MILLION_TOKENS_DEFAULT;

	const dateUtc = utcDate(now);
	const costMicroUsd = Math.round(((tokens * usdPerMillion) / 1_000_000) * 1_000_000);

	// SQLite UPSERT: if the row exists, add to its counters; else insert.
	db.insert(schema.demoUsage)
		.values({ dateUtc, tokens, costMicroUsd, updatedAt: now() })
		.onConflictDoUpdate({
			target: schema.demoUsage.dateUtc,
			set: {
				tokens: sql`${schema.demoUsage.tokens} + ${tokens}`,
				costMicroUsd: sql`${schema.demoUsage.costMicroUsd} + ${costMicroUsd}`,
				updatedAt: now()
			}
		})
		.run();
}

export interface DemoUsageQueryInput {
	db: Db;
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
 * True when today's tokens are still under the cap. The route layer
 * checks this BEFORE creating a demo table — refusing the request if
 * we'd be entering an over-budget day. (We don't refuse mid-stream; a
 * deliberation already in flight gets to finish.)
 */
export function withinDemoBudget(input: BudgetCheckInput): boolean {
	return getDemoUsageToday(input).tokens < input.capTokens;
}

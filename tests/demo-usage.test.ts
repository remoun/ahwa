// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'bun:test';

import * as schema from '../src/lib/server/db/schema';
import {
	DEMO_USD_PER_MILLION_TOKENS_DEFAULT,
	getDemoUsageToday,
	reconcileDemoTokens,
	recordDemoTokens,
	tryReserveDemoBudget,
	withinDemoBudget
} from '../src/lib/server/demo-usage';
import { createTestDb, type TestDb } from './helpers';

describe('demo-usage', () => {
	let db: TestDb;
	const fixedDate = '2026-04-18';
	const clock = () => Date.UTC(2026, 3, 18, 12, 0, 0); // April = month 3

	beforeEach(() => {
		db = createTestDb();
	});

	describe('recordDemoTokens', () => {
		it('inserts a fresh row for today on first call', () => {
			recordDemoTokens({ db, tokens: 1000, now: clock });

			const row = db.select().from(schema.demoUsage).get();
			expect(row).toBeDefined();
			expect(row!.dateUtc).toBe(fixedDate);
			expect(row!.tokens).toBe(1000);
		});

		it('accumulates tokens into the same row across calls on the same day', () => {
			recordDemoTokens({ db, tokens: 1000, now: clock });
			recordDemoTokens({ db, tokens: 500, now: clock });
			recordDemoTokens({ db, tokens: 200, now: clock });

			const rows = db.select().from(schema.demoUsage).all();
			expect(rows).toHaveLength(1);
			expect(rows[0].tokens).toBe(1700);
		});

		it('starts a new row when the UTC date rolls over', () => {
			recordDemoTokens({ db, tokens: 1000, now: () => Date.UTC(2026, 3, 18, 23, 0, 0) });
			recordDemoTokens({ db, tokens: 500, now: () => Date.UTC(2026, 3, 19, 1, 0, 0) });

			const rows = db
				.select()
				.from(schema.demoUsage)
				.all()
				.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
			expect(rows).toHaveLength(2);
			expect(rows[0]).toMatchObject({ dateUtc: '2026-04-18', tokens: 1000 });
			expect(rows[1]).toMatchObject({ dateUtc: '2026-04-19', tokens: 500 });
		});

		it('estimates cost in micro-USD using the default $/M tokens rate', () => {
			recordDemoTokens({ db, tokens: 1_000_000, now: clock });

			const row = db.select().from(schema.demoUsage).get();
			// 1M tokens * $0.75/M (default) = $0.75 = 750_000 micro-USD
			expect(row!.costMicroUsd).toBe(
				Math.round(1_000_000 * (DEMO_USD_PER_MILLION_TOKENS_DEFAULT / 1_000_000) * 1_000_000)
			);
		});

		it('honors AHWA_DEMO_USD_PER_MILLION_TOKENS env override', () => {
			recordDemoTokens({
				db,
				tokens: 1_000_000,
				now: clock,
				usdPerMillion: 2.5
			});

			const row = db.select().from(schema.demoUsage).get();
			// 1M tokens * $2.5/M = $2.50 = 2_500_000 micro-USD
			expect(row!.costMicroUsd).toBe(2_500_000);
		});
	});

	describe('getDemoUsageToday', () => {
		it('returns zero usage when no demo activity today', () => {
			const usage = getDemoUsageToday({ db, now: clock });
			expect(usage.tokens).toBe(0);
			expect(usage.costMicroUsd).toBe(0);
		});

		it("returns today's totals, ignoring other days' rows", () => {
			recordDemoTokens({ db, tokens: 100, now: () => Date.UTC(2026, 3, 17, 12, 0, 0) });
			recordDemoTokens({ db, tokens: 999, now: clock });
			recordDemoTokens({ db, tokens: 1, now: clock });

			const usage = getDemoUsageToday({ db, now: clock });
			expect(usage.tokens).toBe(1000);
		});
	});

	describe('withinDemoBudget', () => {
		it("returns true when today's tokens are below the cap", () => {
			recordDemoTokens({ db, tokens: 500, now: clock });
			expect(withinDemoBudget({ db, capTokens: 1000, now: clock })).toBe(true);
		});

		it("returns false when today's tokens have reached or exceeded the cap", () => {
			recordDemoTokens({ db, tokens: 1000, now: clock });
			expect(withinDemoBudget({ db, capTokens: 1000, now: clock })).toBe(false);

			recordDemoTokens({ db, tokens: 1, now: clock });
			expect(withinDemoBudget({ db, capTokens: 1000, now: clock })).toBe(false);
		});

		it("treats yesterday's tokens as not counting against today", () => {
			recordDemoTokens({ db, tokens: 9_999_999, now: () => Date.UTC(2026, 3, 17, 23, 0, 0) });
			expect(withinDemoBudget({ db, capTokens: 1000, now: clock })).toBe(true);
		});
	});

	describe('tryReserveDemoBudget (pre-charge an estimate atomically)', () => {
		it('reserves and debits the estimate when the cap allows', () => {
			const result = tryReserveDemoBudget({
				db,
				capTokens: 1000,
				estimateTokens: 100,
				now: clock
			});

			expect(result.reserved).toBe(true);
			if (result.reserved) {
				expect(result.usageAfter.tokens).toBe(100);
			}
			// And it actually wrote to the DB
			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(100);
		});

		it('refuses (and writes nothing) when the estimate would push us past the cap', () => {
			recordDemoTokens({ db, tokens: 950, now: clock });

			const result = tryReserveDemoBudget({
				db,
				capTokens: 1000,
				estimateTokens: 100,
				now: clock
			});

			expect(result.reserved).toBe(false);
			if (!result.reserved) {
				expect(result.usageNow.tokens).toBe(950);
			}
			// Confirm no debit happened
			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(950);
		});

		it('rejects exactly at the cap (>, not >=)', () => {
			recordDemoTokens({ db, tokens: 900, now: clock });
			// 900 + 100 = 1000 → exactly at cap → still allowed
			expect(
				tryReserveDemoBudget({ db, capTokens: 1000, estimateTokens: 100, now: clock }).reserved
			).toBe(true);
			// 1000 + 1 = 1001 → over → refused
			expect(
				tryReserveDemoBudget({ db, capTokens: 1000, estimateTokens: 1, now: clock }).reserved
			).toBe(false);
		});

		it('disables the demo entirely when capTokens=0 (regression pin)', () => {
			// Operators set AHWA_DEMO_DAILY_TOKEN_CAP=0 to disable the demo
			// without removing the route. With estimate>0, this MUST refuse —
			// a future refactor of the > to >= would silently allow unlimited.
			expect(
				tryReserveDemoBudget({ db, capTokens: 0, estimateTokens: 5000, now: clock }).reserved
			).toBe(false);
			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(0);
		});

		it('serializes back-to-back reservations (cap-1 estimate twice → one wins)', () => {
			// Cap 200, estimate 150 — two parallel demos can't both fit.
			const a = tryReserveDemoBudget({
				db,
				capTokens: 200,
				estimateTokens: 150,
				now: clock
			});
			const b = tryReserveDemoBudget({
				db,
				capTokens: 200,
				estimateTokens: 150,
				now: clock
			});

			expect(a.reserved).toBe(true);
			expect(b.reserved).toBe(false);
			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(150);
		});
	});

	describe('reconcileDemoTokens (adjust pre-charge to match actuals)', () => {
		it('adds the positive delta when actual > estimate', () => {
			tryReserveDemoBudget({ db, capTokens: 10000, estimateTokens: 5000, now: clock });
			reconcileDemoTokens({ db, estimateTokens: 5000, actualTokens: 7000, now: clock });

			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(7000);
		});

		it('subtracts the negative delta when actual < estimate (refunds the overcharge)', () => {
			tryReserveDemoBudget({ db, capTokens: 10000, estimateTokens: 5000, now: clock });
			reconcileDemoTokens({ db, estimateTokens: 5000, actualTokens: 3000, now: clock });

			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(3000);
		});

		it('is a no-op when actual == estimate', () => {
			tryReserveDemoBudget({ db, capTokens: 10000, estimateTokens: 5000, now: clock });
			reconcileDemoTokens({ db, estimateTokens: 5000, actualTokens: 5000, now: clock });

			expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(5000);
		});
	});
});

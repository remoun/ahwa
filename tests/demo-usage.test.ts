// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import * as schema from '../src/lib/server/db/schema';
import { createTestDb, type TestDb } from './helpers';
import {
	getDemoUsageToday,
	recordDemoTokens,
	withinDemoBudget,
	DEMO_USD_PER_MILLION_TOKENS_DEFAULT
} from '../src/lib/server/demo-usage';

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
});

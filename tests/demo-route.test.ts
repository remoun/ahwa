// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'bun:test';
import * as schema from '../src/lib/server/db/schema';
import { createTestDb, type TestDb } from './helpers';
import { createRateLimiter } from '../src/lib/server/rate-limit';
import { getDemoUsageToday } from '../src/lib/server/demo-usage';
import { createDemoRouteHandler } from '../src/lib/server/demo-route';

function seedDemoCouncil(db: TestDb) {
	db.insert(schema.councils)
		.values({
			id: 'demo',
			name: 'Demo',
			personaIds: [],
			synthesisPrompt: '',
			roundStructure: { rounds: [], synthesize: false }
		})
		.run();
}

function makePost(body: unknown, ip = '1.2.3.4'): Request {
	return new Request('http://localhost/api/demo/tables', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
		body: JSON.stringify(body)
	});
}

describe('demo-route.createDemoRouteHandler', () => {
	let db: TestDb;
	const env = { capTokens: 10000, estimateTokens: 1000 };
	const clock = () => Date.UTC(2026, 3, 18, 12, 0, 0);

	beforeEach(() => {
		db = createTestDb();
		seedDemoCouncil(db);
	});

	function makeHandler(overrides: Partial<{ capTokens: number; estimateTokens: number }> = {}) {
		const rateLimiter = createRateLimiter({ capacity: 5, refillPerSecond: 1, now: clock });
		return createDemoRouteHandler({
			getDb: () => db,
			env: { ...env, ...overrides },
			rateLimiter,
			now: clock
		});
	}

	it('happy path: 201 with { tableId, partyId, token } and pre-charges the budget', async () => {
		const handler = makeHandler();
		const res = await handler(makePost({ dilemma: 'Should I switch jobs?' }));

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.tableId).toBeTruthy();
		expect(body.partyId).toBeTruthy();
		expect(body.token).toBeTruthy();

		// Table exists with is_demo=1
		const tables = db.select().from(schema.tables).all();
		expect(tables).toHaveLength(1);
		expect(tables[0].isDemo).toBe(1);

		// Estimate was debited
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(env.estimateTokens);
	});

	it('429 when the IP exceeds the rate limit', async () => {
		const handler = makeHandler();
		// Capacity is 5 (from makeHandler)
		for (let i = 0; i < 5; i++) {
			expect((await handler(makePost({ dilemma: `t${i}` }, '7.7.7.7'))).status).toBe(201);
		}
		const sixth = await handler(makePost({ dilemma: 'too many' }, '7.7.7.7'));
		expect(sixth.status).toBe(429);
	});

	it('503 when the daily token cap would be exceeded', async () => {
		const handler = makeHandler({ capTokens: 1500 });
		// First demo reserves 1000 of 1500 — fits
		expect((await handler(makePost({ dilemma: 'a' }))).status).toBe(201);
		// Second would push to 2000 > 1500 — refused
		const second = await handler(makePost({ dilemma: 'b' }));
		expect(second.status).toBe(503);
	});

	it('400 when dilemma is missing or empty (and refunds the pre-charge)', async () => {
		const handler = makeHandler();
		const res = await handler(makePost({ dilemma: '' }));

		expect(res.status).toBe(400);
		// No table created
		expect(db.select().from(schema.tables).all()).toHaveLength(0);
		// Pre-charge was refunded — back to zero usage
		expect(getDemoUsageToday({ db, now: clock }).tokens).toBe(0);
	});

	it('still consumes a rate-limit token on a 400 (anti-abuse pin)', async () => {
		// Bad-input probes shouldn't get free retries — burning the bucket
		// slot is intentional. Pinned so a future "refund on validation
		// error" change is an explicit decision, not an accident.
		const handler = makeHandler();

		// Exhaust the bucket with bad probes from one IP
		for (let i = 0; i < 5; i++) {
			expect((await handler(makePost({ dilemma: '' }, '9.9.9.9'))).status).toBe(400);
		}
		// Sixth request from same IP, even with valid input, gets rate-limited
		expect((await handler(makePost({ dilemma: 'real' }, '9.9.9.9'))).status).toBe(429);
	});

	it('400 when JSON body is malformed (and refunds nothing — no pre-charge yet)', async () => {
		const handler = makeHandler();
		const malformed = new Request('http://localhost/api/demo/tables', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
			body: 'not json'
		});

		const res = await handler(malformed);
		expect(res.status).toBe(400);
	});

	it('isolates rate-limit buckets per IP (alice exhausting does not block bob)', async () => {
		const handler = makeHandler();
		// Use up alice's bucket
		for (let i = 0; i < 5; i++) {
			await handler(makePost({ dilemma: `t${i}` }, '1.1.1.1'));
		}
		expect((await handler(makePost({ dilemma: 'over' }, '1.1.1.1'))).status).toBe(429);
		// Bob still has tokens
		expect((await handler(makePost({ dilemma: 'fresh' }, '2.2.2.2'))).status).toBe(201);
	});

	it('falls back to "unknown" for IP when X-Forwarded-For is missing', async () => {
		// All requests without XFF share the "unknown" bucket — protection
		// against a misconfigured proxy hiding everyone behind one key.
		const handler = makeHandler();
		const noIp = new Request('http://localhost/api/demo/tables', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ dilemma: 'test' })
		});
		const res = await handler(noIp);
		expect(res.status).toBe(201);
		// No exception raised; bucket assigned
	});
});

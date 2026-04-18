// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';
import type { SseEvent } from '../schemas/events';
import { reconcileDemoTokens } from './demo-usage';

type Db = BunSQLiteDatabase<typeof schema>;

export interface ReconcileWrapperContext {
	db: Db;
	isDemo: boolean;
	estimateTokens: number;
	now?: () => number;
	usdPerMillion?: number;
}

/**
 * Pass-through stream wrapper. Emits every event from `source`
 * unchanged; on the first `table_closed` event of a demo deliberation
 * with a totalTokens count, applies the (actual - estimate) delta to
 * today's demo bookkeeping.
 *
 * Skipped when:
 * - isDemo === false (owned tables don't bill the demo cap)
 * - totalTokens is undefined (mock or provider without usage info — we
 *   keep the pre-charge rather than guess)
 *
 * Reconciles at most once per stream so a misbehaving generator that
 * emits two table_closed events doesn't double-bill.
 */
export async function* withDemoReconcile(
	source: AsyncGenerator<SseEvent>,
	ctx: ReconcileWrapperContext
): AsyncGenerator<SseEvent> {
	let reconciled = false;
	for await (const event of source) {
		yield event;
		if (
			!reconciled &&
			event.type === 'table_closed' &&
			ctx.isDemo &&
			typeof event.totalTokens === 'number'
		) {
			reconciled = true;
			reconcileDemoTokens({
				db: ctx.db,
				estimateTokens: ctx.estimateTokens,
				actualTokens: event.totalTokens,
				now: ctx.now,
				usdPerMillion: ctx.usdPerMillion
			});
		}
	}
}

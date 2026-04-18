// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DB } from './db';
import type { SseEvent } from '../schemas/events';
import { reconcileDemoTokens } from './demo-usage';


export interface ReconcileWrapperContext {
	db: DB;
	isDemo: boolean;
	estimateTokens: number;
	now?: () => number;
	usdPerMillion?: number;
}

/**
 * Pass-through stream wrapper. Emits every event from `source` unchanged
 * and reconciles the demo budget when the source ends.
 *
 * Three end states, three behaviors:
 *
 *   1. `table_closed` with totalTokens — reconcile to (actual − estimate).
 *      Reconcile fires BEFORE the event is yielded so a downstream consumer
 *      that disconnects the moment they see the close doesn't strand the
 *      bookkeeping.
 *
 *   2. `table_closed` without totalTokens (mock or provider that doesn't
 *      surface usage) — keep the pre-charge as-is. Conservative: rather
 *      than guess, we treat the deliberation as having cost the estimate.
 *      Avoids silently under-counting when usage info is missing.
 *
 *   3. Source ends WITHOUT a table_closed — threw (LLM error, schema
 *      mismatch), aborted (signal), or returned early. Refund the full
 *      pre-charge via actualTokens=0. Without this the daily cap silently
 *      bleeds on every failed demo.
 *
 * All three paths are isDemo-gated — owned tables don't bill the demo cap.
 * Idempotent via `state` so a double-close (or a throw after a close)
 * doesn't double-bill.
 */
export async function* withDemoReconcile(
	source: AsyncGenerator<SseEvent>,
	ctx: ReconcileWrapperContext
): AsyncGenerator<SseEvent> {
	let state: 'pending' | 'closed' | 'reconciled' = 'pending';
	const reconcile = (actualTokens: number) => {
		if (state === 'reconciled' || !ctx.isDemo) return;
		state = 'reconciled';
		reconcileDemoTokens({
			db: ctx.db,
			estimateTokens: ctx.estimateTokens,
			actualTokens,
			now: ctx.now,
			usdPerMillion: ctx.usdPerMillion
		});
	};

	try {
		for await (const event of source) {
			if (event.type === 'table_closed') {
				if (typeof event.totalTokens === 'number') {
					reconcile(event.totalTokens);
				} else {
					// Saw close but no usage — keep pre-charge, don't refund.
					state = 'closed';
				}
			}
			yield event;
		}
	} finally {
		// Source threw, aborted, or returned without yielding table_closed.
		// Refund the full pre-charge — actual cost is unknown but bounded
		// below by zero, and over-charging silently drains the cap.
		if (state === 'pending') {
			reconcile(0);
		}
	}
}

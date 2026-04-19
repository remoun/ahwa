// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-memory per-table event bus. Every page open at /t/[id] subscribes;
 * the deliberation orchestrator + mutation handlers publish. Subscribers
 * receive an async iterable of events and unsubscribe by aborting.
 *
 * Process-local on purpose. Multi-process deployments would replace this
 * with a Redis pub/sub or postgres LISTEN/NOTIFY layer behind the same
 * subscribe()/publish() interface — ahwa is single-process today.
 *
 * Filter is per-subscriber so the bus stays simple: it broadcasts every
 * event to every subscriber and the subscribe() callback decides what
 * to forward to the client.
 */
import type { TableBusEvent } from '../schemas/events';

interface Subscriber {
	push: (event: TableBusEvent) => void;
}

const subscribersByTable = new Map<string, Set<Subscriber>>();

export interface SubscribeOptions {
	tableId: string;
	signal: AbortSignal;
}

/**
 * Subscribe to a table's event bus. Returns an async iterable of events
 * that yields until the signal aborts. Backpressure is bounded by an
 * internal queue per subscriber — under runaway publish-without-consume
 * the queue grows without limit; that's acceptable since publishers are
 * orchestrator + handler calls (bounded), not external input.
 */
export function subscribe(opts: SubscribeOptions): AsyncIterable<TableBusEvent> {
	const queue: TableBusEvent[] = [];
	let resolveNext: (() => void) | null = null;

	const subscriber: Subscriber = {
		push(event) {
			queue.push(event);
			if (resolveNext) {
				const r = resolveNext;
				resolveNext = null;
				r();
			}
		}
	};

	const set = subscribersByTable.get(opts.tableId) ?? new Set();
	set.add(subscriber);
	subscribersByTable.set(opts.tableId, set);

	const cleanup = () => {
		set.delete(subscriber);
		if (set.size === 0) subscribersByTable.delete(opts.tableId);
		if (resolveNext) {
			const r = resolveNext;
			resolveNext = null;
			r();
		}
	};
	opts.signal.addEventListener('abort', cleanup, { once: true });

	return {
		async *[Symbol.asyncIterator]() {
			try {
				while (!opts.signal.aborted) {
					if (queue.length > 0) {
						yield queue.shift()!;
					} else {
						await new Promise<void>((resolve) => {
							resolveNext = resolve;
						});
					}
				}
			} finally {
				cleanup();
			}
		}
	};
}

/** Broadcast an event to every subscriber of a table. */
export function publish(tableId: string, event: TableBusEvent): void {
	const set = subscribersByTable.get(tableId);
	if (!set) return;
	for (const sub of set) sub.push(event);
}

/** Test helper — drop all subscribers (use in afterEach). */
export function _resetBus(): void {
	subscribersByTable.clear();
}

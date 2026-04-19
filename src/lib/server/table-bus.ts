// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-memory per-table event bus. Every page open at /t/[id] subscribes;
 * the deliberation orchestrator + mutation handlers publish. Subscribers
 * receive an async iterable of events and unsubscribe by aborting.
 *
 * Process-local on purpose. Multi-process deployments would replace
 * this with a Redis pub/sub or postgres LISTEN/NOTIFY layer behind the
 * same `TableBus` interface — ahwa is single-process today.
 *
 * Filtering is per-subscriber so the bus stays simple: it broadcasts
 * every event to every subscriber and the SSE handler decides what
 * to forward to the client.
 */
import type { TableBusEvent } from '../schemas/events';

interface Subscriber {
	push: (event: TableBusEvent) => void;
}

export interface SubscribeOptions {
	tableId: string;
	signal: AbortSignal;
}

/**
 * Per-table publish/subscribe. Construct a fresh instance for tests
 * (no module-level state to reset); use the `tableBus` singleton for
 * production code.
 *
 * Backpressure is bounded by an internal queue per subscriber. Under
 * runaway publish-without-consume the queue grows without limit;
 * that's acceptable since publishers are orchestrator + handler
 * calls (bounded), not external input.
 */
export class TableBus {
	private subscribersByTable = new Map<string, Set<Subscriber>>();

	subscribe(opts: SubscribeOptions): AsyncIterable<TableBusEvent> {
		const queue: TableBusEvent[] = [];
		let resolveNext: (() => void) | null = null;

		const subscriber: Subscriber = {
			push: (event) => {
				queue.push(event);
				if (resolveNext) {
					const r = resolveNext;
					resolveNext = null;
					r();
				}
			}
		};

		const set = this.subscribersByTable.get(opts.tableId) ?? new Set();
		set.add(subscriber);
		this.subscribersByTable.set(opts.tableId, set);

		const cleanup = () => {
			set.delete(subscriber);
			if (set.size === 0) this.subscribersByTable.delete(opts.tableId);
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
	publish(tableId: string, event: TableBusEvent): void {
		const set = this.subscribersByTable.get(tableId);
		if (!set) return;
		for (const sub of set) sub.push(event);
	}

	/** Total subscribers across all tables. Useful for diagnostics + tests. */
	count(): number {
		let n = 0;
		for (const set of this.subscribersByTable.values()) n += set.size;
		return n;
	}
}

/**
 * Process-level bus singleton. Subscribers and publishers must share
 * one instance to see each other's events, and SvelteKit routes share
 * a process — so there's exactly one bus per server. Routes wire this
 * into handler factories via the `bus` dep; tests construct fresh
 * `TableBus` instances directly. The type-level decoupling stays
 * useful even when production cardinality is fixed at one.
 */
export const tableBus = new TableBus();

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Graceful-shutdown coordinator. Deployments (Fly, YNH, Docker) send
 * SIGTERM and expect the process to exit; without coordination we'd
 * mid-stream-cancel every running deliberation, leaving rows stuck
 * in `runStatus = 'running'` and burning whatever tokens were already
 * spent on the in-flight LLM calls.
 *
 * The shape:
 *   - Routes that start long-lived work (the SSE deliberation
 *     endpoint) call `track()` to register an AbortController and
 *     `untrack()` when their work finishes.
 *   - On SIGTERM/SIGINT, hooks.server.ts calls `drain(gracePeriodMs)`
 *     which polls until in-flight reaches zero (clean shutdown) OR
 *     the grace period expires (then aborts everything so the per-
 *     party errorMessage path runs and exits).
 *   - New requests can ask `shouldRefuseNew()` to bounce themselves
 *     with a 503 once shutdown has begun.
 *
 * This is process-local on purpose; multi-process deploys would need
 * a per-process coordinator each, plus the platform's own draining
 * (e.g. Fly's request-pause-during-deploy) above it.
 */
export class ShutdownCoordinator {
	private inFlight = new Set<AbortController>();
	private shuttingDown = false;

	/** Register an AbortController for an in-flight long-lived request. */
	track(): AbortController {
		const ctrl = new AbortController();
		this.inFlight.add(ctrl);
		return ctrl;
	}

	/** Mark a tracked controller's work as finished (success or failure). */
	untrack(ctrl: AbortController): void {
		this.inFlight.delete(ctrl);
	}

	/** True after drain() has been called — routes should refuse new starts. */
	shouldRefuseNew(): boolean {
		return this.shuttingDown;
	}

	/** Count of in-flight tracked requests. */
	count(): number {
		return this.inFlight.size;
	}

	/**
	 * Wait for in-flight to reach zero, capped at gracePeriodMs. After
	 * the cap, abort all remaining controllers so their error paths
	 * persist a final state, then resolve. The grace window is the
	 * "let real LLM calls finish" budget; the post-cap abort is the
	 * "we have to exit eventually" failsafe.
	 *
	 * `sleep` and `now` are injectable for tests so we don't real-wait.
	 */
	async drain(opts: {
		gracePeriodMs: number;
		pollMs?: number;
		sleep?: (ms: number) => Promise<void>;
		now?: () => number;
	}): Promise<{ exited: 'clean' | 'aborted'; remaining: number }> {
		this.shuttingDown = true;
		const sleep = opts.sleep ?? defaultSleep;
		const now = opts.now ?? Date.now;
		const pollMs = opts.pollMs ?? 100;
		const start = now();

		while (this.inFlight.size > 0 && now() - start < opts.gracePeriodMs) {
			await sleep(pollMs);
		}

		if (this.inFlight.size === 0) {
			return { exited: 'clean', remaining: 0 };
		}

		// Grace expired — abort everything so their cleanup paths run.
		const remaining = this.inFlight.size;
		for (const ctrl of this.inFlight) ctrl.abort();
		// Give the abort handlers a beat to land their DB writes.
		await sleep(pollMs);
		return { exited: 'aborted', remaining };
	}
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process-singleton coordinator. Routes import this directly; tests
 * construct their own ShutdownCoordinator.
 */
export const shutdownCoordinator = new ShutdownCoordinator();

/**
 * Wire SIGTERM/SIGINT to drain → exit. Call once at server start
 * from hooks.server.ts. Idempotent.
 */
let shutdownHandlerRegistered = false;
export function registerShutdownHandler(opts: { gracePeriodMs?: number } = {}): void {
	if (shutdownHandlerRegistered) return;
	shutdownHandlerRegistered = true;

	const gracePeriodMs = opts.gracePeriodMs ?? defaultGracePeriodMs();
	const handle = (signal: NodeJS.Signals) => {
		void onShutdown(signal, gracePeriodMs);
	};
	process.on('SIGTERM', handle);
	process.on('SIGINT', handle);
}

function defaultGracePeriodMs(): number {
	const fromEnv = process.env.AHWA_SHUTDOWN_GRACE_MS;
	if (fromEnv) {
		const n = parseInt(fromEnv, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	// 60s is generous enough for a typical mid-deliberation call to
	// finish (~10-30s) without making deploys feel sticky.
	return 60_000;
}

async function onShutdown(signal: NodeJS.Signals, gracePeriodMs: number): Promise<void> {
	if (shutdownCoordinator.shouldRefuseNew()) return; // double-signal
	console.log(
		`shutdown: ${signal} received, ${shutdownCoordinator.count()} in-flight; draining (grace=${gracePeriodMs}ms)`
	);
	const result = await shutdownCoordinator.drain({ gracePeriodMs });
	if (result.exited === 'clean') {
		console.log('shutdown: drained cleanly');
		process.exit(0);
	} else {
		console.warn(`shutdown: ${result.remaining} still in-flight at grace cap; aborted and exiting`);
		process.exit(1);
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import { cleanupExpiredDemoTables } from '$lib/server/demo-cleanup';
import { createIdentityHandle, readIdentityEnv } from '$lib/server/identity';

// Resolve once at module load — env doesn't change between requests, and
// the result of readIdentityEnv is a tiny config object.
const identityEnv = readIdentityEnv(process.env);

export const handle = createIdentityHandle({ getDb, env: identityEnv });

// ---------------------------------------------------------------------
// Demo TTL sweep — runs once per process at startup.
// ---------------------------------------------------------------------
// Lives here (not in /api/demo/tables/+server.ts) so it boots with the
// process rather than lazily on the first demo POST. The inFlight guard
// stops overlapping sweeps from stacking if a long DB lock makes one
// run take longer than the interval. Quiet failure (log + continue):
// the next tick retries, and a transient DB error doesn't bring down
// the whole server.
const TTL_HOURS = parseInt(process.env.AHWA_DEMO_TTL_HOURS ?? '24', 10);
const SWEEP_MS = parseInt(process.env.AHWA_DEMO_SWEEP_MS ?? `${60 * 60 * 1000}`, 10);
let cleanupInFlight = false;
setInterval(() => {
	if (cleanupInFlight) return;
	cleanupInFlight = true;
	try {
		const removed = cleanupExpiredDemoTables({ db: getDb(), ttlHours: TTL_HOURS });
		if (removed > 0) console.log(`demo: cleaned up ${removed} expired table(s)`);
	} catch (err) {
		console.error('demo: cleanup failed', err);
	} finally {
		cleanupInFlight = false;
	}
}, SWEEP_MS);

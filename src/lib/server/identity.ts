// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DB } from './db';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from './db/schema';

/**
 * Identity resolution config. trustIdentity is opt-in (defaults off) so a
 * misconfigured reverse proxy can't make spoofed user headers honored. The
 * YNH-shipped systemd unit sets it on; every other deployment leaves it
 * off unless an operator explicitly enables it.
 */
export interface IdentityEnv {
	trustIdentity: boolean;
	headerName: string;
}

/**
 * Read identity config from a Record-shaped environment (typically
 * process.env). Defaults are deliberately strict: trust off, header
 * name x-remote-user. Operators opt in via AHWA_TRUST_IDENTITY=1.
 */
export function readIdentityEnv(env: Record<string, string | undefined>): IdentityEnv {
	const flag = env.AHWA_TRUST_IDENTITY?.toLowerCase();
	return {
		trustIdentity: flag === '1' || flag === 'true',
		headerName: env.AHWA_IDENTITY_HEADER ?? 'x-remote-user'
	};
}

export interface IdentityDeps {
	db: DB;
	env: IdentityEnv;
}

export interface ResolvedParty {
	id: string;
	displayName: string | null;
	externalId: string | null;
}

/**
 * Resolve the calling user's party from request headers + env config.
 * Get-or-create: same external user always resolves to the same party
 * row across requests; the legacy "me" party is a singleton.
 */
export function getPartyFromRequest(request: Request, deps: IdentityDeps): ResolvedParty {
	const { db, env } = deps;

	if (env.trustIdentity) {
		const externalId = request.headers.get(env.headerName)?.trim();
		if (externalId) {
			return getOrCreateExternalParty(db, externalId);
		}
	}

	return getOrCreateMeParty(db);
}

function getOrCreateExternalParty(db: DB, externalId: string): ResolvedParty {
	return getOrCreateParty(db, eq(schema.parties.externalId, externalId), {
		displayName: externalId,
		externalId
	});
}

function getOrCreateMeParty(db: DB): ResolvedParty {
	return getOrCreateParty(
		db,
		and(eq(schema.parties.displayName, 'me'), isNull(schema.parties.externalId))!,
		{ displayName: 'me', externalId: null }
	);
}

function getOrCreateParty(
	db: DB,
	match: SQL,
	insert: { displayName: string; externalId: string | null }
): ResolvedParty {
	const existing = db.select().from(schema.parties).where(match).get();
	if (existing) return existing;

	const id = nanoid();
	db.insert(schema.parties)
		.values({ id, ...insert })
		.run();
	return { id, ...insert };
}

/**
 * Build a SvelteKit `handle` that resolves the calling party once per
 * request and attaches it to `event.locals.party`. Call sites read from
 * locals instead of re-resolving (and instead of the old pattern of
 * minting a fresh "me" party per API call).
 *
 * Factored as a factory so it's testable with a mock DB; the production
 * hook in src/hooks.server.ts wires it to the singleton DB + process.env.
 */
export function createIdentityHandle(opts: { getDb: () => DB; env: IdentityEnv }) {
	return async ({
		event,
		resolve
	}: {
		event: { request: Request; locals: { party?: ResolvedParty } };
		resolve: (event: unknown) => Response | Promise<Response>;
	}): Promise<Response> => {
		event.locals.party = getPartyFromRequest(event.request, { db: opts.getDb(), env: opts.env });
		return resolve(event);
	};
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from './db/schema';

type Db = BunSQLiteDatabase<typeof schema>;

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
	db: Db;
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

function getOrCreateExternalParty(db: IdentityDeps['db'], externalId: string): ResolvedParty {
	const existing = db
		.select()
		.from(schema.parties)
		.where(eq(schema.parties.externalId, externalId))
		.get();
	if (existing) return toResolved(existing);

	const id = nanoid();
	db.insert(schema.parties).values({ id, displayName: externalId, externalId }).run();
	return { id, displayName: externalId, externalId };
}

function getOrCreateMeParty(db: IdentityDeps['db']): ResolvedParty {
	const existing = db
		.select()
		.from(schema.parties)
		.where(and(eq(schema.parties.displayName, 'me'), isNull(schema.parties.externalId)))
		.get();
	if (existing) return toResolved(existing);

	const id = nanoid();
	db.insert(schema.parties).values({ id, displayName: 'me', externalId: null }).run();
	return { id, displayName: 'me', externalId: null };
}

function toResolved(row: { id: string; displayName: string | null; externalId: string | null }) {
	return { id: row.id, displayName: row.displayName, externalId: row.externalId };
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
export function createIdentityHandle(deps: IdentityDeps) {
	return async ({
		event,
		resolve
	}: {
		event: { request: Request; locals: { party?: ResolvedParty } };
		resolve: (event: unknown) => Response | Promise<Response>;
	}): Promise<Response> => {
		event.locals.party = getPartyFromRequest(event.request, deps);
		return resolve(event);
	};
}

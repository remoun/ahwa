// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Invariant #5: share links are `/t/{table_id}?party={party_id}&token={hmac}`.
 * The token is an HMAC-SHA256 of `{tableId}:{partyId}` keyed on a server
 * secret — forged combinations are rejected at the guard layer.
 *
 * For M1 localhost-only, the presence of a valid token is belt-and-suspenders
 * (no public access to bypass anyway). M2+ public demo and M3 two-party
 * share links depend on this mechanism.
 */

function getSecret(): string {
	const s = process.env.AHWA_SHARE_SECRET;
	if (s && s.length >= 32) return s;
	// Fall back to an ephemeral secret generated once per process. This
	// means tokens from a previous run are invalidated on restart — fine
	// for M1 localhost. Operators should set AHWA_SHARE_SECRET in prod.
	if (!ephemeralSecret) {
		ephemeralSecret = randomBytes(32).toString('hex');
		console.warn(
			'share: AHWA_SHARE_SECRET not set; using an ephemeral per-process secret. Tokens will invalidate on restart.'
		);
	}
	return ephemeralSecret;
}

let ephemeralSecret: string | undefined;

/** Generate an HMAC-SHA256 token for (tableId, partyId). */
export function signShareToken(tableId: string, partyId: string): string {
	return createHmac('sha256', getSecret()).update(`${tableId}:${partyId}`).digest('hex');
}

/** Constant-time verification that a token matches (tableId, partyId). */
export function verifyShareToken(tableId: string, partyId: string, token: string): boolean {
	if (!token || token.length !== 64) return false;
	const expected = signShareToken(tableId, partyId);
	// Node's timingSafeEqual requires equal-length buffers. Length check
	// above plus length mismatch below both return false without leaking.
	const a = Buffer.from(expected);
	const b = Buffer.from(token);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

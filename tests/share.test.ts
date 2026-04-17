// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { signShareToken, verifyShareToken } from '../src/lib/server/share';

describe('share tokens', () => {
	// Pin a fixed secret so the tests aren't affected by the ephemeral fallback
	const originalSecret = process.env.AHWA_SHARE_SECRET;

	beforeAll(() => {
		process.env.AHWA_SHARE_SECRET = 'x'.repeat(64);
	});

	afterAll(() => {
		if (originalSecret !== undefined) process.env.AHWA_SHARE_SECRET = originalSecret;
		else delete process.env.AHWA_SHARE_SECRET;
	});

	it('produces a 64-char hex token', () => {
		const token = signShareToken('tbl-1', 'party-1');
		expect(token).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is deterministic for the same inputs', () => {
		expect(signShareToken('tbl-1', 'party-1')).toBe(signShareToken('tbl-1', 'party-1'));
	});

	it('differs for different tables', () => {
		expect(signShareToken('tbl-1', 'party-1')).not.toBe(signShareToken('tbl-2', 'party-1'));
	});

	it('differs for different parties', () => {
		expect(signShareToken('tbl-1', 'party-1')).not.toBe(signShareToken('tbl-1', 'party-2'));
	});

	it('verifies correctly signed tokens', () => {
		const token = signShareToken('tbl-1', 'party-1');
		expect(verifyShareToken('tbl-1', 'party-1', token)).toBe(true);
	});

	it('rejects a token for a different table', () => {
		const token = signShareToken('tbl-1', 'party-1');
		expect(verifyShareToken('tbl-2', 'party-1', token)).toBe(false);
	});

	it('rejects a token for a different party', () => {
		const token = signShareToken('tbl-1', 'party-1');
		expect(verifyShareToken('tbl-1', 'party-2', token)).toBe(false);
	});

	it('rejects an empty token', () => {
		expect(verifyShareToken('tbl-1', 'party-1', '')).toBe(false);
	});

	it('rejects a token of wrong length', () => {
		expect(verifyShareToken('tbl-1', 'party-1', 'abc')).toBe(false);
	});

	it('rejects a tampered token', () => {
		const token = signShareToken('tbl-1', 'party-1');
		const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
		expect(verifyShareToken('tbl-1', 'party-1', tampered)).toBe(false);
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { errorMessage, jsonOrNull } from '../src/lib/util';

describe('errorMessage', () => {
	it('returns the .message of an Error', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	it('coerces strings', () => {
		expect(errorMessage('oops')).toBe('oops');
	});

	it('coerces non-Error objects via String()', () => {
		expect(errorMessage({ toString: () => 'custom' })).toBe('custom');
	});

	it('coerces undefined and null', () => {
		expect(errorMessage(undefined)).toBe('undefined');
		expect(errorMessage(null)).toBe('null');
	});
});

describe('jsonOrNull', () => {
	it('stringifies objects', () => {
		expect(jsonOrNull({ a: 1 })).toBe('{"a":1}');
	});

	it('stringifies arrays', () => {
		expect(jsonOrNull(['a', 'b'])).toBe('["a","b"]');
	});

	it('returns null for null', () => {
		expect(jsonOrNull(null)).toBeNull();
	});

	it('returns null for undefined', () => {
		expect(jsonOrNull(undefined)).toBeNull();
	});

	it('stringifies falsy but non-null values', () => {
		expect(jsonOrNull(0)).toBe('0');
		expect(jsonOrNull(false)).toBe('false');
		expect(jsonOrNull('')).toBe('""');
	});
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { parseJson, parseJsonSafe } from '../src/lib/server/parse';

const Schema = z.object({ name: z.string(), count: z.number() });

describe('parseJsonSafe', () => {
	it('returns ok with validated data on success', () => {
		const result = parseJsonSafe('{"name":"a","count":1}', Schema);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({ name: 'a', count: 1 });
		}
	});

	it('returns error on invalid JSON', () => {
		const result = parseJsonSafe('{not json', Schema);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('invalid JSON');
		}
	});

	it('returns error on schema mismatch', () => {
		const result = parseJsonSafe('{"name":"a"}', Schema);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('schema validation failed');
		}
	});

	it('returns error when JSON is array but schema expects object', () => {
		const result = parseJsonSafe('[1,2,3]', Schema);
		expect(result.ok).toBe(false);
	});
});

describe('parseJson', () => {
	it('returns validated data on success', () => {
		expect(parseJson('{"name":"a","count":1}', Schema)).toEqual({ name: 'a', count: 1 });
	});

	it('throws on invalid JSON with context', () => {
		expect(() => parseJson('{not json', Schema, 'my-field')).toThrow(/my-field.*invalid JSON/);
	});

	it('throws on schema mismatch with context', () => {
		expect(() => parseJson('{"name":"a"}', Schema, 'my-field')).toThrow(
			/my-field.*schema validation failed/
		);
	});

	it('uses default context when none provided', () => {
		expect(() => parseJson('{', Schema)).toThrow(/json: invalid JSON/);
	});
});

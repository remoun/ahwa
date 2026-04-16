// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ZodType } from 'zod';

/**
 * Parse a JSON string and validate with a Zod schema. Returns a result
 * object instead of throwing. Use for best-effort parsing where bad data
 * should be logged and skipped (e.g., seed files, user-editable DB rows).
 */
export function parseJsonSafe<T>(
	raw: string,
	schema: ZodType<T>
): { ok: true; data: T } | { ok: false; error: string } {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : err}` };
	}
	const result = schema.safeParse(data);
	if (!result.success) {
		return {
			ok: false,
			error: `schema validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`
		};
	}
	return { ok: true, data: result.data };
}

/**
 * Parse a JSON string and validate with a Zod schema. Throws with a
 * useful message if either step fails. Use for data that MUST be valid
 * (e.g., reading council config from our own DB — corruption should fail
 * loud, not silently).
 */
export function parseJson<T>(raw: string, schema: ZodType<T>, context = 'json'): T {
	const result = parseJsonSafe(raw, schema);
	if (!result.ok) {
		throw new Error(`${context}: ${result.error}`);
	}
	return result.data;
}

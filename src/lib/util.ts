// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Extract a readable message from an unknown thrown value. Real Error
 * objects get their .message; everything else is coerced to a string.
 */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * JSON-stringify a value, or return null for nullish inputs. Useful for
 * DB columns that store JSON strings and allow NULL.
 */
export function jsonOrNull(value: unknown): string | null {
	return value == null ? null : JSON.stringify(value);
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { error as svelteError } from '@sveltejs/kit';

import { errorMessage } from '../util';

/**
 * Wrap a `+page.server.ts` load function so any synchronous or async
 * error logs server-side and surfaces as a 500 with a readable message
 * instead of SvelteKit's bare "undefined" default.
 */
export async function loadOrFail<T>(context: string, fn: () => T | Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		console.error(`${context}: load error:`, err);
		throw svelteError(500, `${context}: ${errorMessage(err)}`);
	}
}

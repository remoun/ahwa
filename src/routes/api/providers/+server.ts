// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { getAvailableProviders, detectDefaultProvider } from '$lib/server/llm';
import type { RequestHandler } from './$types';

/** List available LLM providers and the current default */
export const GET: RequestHandler = async () => {
	return json({
		available: getAvailableProviders(),
		default: detectDefaultProvider()
	});
};

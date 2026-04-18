// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { GET } from '../src/routes/api/me/+server';
import type { ResolvedParty } from '../src/lib/server/identity';

describe('GET /api/me', () => {
	function call(party: ResolvedParty): Promise<Response> {
		// SvelteKit hands handlers a RequestEvent. /api/me only reads locals.party,
		// so we cast a minimal stub.
		return GET({ locals: { party } } as never) as Promise<Response>;
	}

	it('returns the resolved party identity from locals', async () => {
		const party: ResolvedParty = {
			id: 'p_abc',
			displayName: 'package_checker',
			externalId: 'package_checker'
		};
		const response = await call(party);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({
			id: 'p_abc',
			display_name: 'package_checker',
			external_id: 'package_checker'
		});
	});

	it('serialises a "me" party (null external_id) without crashing', async () => {
		const party: ResolvedParty = {
			id: 'p_me',
			displayName: 'me',
			externalId: null
		};
		const response = await call(party);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.external_id).toBeNull();
	});
});

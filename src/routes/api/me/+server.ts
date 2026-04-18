// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/**
 * Return the calling party's identity. Used by the YNH package_check
 * SSO test to assert that SSOwat's Auth-User header was honored end-to-end:
 * a logged-in YNH user gets `external_id == <their YNH login>` here.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { id, displayName, externalId } = locals.party;
	return json({ id, display_name: displayName, external_id: externalId });
};

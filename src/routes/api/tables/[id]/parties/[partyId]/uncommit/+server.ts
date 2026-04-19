// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import { tableBus } from '$lib/server/table-bus';
import { createUncommitHandler } from '$lib/server/uncommit';

import type { RequestHandler } from './$types';

const handle = createUncommitHandler({ getDb, bus: tableBus });

export const POST: RequestHandler = ({ params, url, locals }) =>
	handle({
		tableId: params.id,
		partyId: params.partyId,
		party: locals.party,
		token: url.searchParams.get('token') ?? undefined
	});

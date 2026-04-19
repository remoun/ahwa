// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import { createInviteHandler } from '$lib/server/invite';
import { tableBus } from '$lib/server/table-bus';

import type { RequestHandler } from './$types';

const handle = createInviteHandler({ getDb, bus: tableBus });

export const POST: RequestHandler = ({ params, locals }) =>
	handle({ tableId: params.id, party: locals.party });

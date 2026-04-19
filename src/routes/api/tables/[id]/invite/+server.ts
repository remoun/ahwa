// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import { createInviteHandler } from '$lib/server/invite';

import type { RequestHandler } from './$types';

const handle = createInviteHandler({ getDb });

export const POST: RequestHandler = ({ params, locals }) =>
	handle({ tableId: params.id, party: locals.party });

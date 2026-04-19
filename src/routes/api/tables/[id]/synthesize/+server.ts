// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import { createSynthesizeHandler } from '$lib/server/synthesize';

import type { RequestHandler } from './$types';

const handle = createSynthesizeHandler({ getDb });

export const POST: RequestHandler = ({ params, locals }) =>
	handle({ tableId: params.id, party: locals.party });

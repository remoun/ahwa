// SPDX-License-Identifier: AGPL-3.0-or-later
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
import { CouncilBodySchema, type CouncilBody } from '$lib/schemas/council';
import { councilRow } from '$lib/server/council-row';
import type { RequestHandler } from './$types';

const config = {
	table: schema.councils,
	bodySchema: CouncilBodySchema,
	toValues: (body: CouncilBody, id: string) => ({
		id,
		...councilRow(body),
		ownerParty: 'user' // M1: single user, custom councils owned by 'user'
	}),
	toUpdateValues: councilRow
};

export const GET: RequestHandler = listHandler(config);
export const POST: RequestHandler = createHandler(config);

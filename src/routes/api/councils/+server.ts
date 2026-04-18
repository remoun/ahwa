// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
import { CouncilBodySchema, type CouncilBody } from '$lib/schemas/council';
import type { RequestHandler } from './$types';

// Shared row mapping for create + update — adding a council field stays
// a one-place change.
function councilRow(body: CouncilBody) {
	return {
		name: body.name,
		description: body.description ?? null,
		personaIds: body.personaIds,
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: body.roundStructure,
		modelConfig: body.modelConfig ?? null
	};
}

const config = {
	db,
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

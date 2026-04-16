// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
import { CouncilBodySchema, type CouncilBody } from '$lib/schemas/council';
import { jsonOrNull } from '$lib/util';
import type { RequestHandler } from './$types';

const config = {
	db,
	table: schema.councils,
	bodySchema: CouncilBodySchema,
	toValues: (body: CouncilBody, id: string) => ({
		id,
		name: body.name,
		personaIds: JSON.stringify(body.personaIds),
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: JSON.stringify(body.roundStructure),
		modelConfig: jsonOrNull(body.modelConfig),
		ownerParty: 'user' // M1: single user, custom councils owned by 'user'
	}),
	toUpdateValues: (body: CouncilBody) => ({
		name: body.name,
		personaIds: JSON.stringify(body.personaIds),
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: JSON.stringify(body.roundStructure),
		modelConfig: jsonOrNull(body.modelConfig)
	})
};

export const GET: RequestHandler = listHandler(config);
export const POST: RequestHandler = createHandler(config);

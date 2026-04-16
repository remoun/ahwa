// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
import { PersonaBodySchema, type PersonaBody } from '$lib/schemas/council';
import { jsonOrNull } from '$lib/util';
import type { RequestHandler } from './$types';

const config = {
	db,
	table: schema.personas,
	bodySchema: PersonaBodySchema,
	toValues: (body: PersonaBody, id: string) => ({
		id,
		name: body.name,
		emoji: body.emoji,
		systemPrompt: body.systemPrompt,
		requires: jsonOrNull(body.requires),
		ownerParty: 'user' // M1: single user
	}),
	toUpdateValues: (body: PersonaBody) => ({
		name: body.name,
		emoji: body.emoji,
		systemPrompt: body.systemPrompt,
		requires: jsonOrNull(body.requires)
	})
};

export const GET: RequestHandler = listHandler(config);
export const POST: RequestHandler = createHandler(config);

// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
import { PersonaBodySchema, type PersonaBody } from '$lib/schemas/council';
import type { RequestHandler } from './$types';

function personaRow(body: PersonaBody) {
	return {
		name: body.name,
		emoji: body.emoji,
		systemPrompt: body.systemPrompt,
		requires: body.requires ?? null
	};
}

const config = {
	db,
	table: schema.personas,
	bodySchema: PersonaBodySchema,
	toValues: (body: PersonaBody, id: string) => ({
		id,
		...personaRow(body),
		ownerParty: 'user' // M1: single user
	}),
	toUpdateValues: personaRow
};

export const GET: RequestHandler = listHandler(config);
export const POST: RequestHandler = createHandler(config);

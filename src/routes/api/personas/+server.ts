// SPDX-License-Identifier: AGPL-3.0-or-later
import { type PersonaBody, PersonaBodySchema } from '$lib/schemas/council';
import { createHandler, listHandler } from '$lib/server/crud';
import * as schema from '$lib/server/db/schema';
import { personaRow } from '$lib/server/persona-row';

import type { RequestHandler } from './$types';

const config = {
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

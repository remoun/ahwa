// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { getHandler, updateHandler, deleteHandler } from '$lib/server/crud';
import { PersonaBodySchema } from '$lib/schemas/council';
import { personaRow } from '$lib/server/persona-row';
import type { RequestHandler } from './$types';

const config = {
	table: schema.personas,
	bodySchema: PersonaBodySchema,
	toValues: () => ({}), // not used for get/update/delete
	toUpdateValues: personaRow,
	canDelete: (id: string) => {
		const councils = getDb().select().from(schema.councils).all();
		for (const council of councils) {
			if (council.personaIds?.includes(id)) {
				return `Persona is referenced by council "${council.name}"`;
			}
		}
		return null;
	}
};

export const GET: RequestHandler = getHandler(config);
export const PUT: RequestHandler = updateHandler(config);
export const DELETE: RequestHandler = deleteHandler(config);

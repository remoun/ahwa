// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { getHandler, updateHandler, deleteHandler } from '$lib/server/crud';
import { CouncilBodySchema, type CouncilBody } from '$lib/schemas/council';
import { jsonOrNull } from '$lib/util';
import type { RequestHandler } from './$types';

const config = {
	db,
	table: schema.councils,
	bodySchema: CouncilBodySchema,
	toValues: () => ({}), // not used for get/update/delete
	toUpdateValues: (body: CouncilBody) => ({
		name: body.name,
		description: body.description ?? null,
		personaIds: JSON.stringify(body.personaIds),
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: JSON.stringify(body.roundStructure),
		modelConfig: jsonOrNull(body.modelConfig)
	}),
	canDelete: (id: string) => {
		// Check if any table references this council
		const ref = db.select().from(schema.tables).where(eq(schema.tables.councilId, id)).get();
		return ref ? 'Council is referenced by existing tables' : null;
	}
};

export const GET: RequestHandler = getHandler(config);
export const PUT: RequestHandler = updateHandler(config);
export const DELETE: RequestHandler = deleteHandler(config);

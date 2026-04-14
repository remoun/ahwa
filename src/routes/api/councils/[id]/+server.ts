// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { getHandler, updateHandler, deleteHandler } from '$lib/server/crud';
import { ModelConfigSchema } from '$lib/schemas/council';
import type { RequestHandler } from './$types';

const councilBodySchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	personaIds: z.array(z.string()).min(1),
	synthesisPrompt: z.string().min(1),
	roundStructure: z.object({
		rounds: z.array(z.object({
			kind: z.string(),
			prompt_suffix: z.string()
		})).min(1),
		synthesize: z.boolean()
	}),
	modelConfig: ModelConfigSchema.optional()
});

const config = {
	db,
	table: schema.councils,
	bodySchema: councilBodySchema,
	toValues: () => ({}), // not used for get/update/delete
	toUpdateValues: (body: z.infer<typeof councilBodySchema>) => ({
		name: body.name,
		personaIds: JSON.stringify(body.personaIds),
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: JSON.stringify(body.roundStructure),
		modelConfig: body.modelConfig ? JSON.stringify(body.modelConfig) : null
	}),
	canDelete: (id: string) => {
		// Check if any table references this council
		const ref = db
			.select()
			.from(schema.tables)
			.where(like(schema.tables.councilId, id))
			.get();
		return ref ? 'Council is referenced by existing tables' : null;
	}
};

export const GET: RequestHandler = getHandler(config);
export const PUT: RequestHandler = updateHandler(config);
export const DELETE: RequestHandler = deleteHandler(config);

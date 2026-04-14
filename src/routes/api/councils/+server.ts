// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
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
	toValues: (body: z.infer<typeof councilBodySchema>, id: string) => ({
		id,
		name: body.name,
		personaIds: JSON.stringify(body.personaIds),
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: JSON.stringify(body.roundStructure),
		modelConfig: body.modelConfig ? JSON.stringify(body.modelConfig) : null,
		ownerParty: 'user' // M1: single user, custom councils owned by 'user'
	}),
	toUpdateValues: (body: z.infer<typeof councilBodySchema>) => ({
		name: body.name,
		personaIds: JSON.stringify(body.personaIds),
		synthesisPrompt: body.synthesisPrompt,
		roundStructure: JSON.stringify(body.roundStructure),
		modelConfig: body.modelConfig ? JSON.stringify(body.modelConfig) : null
	})
};

export const GET: RequestHandler = listHandler(config);
export const POST: RequestHandler = createHandler(config);

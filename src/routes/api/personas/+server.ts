// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { listHandler, createHandler } from '$lib/server/crud';
import type { RequestHandler } from './$types';

const personaBodySchema = z.object({
	name: z.string().min(1),
	emoji: z.string().min(1),
	systemPrompt: z.string().min(1),
	requires: z.array(z.string()).optional()
});

const config = {
	db,
	table: schema.personas,
	bodySchema: personaBodySchema,
	toValues: (body: z.infer<typeof personaBodySchema>, id: string) => ({
		id,
		name: body.name,
		emoji: body.emoji,
		systemPrompt: body.systemPrompt,
		requires: body.requires ? JSON.stringify(body.requires) : null,
		ownerParty: 'user' // M1: single user
	}),
	toUpdateValues: (body: z.infer<typeof personaBodySchema>) => ({
		name: body.name,
		emoji: body.emoji,
		systemPrompt: body.systemPrompt,
		requires: body.requires ? JSON.stringify(body.requires) : null
	})
};

export const GET: RequestHandler = listHandler(config);
export const POST: RequestHandler = createHandler(config);

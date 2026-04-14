// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { getHandler, updateHandler, deleteHandler } from '$lib/server/crud';
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
	toValues: () => ({}), // not used for get/update/delete
	toUpdateValues: (body: z.infer<typeof personaBodySchema>) => ({
		name: body.name,
		emoji: body.emoji,
		systemPrompt: body.systemPrompt,
		requires: body.requires ? JSON.stringify(body.requires) : null
	}),
	canDelete: (id: string) => {
		// Check if any council references this persona
		const councils = db.select().from(schema.councils).all();
		for (const council of councils) {
			if (!council.personaIds) continue;
			const ids: string[] = JSON.parse(council.personaIds);
			if (ids.includes(id)) {
				return `Persona is referenced by council "${council.name}"`;
			}
		}
		return null;
	}
};

export const GET: RequestHandler = getHandler(config);
export const PUT: RequestHandler = updateHandler(config);
export const DELETE: RequestHandler = deleteHandler(config);

// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from 'drizzle-orm';

import { CouncilBodySchema } from '$lib/schemas/council';
import { councilRow } from '$lib/server/council-row';
import { deleteHandler, getHandler, updateHandler } from '$lib/server/crud';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

import type { RequestHandler } from './$types';

const config = {
	table: schema.councils,
	bodySchema: CouncilBodySchema,
	toValues: () => ({}), // not used for get/update/delete
	toUpdateValues: councilRow,
	canDelete: (id: string) => {
		const ref = getDb().select().from(schema.tables).where(eq(schema.tables.councilId, id)).get();
		return ref ? 'Council is referenced by existing tables' : null;
	}
};

export const GET: RequestHandler = getHandler(config);
export const PUT: RequestHandler = updateHandler(config);
export const DELETE: RequestHandler = deleteHandler(config);

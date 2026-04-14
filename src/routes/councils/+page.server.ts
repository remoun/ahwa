// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const councils = db.select().from(schema.councils).all();
	const personas = db.select().from(schema.personas).all();

	return {
		councils: councils.map((c) => ({
			...c,
			personaIds: c.personaIds ? JSON.parse(c.personaIds) : [],
			isSeeded: c.ownerParty === null
		})),
		personas
	};
};

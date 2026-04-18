// SPDX-License-Identifier: AGPL-3.0-or-later
import { expandCouncilPersonas } from '$lib/server/councils';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { loadOrFail } from '$lib/server/load';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () =>
	loadOrFail('councils', () => {
		const db = getDb();
		const councils = db
			.select()
			.from(schema.councils)
			.all()
			.filter((c) => !c.id.startsWith('_'));
		const personas = db.select().from(schema.personas).all();

		return {
			councils: councils.map((c) => ({
				...expandCouncilPersonas(c, personas),
				isSeeded: c.ownerParty === null
			})),
			allPersonas: personas
		};
	});

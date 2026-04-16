// SPDX-License-Identifier: AGPL-3.0-or-later
import { db } from '$lib/server/db';
import { loadOrFail } from '$lib/server/load';
import * as schema from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () =>
	loadOrFail('councils', () => {
		const councils = db.select().from(schema.councils).all();
		const personas = db.select().from(schema.personas).all();
		const personaMap = new Map(personas.map((p) => [p.id, p]));

		return {
			councils: councils.map((c) => {
				const ids: string[] = c.personaIds ? JSON.parse(c.personaIds) : [];
				return {
					...c,
					isSeeded: c.ownerParty === null,
					personas: ids.map((id) => personaMap.get(id)).filter((p) => p !== undefined)
				};
			}),
			allPersonas: personas
		};
	});

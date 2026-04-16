// SPDX-License-Identifier: AGPL-3.0-or-later

interface PersonaLike {
	id: string;
	name?: string | null;
	emoji?: string | null;
}

interface CouncilLike {
	personaIds?: string | null;
}

/**
 * Resolve a council's `personaIds` JSON string into the matching persona
 * objects, preserving the order stored on the council and silently
 * dropping ids that no longer match a persona (stale references from
 * a deleted persona, for example).
 */
export function expandCouncilPersonas<C extends CouncilLike, P extends PersonaLike>(
	council: C,
	allPersonas: P[]
): C & { personas: P[] } {
	const byId = new Map(allPersonas.map((p) => [p.id, p]));
	const ids: string[] = council.personaIds ? JSON.parse(council.personaIds) : [];
	const personas = ids.map((id) => byId.get(id)).filter((p): p is P => p !== undefined);
	return { ...council, personas };
}

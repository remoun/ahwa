// SPDX-License-Identifier: AGPL-3.0-or-later

interface PersonaLike {
	id: string;
	name?: string | null;
	emoji?: string | null;
}

interface CouncilLike {
	personaIds?: string[] | null;
}

/**
 * Resolve a council's `personaIds` array into the matching persona
 * objects, preserving the order stored on the council and silently
 * dropping ids that no longer match a persona (stale references from
 * a deleted persona, for example). Drizzle JSON-mode columns deliver
 * the array already parsed.
 */
export function expandCouncilPersonas<C extends CouncilLike, P extends PersonaLike>(
	council: C,
	allPersonas: P[]
): C & { personas: P[] } {
	const byId = new Map(allPersonas.map((p) => [p.id, p]));
	const ids = council.personaIds ?? [];
	const personas = ids.map((id) => byId.get(id)).filter((p): p is P => !!p);
	return { ...council, personas };
}

interface TurnLike {
	personaName: string | null;
}

interface PersonaMetaSource {
	name?: string | null;
	emoji?: string | null;
	description?: string | null;
}

/**
 * Attach each turn's persona emoji + description by `personaName` lookup.
 * Turns only persist `persona_name`, not the persona id, emoji, or
 * description, so historical renders need this enrichment to match the
 * live SSE path (which sets emoji on `persona_turn_started` and looks
 * description up client-side from data.personaMeta).
 */
export function attachPersonaEmojis<T extends TurnLike>(
	turns: T[],
	personas: PersonaMetaSource[]
): (T & { emoji: string; description: string })[] {
	const byName = new Map(
		personas.map((p) => [p.name, { emoji: p.emoji ?? '', description: p.description ?? '' }])
	);
	return turns.map((t) => {
		const meta = (t.personaName && byName.get(t.personaName)) || { emoji: '', description: '' };
		return { ...t, emoji: meta.emoji, description: meta.description };
	});
}

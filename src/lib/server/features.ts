// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Feature flag registry. Personas can declare `requires: ["memory"]` etc.
 * The orchestrator filters out personas whose required features are
 * unavailable. M1 ships with no features enabled.
 */

/** Features available in the current build */
export const AVAILABLE_FEATURES: string[] = [];

interface PersonaWithRequires {
	id: string;
	// Drizzle JSON-mode column gives us string[] | null directly; no parse step.
	requires: string[] | null;
}

/**
 * Filter personas to only those whose required features are all available.
 * Returns { eligible, excluded } so the caller can warn about excluded personas.
 */
export function filterPersonas<T extends PersonaWithRequires>(
	personas: T[],
	availableFeatures: string[] = AVAILABLE_FEATURES
): { eligible: T[]; excluded: T[] } {
	const eligible: T[] = [];
	const excluded: T[] = [];

	for (const persona of personas) {
		if (!persona.requires || persona.requires.length === 0) {
			eligible.push(persona);
			continue;
		}
		if (persona.requires.every((f) => availableFeatures.includes(f))) {
			eligible.push(persona);
		} else {
			excluded.push(persona);
		}
	}

	return { eligible, excluded };
}

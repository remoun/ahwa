// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ModelConfig, RoundStructure } from '../schemas/council';

interface CouncilInputLike {
	name: string;
	description?: string | null;
	personaIds: string[];
	synthesisPrompt?: string;
	synthesis_prompt?: string;
	roundStructure?: RoundStructure;
	round_structure?: RoundStructure;
	modelConfig?: ModelConfig | null;
	model_config?: ModelConfig | null;
}

/**
 * Map a council input (HTTP body or parsed council JSON) to the shape
 * expected by the councils table. Single source of truth so adding a
 * new council field doesn't require fanning out edits to every
 * insert/update call site (api/councils POST + PUT, db/seed for the
 * built-in council files).
 *
 * Accepts either snake_case (council JSON) or camelCase (API body) on
 * the JSON-shaped fields. Drizzle's mode:'json' columns handle the
 * on-disk serialisation of personaIds / roundStructure / modelConfig.
 */
export function councilRow(input: CouncilInputLike) {
	const roundStructure = input.roundStructure ?? input.round_structure;
	if (!roundStructure) {
		throw new Error('councilRow: roundStructure is required');
	}
	return {
		name: input.name,
		description: input.description ?? null,
		personaIds: input.personaIds,
		synthesisPrompt: input.synthesisPrompt ?? input.synthesis_prompt ?? '',
		roundStructure,
		modelConfig: input.modelConfig ?? input.model_config ?? null
	};
}

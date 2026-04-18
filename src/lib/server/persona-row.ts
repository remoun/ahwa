// SPDX-License-Identifier: AGPL-3.0-or-later
import { jsonOrNull } from '../util';

interface PersonaInputLike {
	name: string;
	emoji: string;
	description?: string | null;
	systemPrompt?: string;
	system_prompt?: string;
	requires?: string[];
}

/**
 * Map a persona input (HTTP body or parsed council JSON) to the shape
 * expected by the personas table. Single source of truth so adding a new
 * persona field doesn't require fanning out edits to every insert/update
 * call site (api/personas POST + PUT, db/seed for both council-embedded
 * and standalone persona files).
 *
 * Accepts either snake_case (council JSON) or camelCase (API body) on
 * `system_prompt` / `systemPrompt`.
 */
export function personaRow(input: PersonaInputLike) {
	return {
		name: input.name,
		emoji: input.emoji,
		description: input.description ?? null,
		systemPrompt: input.systemPrompt ?? input.system_prompt ?? '',
		requires: jsonOrNull(input.requires)
	};
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

export const PersonaSchema = z.object({
	id: z.string(),
	name: z.string(),
	emoji: z.string(),
	system_prompt: z.string(),
	requires: z.array(z.string()).optional(),
	notes: z.string().optional()
});

export type Persona = z.infer<typeof PersonaSchema>;

export const RoundSchema = z.object({
	kind: z.string(),
	prompt_suffix: z.string()
});

export const RoundStructureSchema = z.object({
	rounds: z.array(RoundSchema),
	synthesize: z.boolean()
});

export const CouncilSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	personas: z.array(PersonaSchema).min(1),
	round_structure: RoundStructureSchema,
	synthesis_prompt: z.string()
});

export type Council = z.infer<typeof CouncilSchema>;

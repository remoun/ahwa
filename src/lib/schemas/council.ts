// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

export const PersonaSchema = z.object({
	id: z.string(),
	name: z.string(),
	emoji: z.string(),
	system_prompt: z.string(),
	requires: z.array(z.string()).optional(),
	notes: z.string().optional(),
	license: z.string().optional()
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

export const ModelConfigSchema = z.object({
	provider: z.enum(['anthropic', 'openai', 'openrouter', 'ollama']),
	model: z.string()
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const CouncilSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	personas: z.array(PersonaSchema).min(1),
	round_structure: RoundStructureSchema,
	synthesis_prompt: z.string(),
	model_config: ModelConfigSchema.optional(),
	license: z.string().optional()
});

export type Council = z.infer<typeof CouncilSchema>;

/** Zod schema for council create/update API request bodies */
export const CouncilBodySchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	personaIds: z.array(z.string()).min(1),
	synthesisPrompt: z.string().min(1),
	roundStructure: z.object({
		rounds: z
			.array(
				z.object({
					kind: z.string(),
					prompt_suffix: z.string()
				})
			)
			.min(1),
		synthesize: z.boolean()
	}),
	modelConfig: ModelConfigSchema.optional()
});

export type CouncilBody = z.infer<typeof CouncilBodySchema>;

/** Zod schema for persona create/update API request bodies */
export const PersonaBodySchema = z.object({
	name: z.string().min(1),
	emoji: z.string().min(1),
	systemPrompt: z.string().min(1),
	requires: z.array(z.string()).optional()
});

export type PersonaBody = z.infer<typeof PersonaBodySchema>;

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { PersonaSchema, CouncilSchema } from '../src/lib/schemas/council';
import { SseEventSchema, type SseEvent } from '../src/lib/schemas/events';

describe('PersonaSchema', () => {
	it('parses a valid persona', () => {
		const result = PersonaSchema.safeParse({
			id: 'elder',
			name: 'The Elder',
			emoji: '🌿',
			system_prompt: 'You are an elder.'
		});
		expect(result.success).toBe(true);
	});

	it('parses a persona with requires field', () => {
		const historian = JSON.parse(
			readFileSync('personas/historian.json', 'utf-8')
		);
		const result = PersonaSchema.safeParse(historian);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.requires).toEqual(['memory']);
		}
	});

	it('rejects a persona missing id', () => {
		const result = PersonaSchema.safeParse({
			name: 'No ID',
			emoji: '❌',
			system_prompt: 'Missing id field'
		});
		expect(result.success).toBe(false);
	});
});

describe('CouncilSchema', () => {
	it('parses the default council JSON', () => {
		const raw = JSON.parse(
			readFileSync('councils/default.json', 'utf-8')
		);
		const result = CouncilSchema.safeParse(raw);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.personas.length).toBe(5);
			expect(result.data.round_structure.rounds.length).toBe(2);
			expect(result.data.round_structure.synthesize).toBe(true);
		}
	});

	it('parses the federation council JSON', () => {
		const raw = JSON.parse(
			readFileSync('councils/federation.json', 'utf-8')
		);
		const result = CouncilSchema.safeParse(raw);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.personas.length).toBe(5);
		}
	});

	it('parses a council with model_config', () => {
		const result = CouncilSchema.safeParse({
			id: 'configured',
			name: 'Configured Council',
			personas: [{ id: 'p1', name: 'P', emoji: '!', system_prompt: 'test' }],
			round_structure: { rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }], synthesize: false },
			synthesis_prompt: 'Summarize.',
			model_config: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.model_config).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
		}
	});

	it('parses a council without model_config (auto-detect fallback)', () => {
		const raw = JSON.parse(readFileSync('councils/default.json', 'utf-8'));
		const result = CouncilSchema.safeParse(raw);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.model_config).toBeUndefined();
		}
	});

	it('rejects a council with invalid provider in model_config', () => {
		const result = CouncilSchema.safeParse({
			id: 'bad',
			name: 'Bad Provider',
			personas: [{ id: 'p1', name: 'P', emoji: '!', system_prompt: 'test' }],
			round_structure: { rounds: [{ kind: 'opening', prompt_suffix: 'Go.' }], synthesize: false },
			synthesis_prompt: 'n/a',
			model_config: { provider: 'fake-provider', model: 'some-model' }
		});
		expect(result.success).toBe(false);
	});

	it('rejects a council with empty personas array', () => {
		const result = CouncilSchema.safeParse({
			id: 'empty',
			name: 'Empty Council',
			personas: [],
			round_structure: { rounds: [], synthesize: false },
			synthesis_prompt: 'n/a'
		});
		expect(result.success).toBe(false);
	});
});

describe('SseEventSchema', () => {
	const allEventTypes: SseEvent['type'][] = [
		'table_opened',
		'round_started',
		'persona_turn_started',
		'token',
		'persona_turn_completed',
		'synthesis_started',
		'synthesis_token',
		'table_closed',
		'error'
	];

	it('accepts all nine SSE event types', () => {
		const events: Record<string, object> = {
			table_opened: { type: 'table_opened', tableId: 't1' },
			round_started: { type: 'round_started', round: 1, kind: 'opening' },
			persona_turn_started: { type: 'persona_turn_started', personaId: 'elder', personaName: 'The Elder', emoji: '🌿' },
			token: { type: 'token', personaId: 'elder', text: 'Hello' },
			persona_turn_completed: { type: 'persona_turn_completed', personaId: 'elder' },
			synthesis_started: { type: 'synthesis_started' },
			synthesis_token: { type: 'synthesis_token', text: 'In summary' },
			table_closed: { type: 'table_closed' },
			error: { type: 'error', message: 'Something broke' }
		};

		for (const eventType of allEventTypes) {
			const result = SseEventSchema.safeParse(events[eventType]);
			expect(result.success).toBe(true);
		}
	});

	it('rejects an event with unknown type', () => {
		const result = SseEventSchema.safeParse({ type: 'not_real', data: 'nope' });
		expect(result.success).toBe(false);
	});
});

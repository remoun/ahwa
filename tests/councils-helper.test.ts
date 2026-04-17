// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { expandCouncilPersonas, attachPersonaEmojis } from '../src/lib/server/councils';

describe('expandCouncilPersonas', () => {
	const allPersonas = [
		{ id: 'elder', name: 'The Elder', emoji: '🌿' },
		{ id: 'mirror', name: 'The Mirror', emoji: '🪞' },
		{ id: 'engineer', name: 'The Engineer', emoji: '🔧' }
	];

	it('resolves personaIds JSON into persona objects in order', () => {
		const council = {
			id: 'c1',
			personaIds: JSON.stringify(['mirror', 'elder'])
		};
		const out = expandCouncilPersonas(council, allPersonas);
		expect(out.personas.map((p) => p.id)).toEqual(['mirror', 'elder']);
		expect(out.personas[0].emoji).toBe('🪞');
	});

	it('drops ids that do not match any persona (stale reference)', () => {
		const council = {
			id: 'c2',
			personaIds: JSON.stringify(['elder', 'ghost', 'engineer'])
		};
		const out = expandCouncilPersonas(council, allPersonas);
		expect(out.personas.map((p) => p.id)).toEqual(['elder', 'engineer']);
	});

	it('yields an empty personas array when personaIds is null', () => {
		const council = { id: 'c3', personaIds: null };
		const out = expandCouncilPersonas(council, allPersonas);
		expect(out.personas).toEqual([]);
	});
});

describe('attachPersonaEmojis', () => {
	const personas = [
		{ name: 'The Elder', emoji: '🌿' },
		{ name: 'The Mirror', emoji: '🪞' }
	];

	it("attaches each turn's persona emoji by name", () => {
		const turns = [
			{ personaName: 'The Elder', text: 'hi' },
			{ personaName: 'The Mirror', text: 'hello' }
		];
		const out = attachPersonaEmojis(turns, personas);
		expect(out[0].emoji).toBe('🌿');
		expect(out[1].emoji).toBe('🪞');
	});

	it('falls back to an empty string when the persona is unknown', () => {
		// A persona may have been renamed or deleted since the turn was saved.
		const turns = [{ personaName: 'Ghost', text: 'boo' }];
		const out = attachPersonaEmojis(turns, personas);
		expect(out[0].emoji).toBe('');
	});

	it('falls back to an empty string when personaName is null (synth turns)', () => {
		const turns = [{ personaName: null, text: 'final synthesis' }];
		const out = attachPersonaEmojis(turns, personas);
		expect(out[0].emoji).toBe('');
	});
});

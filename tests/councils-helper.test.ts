// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { expandCouncilPersonas } from '../src/lib/server/councils';

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

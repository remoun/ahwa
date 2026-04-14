// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { filterPersonas, AVAILABLE_FEATURES } from '../src/lib/server/features';

describe('feature flags', () => {
	const personas = [
		{ id: 'elder', requires: null },
		{ id: 'mirror', requires: null },
		{ id: 'historian', requires: JSON.stringify(['memory']) },
		{ id: 'multi', requires: JSON.stringify(['memory', 'two_party']) }
	];

	it('M1 ships with no features available', () => {
		expect(AVAILABLE_FEATURES).toEqual([]);
	});

	it('filters out personas with unmet requirements', () => {
		const { eligible, excluded } = filterPersonas(personas);
		expect(eligible.map((p) => p.id)).toEqual(['elder', 'mirror']);
		expect(excluded.map((p) => p.id)).toEqual(['historian', 'multi']);
	});

	it('includes personas when all required features are available', () => {
		const { eligible, excluded } = filterPersonas(personas, ['memory']);
		expect(eligible.map((p) => p.id)).toEqual(['elder', 'mirror', 'historian']);
		expect(excluded.map((p) => p.id)).toEqual(['multi']);
	});

	it('includes all personas when all features are available', () => {
		const { eligible, excluded } = filterPersonas(personas, ['memory', 'two_party']);
		expect(eligible.length).toBe(4);
		expect(excluded.length).toBe(0);
	});

	it('passes through personas with no requires field', () => {
		const simple = [{ id: 'a', requires: null }, { id: 'b', requires: null }];
		const { eligible } = filterPersonas(simple);
		expect(eligible.length).toBe(2);
	});
});

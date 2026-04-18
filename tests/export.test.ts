// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { generateMarkdown } from '../src/lib/server/export';

describe('markdown export', () => {
	const table = {
		id: 'tbl-1',
		dilemma: 'Should I quit my job?',
		createdAt: 1700000000000
	};

	const council = {
		name: 'The Default Council'
	};

	const turns = [
		{ round: 1, personaName: 'The Elder', emoji: '🌿', text: 'Consider the long view.' },
		{ round: 1, personaName: 'The Mirror', emoji: '🪞', text: 'What do your values say?' },
		{ round: 2, personaName: 'The Elder', emoji: '🌿', text: 'I stand by my opening.' },
		{ round: 2, personaName: 'The Mirror', emoji: '🪞', text: 'The Elder makes a good point.' }
	];

	const synthesis = 'The council agrees on one thing: take your time.';

	it('produces valid markdown with dilemma as title', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).toContain('# Should I quit my job?');
	});

	it('includes council name in metadata', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).toContain('The Default Council');
	});

	it('groups turns by round', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).toContain('## Round 1');
		expect(md).toContain('## Round 2');
	});

	it('includes persona emoji and name', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).toContain('### 🌿 The Elder');
		expect(md).toContain('### 🪞 The Mirror');
	});

	it('includes turn text', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).toContain('Consider the long view.');
		expect(md).toContain('What do your values say?');
	});

	it('includes synthesis section', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).toContain('## Synthesis');
		expect(md).toContain('The council agrees on one thing: take your time.');
	});

	it('renders a Council roster section when personas have descriptions', () => {
		const councilWithPersonas = {
			name: 'The Default Council',
			personas: [
				{ name: 'The Elder', emoji: '🌿', description: 'Long-horizon view.' },
				{ name: 'The Mirror', emoji: '🪞', description: 'Reflects your values back.' }
			]
		};
		const md = generateMarkdown(table, turns, councilWithPersonas, synthesis);

		expect(md).toContain('## Council');
		expect(md).toContain('- 🌿 **The Elder** — Long-horizon view.');
		expect(md).toContain('- 🪞 **The Mirror** — Reflects your values back.');
		// Roster comes BEFORE the rounds so readers see who's who first.
		expect(md.indexOf('## Council')).toBeLessThan(md.indexOf('## Round 1'));
	});

	it('omits the Council roster when no personas have descriptions', () => {
		const md = generateMarkdown(table, turns, council, synthesis);
		expect(md).not.toContain('## Council');
	});

	it('handles missing synthesis gracefully', () => {
		const md = generateMarkdown(table, turns, council, null);
		expect(md).not.toContain('## Synthesis');
	});

	it('handles empty turns array', () => {
		const md = generateMarkdown(table, [], council, null);
		expect(md).toContain('# Should I quit my job?');
		expect(md).toContain('The Default Council');
		expect(md).not.toContain('## Round');
		expect(md).not.toContain('## Synthesis');
	});
});

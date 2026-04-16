// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { renderMarkdown } from '../src/lib/markdown';

describe('renderMarkdown', () => {
	it('returns plain text on the server (no window)', () => {
		// Running under Bun test without a DOM → SSR fallback path
		expect(renderMarkdown('**bold**')).toBe('**bold**');
	});

	// Browser-side tests (XSS, rendering) are covered by Playwright — we'd
	// need jsdom to exercise them here, which adds weight for no real gain.
});

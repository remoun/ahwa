// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, mock } from 'bun:test';

// Mock the AI SDK before importing llm
mock.module('ai', () => ({
	streamText: mock(async (opts: any) => {
		return {
			textStream: (async function* () {
				yield 'Hello';
				yield ' world';
			})()
		};
	})
}));

mock.module('@ai-sdk/anthropic', () => ({
	createAnthropic: () => (modelId: string) => ({ modelId, provider: 'anthropic' })
}));

// Import after mocking
const { complete } = await import('../src/lib/server/llm');

describe('llm.complete', () => {
	it('returns a text stream from the provider', async () => {
		const result = await complete({
			model: 'claude-sonnet-4-5',
			system: 'You are helpful.',
			messages: [{ role: 'user', content: 'Hi' }],
			stream: true
		});

		const chunks: string[] = [];
		for await (const chunk of result.textStream) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual(['Hello', ' world']);
	});

	it('accepts the request-shaped interface per invariant #6', async () => {
		// Verify the function signature accepts the documented shape
		const result = await complete({
			model: 'claude-sonnet-4-5',
			system: 'System prompt',
			messages: [
				{ role: 'user', content: 'Question' },
				{ role: 'assistant', content: 'Answer' }
			],
			stream: true
		});

		expect(result.textStream).toBeDefined();
	});
});

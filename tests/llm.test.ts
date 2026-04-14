// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import type { CompleteRequest, CompleteResult } from '../src/lib/server/llm';

describe('llm interface contract', () => {
	// We test the interface shape, not the real provider (never hit APIs in tests).
	// The real complete() wraps Vercel AI SDK; we verify the contract here.

	const mockComplete = async (request: CompleteRequest): Promise<CompleteResult> => ({
		textStream: (async function* () {
			yield 'Hello';
			yield ' world';
		})()
	});

	it('returns a text stream from the provider', async () => {
		const result = await mockComplete({
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
		const result = await mockComplete({
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

	it('exports CompleteRequest and CompleteResult types', () => {
		// Type-level check: if these don't exist, the import fails
		const req: CompleteRequest = {
			model: 'test',
			system: 'test',
			messages: [],
			stream: true
		};
		expect(req.model).toBe('test');
	});
});

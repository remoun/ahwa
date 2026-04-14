// SPDX-License-Identifier: AGPL-3.0-or-later
import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY
});

// M0 default: free-tier model on OpenRouter
export const DEFAULT_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';

export interface CompleteRequest {
	model: string;
	system: string;
	messages: Array<{ role: 'user' | 'assistant'; content: string }>;
	stream: true;
}

export interface CompleteResult {
	textStream: AsyncIterable<string>;
}

/**
 * Single provider abstraction per invariant #6.
 * The orchestrator calls this and nothing else.
 * M0: OpenRouter (free tier). M1: multi-provider routing.
 */
export async function complete(request: CompleteRequest): Promise<CompleteResult> {
	const result = streamText({
		model: openrouter(request.model),
		system: request.system,
		messages: request.messages
	});

	return { textStream: result.textStream };
}

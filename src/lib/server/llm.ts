// SPDX-License-Identifier: AGPL-3.0-or-later
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic();

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
 * M0: hardcoded Anthropic. M1: multi-provider routing.
 */
export async function complete(request: CompleteRequest): Promise<CompleteResult> {
	const result = streamText({
		model: anthropic(request.model),
		system: request.system,
		messages: request.messages
	});

	return { textStream: (await result).textStream };
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider-v2';

export type ProviderName = 'anthropic' | 'openai' | 'openrouter' | 'ollama';

export interface ModelConfig {
	provider: ProviderName;
	model: string;
}

export interface CompleteRequest {
	model: string;
	system: string;
	messages: Array<{ role: 'user' | 'assistant'; content: string }>;
	stream: true;
	modelConfig?: ModelConfig;
}

export interface CompleteResult {
	textStream: AsyncIterable<string>;
}

/** Default models per provider when only the provider is known */
const DEFAULT_MODELS: Record<ProviderName, string> = {
	anthropic: 'claude-sonnet-4-20250514',
	openai: 'gpt-4o',
	openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
	ollama: 'llama3.1'
};

/**
 * Detect the first available provider by checking env vars.
 * Priority: Anthropic → OpenAI → OpenRouter → Ollama (always available).
 */
export function detectDefaultProvider(): ProviderName {
	if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
	if (process.env.OPENAI_API_KEY) return 'openai';
	if (process.env.OPENROUTER_API_KEY) return 'openrouter';
	return 'ollama';
}

/**
 * List all providers that have their required credentials configured.
 * Ollama is always available (local, no key needed).
 */
export function getAvailableProviders(): ProviderName[] {
	const available: ProviderName[] = [];
	if (process.env.ANTHROPIC_API_KEY) available.push('anthropic');
	if (process.env.OPENAI_API_KEY) available.push('openai');
	if (process.env.OPENROUTER_API_KEY) available.push('openrouter');
	available.push('ollama'); // always available
	return available;
}

/**
 * Resolve a ModelConfig from an optional council-level config.
 * If no config is provided, auto-detect the provider and use its default model.
 */
export function resolveModelConfig(config: ModelConfig | undefined): ModelConfig {
	if (config) return config;
	const provider = detectDefaultProvider();
	return { provider, model: DEFAULT_MODELS[provider] };
}

/** Create the appropriate Vercel AI SDK model instance for a provider+model pair */

function createModel(config: ModelConfig): any {
	switch (config.provider) {
		case 'anthropic': {
			const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
			return anthropic(config.model);
		}
		case 'openai': {
			const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
			return openai(config.model);
		}
		case 'openrouter': {
			const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
			return openrouter(config.model);
		}
		case 'ollama': {
			const ollama = createOllama({
				baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api'
			});
			return ollama(config.model);
		}
		default:
			throw new Error(`Unknown provider: ${(config as any).provider}`);
	}
}

/**
 * Deterministic mock response for E2E tests. Enabled by AHWA_MOCK_LLM=1.
 * Yields a short labeled response identifying the persona from the system
 * prompt — same pattern as tests/helpers.ts mockComplete().
 *
 * Escape hatch: if any user message contains the marker "[MOCK_FAIL]",
 * the mock throws. Lets E2E tests exercise the error-handling path.
 */
function mockComplete(request: CompleteRequest): CompleteResult {
	// Failure injection for tests
	if (request.messages.some((m) => m.content.includes('[MOCK_FAIL]'))) {
		throw new Error('Mock LLM failure injected via [MOCK_FAIL] marker');
	}

	const prompt = request.system.toLowerCase();
	let name = 'Persona';
	if (prompt.includes('elder')) name = 'Elder';
	else if (prompt.includes('mirror')) name = 'Mirror';
	else if (prompt.includes('engineer') || prompt.includes('systems')) name = 'Engineer';
	else if (prompt.includes('weaver') || prompt.includes('relational')) name = 'Weaver';
	else if (prompt.includes('instigator') || prompt.includes('agency')) name = 'Instigator';
	else if (prompt.includes('synthesiz')) name = 'Synthesizer';

	return {
		textStream: (async function* () {
			yield `[${name}] `;
			yield 'This is a mocked response for E2E testing.';
		})()
	};
}

/**
 * Single provider abstraction per invariant #6.
 * The orchestrator calls this and nothing else.
 * Routes to the correct provider based on modelConfig.
 */
export async function complete(request: CompleteRequest): Promise<CompleteResult> {
	// Mock mode for E2E tests — no real LLM calls
	if (process.env.AHWA_MOCK_LLM === '1') {
		return mockComplete(request);
	}

	const config = resolveModelConfig(request.modelConfig);
	const model = createModel(config);

	const result = streamText({
		model,
		system: request.system,
		messages: request.messages
	});

	return { textStream: result.textStream };
}

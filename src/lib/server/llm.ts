// SPDX-License-Identifier: AGPL-3.0-or-later
import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';

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

// M0 backward compat
export const DEFAULT_MODEL = DEFAULT_MODELS.openrouter;

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Single provider abstraction per invariant #6.
 * The orchestrator calls this and nothing else.
 * Routes to the correct provider based on modelConfig.
 */
export async function complete(request: CompleteRequest): Promise<CompleteResult> {
	const config = resolveModelConfig(request.modelConfig);
	const model = createModel(config);

	const result = streamText({
		model,
		system: request.system,
		messages: request.messages
	});

	return { textStream: result.textStream };
}

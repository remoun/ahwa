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

/**
 * Map a persona's system prompt to a short display label, used by both
 * mock LLMs (this file's mockComplete and tests/helpers.ts mockComplete)
 * to label their synthetic responses.
 *
 * Matchers are intentionally loose — they fire on any persona whose
 * system prompt contains the keyword, so renaming a persona doesn't
 * break the mock as long as the role's flavor word remains. Falls
 * back to the supplied fallback (default "Persona") for prompts that
 * don't match any known role.
 */
export function detectPersonaName(systemPrompt: string, fallback = 'Persona'): string {
	const prompt = systemPrompt.toLowerCase();
	if (prompt.includes('elder')) return 'Elder';
	if (prompt.includes('mirror')) return 'Mirror';
	if (prompt.includes('engineer') || prompt.includes('systems')) return 'Engineer';
	if (prompt.includes('weaver') || prompt.includes('relational')) return 'Weaver';
	if (prompt.includes('instigator') || prompt.includes('agency')) return 'Instigator';
	if (prompt.includes('synthesiz')) return 'Synthesizer';
	return fallback;
}

export interface CompleteResult {
	textStream: AsyncIterable<string>;
	/**
	 * Resolves after the stream ends.
	 *
	 * - `truncated: true` means the model hit the output-token cap
	 *   (maxOutputTokens or similar) and the text was cut off mid-
	 *   generation — the persisted turn should be flagged so a later
	 *   reader knows the response is incomplete.
	 * - `totalTokens` is prompt + completion tokens consumed by this
	 *   single call, surfaced from the underlying SDK. Optional because
	 *   not every mock provides it; real providers always do. The
	 *   orchestrator sums this across calls for demo budget reconcile.
	 */
	finished: Promise<{ truncated: boolean; totalTokens?: number }>;
}

/**
 * Build a CompleteResult from a list of pre-decided text chunks. Used
 * by both mock LLMs so the chunks the stream yields and the chunks the
 * synthetic token count is derived from can never drift apart.
 *
 * Token estimate uses the rough rule of ~4 characters per token —
 * good enough for tests asserting "non-zero usage was summed."
 */
export function mockCompleteResult(chunks: string[]): CompleteResult {
	return {
		textStream: (async function* () {
			for (const chunk of chunks) yield chunk;
		})(),
		finished: Promise.resolve({
			truncated: false,
			totalTokens: Math.ceil(chunks.join('').length / 4)
		})
	};
}

/**
 * Default models per provider when only the provider is known.
 *
 * OpenRouter default is Claude Sonnet 4.6. Deliberation quality matters
 * for this product — users bring decisions that matter to them, and the
 * difference between a nuanced 4-paragraph take and a terse 3-sentence
 * one is load-bearing. `:free` tier models were tried first but rotate
 * reliability / get rate-limited / occasionally return empty, which the
 * orchestrator's fail-loud guard catches but doesn't fix.
 *
 * At ~$3/1M input + $15/1M output via OpenRouter, a typical 5-persona
 * 2-round deliberation runs ~$0.12 — about 80 deliberations per $10/wk
 * spend cap. Override per-council via council.model_config for cheaper
 * defaults on demo-style councils or higher tiers for critical work.
 */
const HARDCODED_DEFAULT_MODELS: Record<ProviderName, string> = {
	anthropic: 'claude-sonnet-4-20250514',
	openai: 'gpt-4o',
	openrouter: 'anthropic/claude-sonnet-4.6',
	ollama: 'llama3.1'
};

/**
 * Per-provider env overrides so operators can swap the default model
 * without a code change — e.g. `AHWA_OPENROUTER_MODEL=google/gemini-2.5-pro`
 * on a staging deploy. Reads env on each call (rather than at module load)
 * so tests can set it after import.
 */
export function defaultModelFor(provider: ProviderName): string {
	const envKey = `AHWA_${provider.toUpperCase()}_MODEL` as const;
	return process.env[envKey] || HARDCODED_DEFAULT_MODELS[provider];
}

/**
 * Detect the first available provider by checking env vars.
 * Priority: Anthropic → OpenAI → OpenRouter → Ollama.
 *
 * Ollama is only picked when OLLAMA_BASE_URL is explicitly set — we used
 * to treat it as an "always available" fallback, but on hosted deploys
 * with no local Ollama daemon that silently produces empty streams and
 * leaves the user staring at a finished deliberation with no text.
 * Better to fail loudly at startup.
 */
export function detectDefaultProvider(): ProviderName {
	// In mock mode (tests/E2E), every call is short-circuited in complete()
	// before the resolved provider matters. Return a valid value so the
	// orchestrator's upfront resolveModelConfig() doesn't crash.
	if (process.env.AHWA_MOCK_LLM === '1') return 'anthropic';
	if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
	if (process.env.OPENAI_API_KEY) return 'openai';
	if (process.env.OPENROUTER_API_KEY) return 'openrouter';
	if (process.env.OLLAMA_BASE_URL) return 'ollama';
	throw new Error(
		'No LLM provider configured. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, OLLAMA_BASE_URL.'
	);
}

/** List all providers whose credentials/URL are configured via env vars. */
export function getAvailableProviders(): ProviderName[] {
	const available: ProviderName[] = [];
	if (process.env.ANTHROPIC_API_KEY) available.push('anthropic');
	if (process.env.OPENAI_API_KEY) available.push('openai');
	if (process.env.OPENROUTER_API_KEY) available.push('openrouter');
	if (process.env.OLLAMA_BASE_URL) available.push('ollama');
	return available;
}

/**
 * Resolve a ModelConfig from an optional council-level config.
 * If no config is provided, auto-detect the provider and use its default model.
 */
export function resolveModelConfig(config: ModelConfig | undefined): ModelConfig {
	if (config) return config;
	const provider = detectDefaultProvider();
	return { provider, model: defaultModelFor(provider) };
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

	const name = detectPersonaName(request.system);
	return mockCompleteResult([`[${name}] `, 'This is a mocked response for E2E testing.']);
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

	// Cap output tokens so each turn stays within a reasonable per-request
	// budget. Without a cap, the AI SDK sends the model's full context
	// window as max_tokens, which can exceed a spend-limited OR key's
	// per-request allowance and cause OR to reject the call with 402
	// ("more credits or fewer max_tokens needed"). The SDK swallows that
	// into an empty stream; we'd surface a generic "empty response" error
	// with no useful signal. 2000 tokens is ~3x the longest persona turn
	// we've observed, leaving headroom without burning through a weekly
	// spend cap.
	const result = streamText({
		model,
		system: request.system,
		messages: request.messages,
		maxOutputTokens: 2000
	});

	// Surface underlying stream errors (rate limits, credit caps, provider
	// failures) instead of letting the SDK turn them into an empty stream
	// that only manifests later as our generic fail-loud empty-response
	// guard. fullStream yields typed parts including { type: 'error' }.
	return {
		textStream: (async function* () {
			for await (const part of result.fullStream) {
				if (part.type === 'text-delta') yield part.text;
				else if (part.type === 'error') throw part.error;
			}
		})(),
		// result.finishReason / totalUsage are PromiseLike from the Vercel
		// AI SDK; wrap to satisfy our CompleteResult.finished: Promise<...>
		// contract. totalTokens is summed across calls by the orchestrator
		// for demo budget reconciliation.
		finished: Promise.all([
			Promise.resolve(result.finishReason),
			Promise.resolve(result.totalUsage)
		]).then(([reason, usage]) => ({
			truncated: reason === 'length',
			totalTokens: usage?.totalTokens
		}))
	};
}

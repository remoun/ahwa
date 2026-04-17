// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import type { CompleteRequest, CompleteResult } from '../src/lib/server/llm';
import {
	defaultModelFor,
	detectDefaultProvider,
	getAvailableProviders,
	resolveModelConfig,
	type ModelConfig
} from '../src/lib/server/llm';

describe('llm interface contract', () => {
	// We test the interface shape, not the real provider (never hit APIs in tests).
	// The real complete() wraps Vercel AI SDK; we verify the contract here.

	const mockComplete = async (_request: CompleteRequest): Promise<CompleteResult> => ({
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

describe('provider detection', () => {
	// Save and restore env between tests
	const savedEnv: Record<string, string | undefined> = {};
	const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_BASE_URL'];

	function clearProviderEnv() {
		for (const key of envKeys) {
			savedEnv[key] = process.env[key];
			delete process.env[key];
		}
	}

	function restoreProviderEnv() {
		for (const key of envKeys) {
			if (savedEnv[key] !== undefined) {
				process.env[key] = savedEnv[key];
			} else {
				delete process.env[key];
			}
		}
	}

	it('detects anthropic as first priority', () => {
		clearProviderEnv();
		process.env.ANTHROPIC_API_KEY = 'test-key';
		process.env.OPENAI_API_KEY = 'test-key';
		const result = detectDefaultProvider();
		expect(result).toBe('anthropic');
		restoreProviderEnv();
	});

	it('falls back to openai when anthropic is missing', () => {
		clearProviderEnv();
		process.env.OPENAI_API_KEY = 'test-key';
		const result = detectDefaultProvider();
		expect(result).toBe('openai');
		restoreProviderEnv();
	});

	it('falls back to openrouter when anthropic and openai are missing', () => {
		clearProviderEnv();
		process.env.OPENROUTER_API_KEY = 'test-key';
		const result = detectDefaultProvider();
		expect(result).toBe('openrouter');
		restoreProviderEnv();
	});

	it('returns ollama only when OLLAMA_BASE_URL is explicitly set', () => {
		clearProviderEnv();
		process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';
		expect(detectDefaultProvider()).toBe('ollama');
		restoreProviderEnv();
	});

	it('throws a configured-message error when no provider env is set', () => {
		// Avoids the silent-ollama-fallback trap on hosted deploys where no
		// Ollama is actually reachable (see preview "empty replies" bug).
		clearProviderEnv();
		const savedMock = process.env.AHWA_MOCK_LLM;
		delete process.env.AHWA_MOCK_LLM;
		expect(() => detectDefaultProvider()).toThrow(/no llm provider configured/i);
		if (savedMock !== undefined) process.env.AHWA_MOCK_LLM = savedMock;
		restoreProviderEnv();
	});

	it('does not throw when AHWA_MOCK_LLM is set even with no provider env', () => {
		// E2E tests start the server with AHWA_MOCK_LLM=1 and no provider
		// credentials. The orchestrator still calls resolveModelConfig up
		// front, so detection must succeed — the mock path downstream
		// ignores the returned config.
		clearProviderEnv();
		const saved = process.env.AHWA_MOCK_LLM;
		process.env.AHWA_MOCK_LLM = '1';
		expect(() => detectDefaultProvider()).not.toThrow();
		if (saved === undefined) delete process.env.AHWA_MOCK_LLM;
		else process.env.AHWA_MOCK_LLM = saved;
		restoreProviderEnv();
	});

	it('lists only providers whose credentials are present', () => {
		clearProviderEnv();
		process.env.ANTHROPIC_API_KEY = 'test-key';
		process.env.OPENROUTER_API_KEY = 'test-key';
		const available = getAvailableProviders();
		expect(available).toContain('anthropic');
		expect(available).toContain('openrouter');
		expect(available).not.toContain('ollama'); // not configured here
		expect(available).not.toContain('openai');
		restoreProviderEnv();
	});

	it('includes ollama in available providers when OLLAMA_BASE_URL is set', () => {
		clearProviderEnv();
		process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';
		expect(getAvailableProviders()).toContain('ollama');
		restoreProviderEnv();
	});
});

describe('resolveModelConfig', () => {
	it('uses explicit model_config when provided', () => {
		const config: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
		const result = resolveModelConfig(config);
		expect(result.provider).toBe('anthropic');
		expect(result.model).toBe('claude-sonnet-4-20250514');
	});

	it('auto-detects when no model_config is provided and a provider env is set', () => {
		const saved = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = 'test-key';
		const result = resolveModelConfig(undefined);
		expect(result.provider).toBe('anthropic');
		expect(result.model).toBeDefined();
		if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
		else process.env.ANTHROPIC_API_KEY = saved;
	});
});

describe('defaultModelFor', () => {
	it('returns the hardcoded default when no env override is set', () => {
		const saved = process.env.AHWA_OPENROUTER_MODEL;
		delete process.env.AHWA_OPENROUTER_MODEL;
		try {
			expect(defaultModelFor('openrouter')).toBe('anthropic/claude-sonnet-4-6');
		} finally {
			if (saved !== undefined) process.env.AHWA_OPENROUTER_MODEL = saved;
		}
	});

	it('honors AHWA_OPENROUTER_MODEL when set', () => {
		const saved = process.env.AHWA_OPENROUTER_MODEL;
		process.env.AHWA_OPENROUTER_MODEL = 'google/gemini-2.5-pro';
		try {
			expect(defaultModelFor('openrouter')).toBe('google/gemini-2.5-pro');
		} finally {
			if (saved === undefined) delete process.env.AHWA_OPENROUTER_MODEL;
			else process.env.AHWA_OPENROUTER_MODEL = saved;
		}
	});

	it('honors AHWA_ANTHROPIC_MODEL, AHWA_OPENAI_MODEL, AHWA_OLLAMA_MODEL in the same pattern', () => {
		// One assertion per provider — the env-key derivation is the thing under test.
		const cases = [
			{ provider: 'anthropic', envKey: 'AHWA_ANTHROPIC_MODEL', value: 'custom-sonnet' },
			{ provider: 'openai', envKey: 'AHWA_OPENAI_MODEL', value: 'custom-gpt' },
			{ provider: 'ollama', envKey: 'AHWA_OLLAMA_MODEL', value: 'custom-llama' }
		] as const;
		for (const { provider, envKey, value } of cases) {
			const saved = process.env[envKey];
			process.env[envKey] = value;
			try {
				expect(defaultModelFor(provider)).toBe(value);
			} finally {
				if (saved === undefined) delete process.env[envKey];
				else process.env[envKey] = saved;
			}
		}
	});
});

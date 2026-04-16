// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Test preload. Kept tiny on purpose — anything test-wide that can't live
 * in a fixture goes here.
 *
 * Provider detection: orchestrator/e2e tests pass a mocked completeFn,
 * so real provider credentials are never used. But resolveModelConfig
 * still runs and now throws when no provider env var is set (to stop
 * hosted deploys from silently falling back to an unreachable Ollama).
 * Set a fake key so that detection resolves and the mock path runs.
 */
if (!process.env.ANTHROPIC_API_KEY) {
	process.env.ANTHROPIC_API_KEY = 'test-key-not-a-real-call';
}

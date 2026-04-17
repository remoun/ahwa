// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Playwright config for the post-deploy UI smoke test. Runs only
// e2e/smoke.spec.ts against the deployed BASE_URL (e.g. https://ahwa.app),
// with no webServer — the target is already running somewhere.
// The regular e2e suite uses playwright.config.ts against a local Bun
// server with AHWA_MOCK_LLM=1.
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://ahwa.app';

export default defineConfig({
	testDir: './e2e',
	testMatch: /smoke\.spec\.ts$/,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 1, // one retry tolerates transient provider blips; repeat failures escalate
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});

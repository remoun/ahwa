// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173; // vite preview default

export default defineConfig({
	testDir: './e2e',
	// smoke.spec.ts is the post-deploy UI smoke — see
	// playwright.smoke.config.ts. It targets the real provider and isn't
	// meant to run in the normal mock-LLM e2e job.
	testIgnore: /smoke\.spec\.ts$/,
	fullyParallel: false, // shared SQLite DB — keep sequential
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'on-first-retry'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],

	// Build then start SvelteKit with a mock LLM and an ephemeral data dir.
	// --bun forces Bun's module resolver so bun:sqlite works.
	webServer: {
		command: `AHWA_MOCK_LLM=1 AHWA_DATA_DIR=./e2e/.data PORT=${PORT} bun --bun build/index.js`,
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});

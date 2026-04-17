// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Post-deploy smoke test that drives the UI of the deployed ahwa.app.
// Run via `bun run test:e2e:smoke` with BASE_URL pointing at the target.
// The regular e2e suite uses a mock LLM and stays sub-second; this spec
// hits the real provider and takes ~60-90s per run — keep it narrow.
import { test, expect } from '@playwright/test';

test('UI drives a full deliberation against the real provider', async ({ page }) => {
	// The deliberation itself can take ~60-90s against the real LLM.
	// The 3-minute cap is a ceiling, not a target.
	test.setTimeout(180_000);

	await page.goto('/');
	await expect(page.getByRole('heading', { name: /set a table/i })).toBeVisible();

	const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
	const dilemma = `UI smoke test ${stamp} — does the deliberation loop work end-to-end?`;

	await page.getByPlaceholder(/describe the decision/i).fill(dilemma);
	// Default council is preselected — just submit.
	await page.getByRole('button', { name: /set a table$/i }).click();

	await expect(page).toHaveURL(/\/t\//);

	// Streaming proof: the first persona card fills with actual text.
	// Catches the class of bug where the card scaffolds appear but the
	// SSE token stream is broken (#11-style issues).
	await expect(page.getByText('The Elder').first()).toBeVisible({ timeout: 30_000 });
	const elderCard = page.getByText('The Elder').first().locator('..');
	await expect(elderCard).not.toHaveText('The Elder', { timeout: 60_000 });

	// Completion proof: synthesis renders.
	await expect(page.getByRole('heading', { name: /^synthesis$/i })).toBeVisible({
		timeout: 150_000
	});

	// Error proof: no banner surfaced.
	await expect(page.getByText(/LLM returned empty response/i)).not.toBeVisible();
});

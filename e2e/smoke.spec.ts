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

	// Detect which rendering "/" served and drive the matching flow.
	// Public-demo instances (AHWA_PUBLIC_DEMO=1) get the landing page;
	// self-hosted instances get the "Set a table" form. Both flows
	// converge on /t/{id} with identical streaming + synthesis below.
	const isDemo = await page
		.getByRole('heading', { name: /try the demo/i })
		.isVisible()
		.catch(() => false);

	const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
	const dilemma = `UI smoke test ${stamp} — does the deliberation loop work end-to-end?`;

	if (isDemo) {
		await page.getByPlaceholder(/dilemma you're sitting with/i).fill(dilemma);
		await page.getByRole('button', { name: /convene the council/i }).click();
	} else {
		await expect(page.getByRole('heading', { name: /set a table/i })).toBeVisible();
		await page.getByPlaceholder(/describe the decision/i).fill(dilemma);
		// Default council is preselected — just submit.
		await page.getByRole('button', { name: /set a table$/i }).click();
	}

	await expect(page).toHaveURL(/\/t\//);

	// Streaming proof: sample the first persona card's text at intervals
	// and confirm it grew through multiple intermediate sizes. Catches
	// the #11-class bug where tokens accumulate in a buffer and the card
	// jumps from empty to full in a single DOM update — under that bug,
	// distinct text lengths observed would be 2 (empty, final); under
	// real streaming it's typically >10.
	await expect(page.getByText('The Elder').first()).toBeVisible({ timeout: 30_000 });
	const elderCard = page.getByText('The Elder').first().locator('..');

	const lengths = new Set<number>();
	for (let i = 0; i < 30; i++) {
		const text = (await elderCard.textContent()) ?? '';
		lengths.add(text.length);
		await page.waitForTimeout(500);
	}
	expect(lengths.size).toBeGreaterThan(5);

	// Completion proof: synthesis renders. Scope to the section heading
	// (id=synthesis-heading) — the model can emit its own "Synthesis"
	// markdown heading inside the body, which would trip strict mode.
	await expect(page.locator('#synthesis-heading')).toBeVisible({
		timeout: 150_000
	});

	// Error proof: no banner surfaced.
	await expect(page.getByText(/LLM returned empty response/i)).not.toBeVisible();
});

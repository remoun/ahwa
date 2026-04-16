// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test';
import { createTable, runDeliberation, waitForCompletion, expectMainText } from './helpers';

test.describe('deliberation flow', () => {
	test('home page shows dilemma form and council picker', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Set a table' })).toBeVisible();
		await expect(page.getByPlaceholder(/describe the decision/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /The Default Council/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /The Federation Council/ })).toBeVisible();
	});

	test('creating a table runs a full deliberation with streaming', async ({ page }) => {
		await createTable(page, 'Should I take the new job?');

		await expectMainText(page, 'Should I take the new job?');
		await waitForCompletion(page);

		// Check that personas from the default council rendered turns
		await expect(page.getByText('The Elder').first()).toBeVisible();
		await expect(page.getByText('The Mirror').first()).toBeVisible();

		// Verify actual token content rendered — catches reactivity bugs
		// where the turn cards appear but the streamed text is missing.
		// mockComplete yields "[PersonaName] This is a mocked response..."
		await expect(page.getByText(/mocked response for E2E testing/i).first()).toBeVisible();

		await expect(page.getByRole('heading', { name: 'Synthesis' })).toBeVisible();
		await expect(page.getByRole('button', { name: /export markdown/i })).toBeVisible();
	});

	test('revisiting a completed table renders from DB without re-streaming', async ({ page }) => {
		const tableUrl = await runDeliberation(page, 'Historical view test');

		await page.goto('/');
		await page.goto(tableUrl);

		await expectMainText(page, 'Historical view test');
		await expect(page.getByRole('heading', { name: 'Synthesis' })).toBeVisible();
		await expect(page.getByText(/connecting to the council/i)).not.toBeVisible();
	});

	test('table appears in the home page list after completion', async ({ page }) => {
		const dilemma = 'Table list test ' + Date.now();
		await runDeliberation(page, dilemma);

		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Your tables' })).toBeVisible();
		await expect(page.getByText(dilemma)).toBeVisible();
	});

	test('markdown export downloads after completion', async ({ page }) => {
		await runDeliberation(page, 'Export test');

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: /export markdown/i }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/^table-.+\.md$/);
	});
});

test.describe('council management', () => {
	test('navigating to councils shows the list with persona chips', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Councils' }).click();

		await expect(page).toHaveURL('/councils');
		await expect(page.getByRole('heading', { name: 'Councils' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'The Default Council' })).toBeVisible();
		await expect(page.getByRole('button', { name: /🌿 The Elder/ })).toBeVisible();
		await expect(page.getByText('built-in').first()).toBeVisible();
	});

	test('clicking a persona chip expands its system prompt', async ({ page }) => {
		await page.goto('/councils');

		await page.getByRole('button', { name: /🌿 The Elder/ }).first().click();

		await expect(page.getByText(/60-year-old self|long life|patience for slow goods/i)).toBeVisible();
	});

	test('creating a custom council then deleting it', async ({ page }) => {
		await page.goto('/councils');
		await page.getByRole('button', { name: 'New council' }).click();

		const councilName = 'E2E Test Council ' + Date.now();
		await page.getByLabel('Name').fill(councilName);
		await page.getByRole('button', { name: /🌿 The Elder/ }).first().click();
		await page.getByRole('button', { name: /^Create$/ }).click();

		await expect(page.getByRole('heading', { name: councilName })).toBeVisible();

		const councilCard = page.locator('div').filter({ has: page.getByRole('heading', { name: councilName }) }).first();
		await councilCard.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByRole('heading', { name: councilName })).not.toBeVisible();
	});
});

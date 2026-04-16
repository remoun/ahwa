// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('deliberation flow', () => {
	test('home page shows dilemma form and council picker', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Set a table' })).toBeVisible();
		await expect(page.getByPlaceholder(/describe the decision/i)).toBeVisible();
		// Council picker should show the seeded councils
		await expect(page.getByRole('button', { name: /The Default Council/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /The Federation Council/ })).toBeVisible();
	});

	test('creating a table runs a full deliberation with streaming', async ({ page }) => {
		await page.goto('/');

		await page.getByPlaceholder(/describe the decision/i).fill('Should I take the new job?');
		await page.getByRole('button', { name: /^Set a table$/ }).click();

		// Should navigate to the table view
		await expect(page).toHaveURL(/\/t\/.+\?party=.+/);

		// Dilemma should render at the top
		await expect(page.getByText('Should I take the new job?')).toBeVisible();

		// Wait for deliberation to complete. Mock LLM produces labeled output
		// like "[Elder] This is a mocked response..." for each persona.
		await expect(page.getByText('Deliberation complete.')).toBeVisible({ timeout: 30_000 });

		// Should have rendered turns for all 5 default-council personas × 2 rounds = 10 turns,
		// plus synthesis. Check for a few persona names.
		await expect(page.getByText('The Elder').first()).toBeVisible();
		await expect(page.getByText('The Mirror').first()).toBeVisible();

		// Synthesis section should exist
		await expect(page.getByRole('heading', { name: 'Synthesis' })).toBeVisible();

		// Export button should appear when done
		await expect(page.getByRole('button', { name: /export markdown/i })).toBeVisible();
	});

	test('revisiting a completed table renders from DB without re-streaming', async ({ page }) => {
		// Create + complete a deliberation
		await page.goto('/');
		await page.getByPlaceholder(/describe the decision/i).fill('Historical view test');
		await page.getByRole('button', { name: /^Set a table$/ }).click();
		await expect(page.getByText('Deliberation complete.')).toBeVisible({ timeout: 30_000 });

		const tableUrl = page.url();

		// Navigate away and back
		await page.goto('/');
		await page.goto(tableUrl);

		// Should show historical data immediately — no "Connecting..."
		await expect(page.getByText('Historical view test')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Synthesis' })).toBeVisible();
		await expect(page.getByText(/connecting to the council/i)).not.toBeVisible();
	});

	test('table appears in the home page list after completion', async ({ page }) => {
		await page.goto('/');
		const dilemma = 'Table list test ' + Date.now();
		await page.getByPlaceholder(/describe the decision/i).fill(dilemma);
		await page.getByRole('button', { name: /^Set a table$/ }).click();
		await expect(page.getByText('Deliberation complete.')).toBeVisible({ timeout: 30_000 });

		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Your tables' })).toBeVisible();
		await expect(page.getByText(dilemma)).toBeVisible();
	});

	test('markdown export downloads after completion', async ({ page }) => {
		await page.goto('/');
		await page.getByPlaceholder(/describe the decision/i).fill('Export test');
		await page.getByRole('button', { name: /^Set a table$/ }).click();
		await expect(page.getByText('Deliberation complete.')).toBeVisible({ timeout: 30_000 });

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

		// Default council should be visible with its personas as chips
		await expect(page.getByRole('heading', { name: 'The Default Council' })).toBeVisible();
		await expect(page.getByRole('button', { name: /🌿 The Elder/ })).toBeVisible();

		// Seeded councils should be marked built-in
		await expect(page.getByText('built-in').first()).toBeVisible();
	});

	test('clicking a persona chip expands its system prompt', async ({ page }) => {
		await page.goto('/councils');

		await page.getByRole('button', { name: /🌿 The Elder/ }).first().click();

		// The expanded prompt should contain distinctive elder language
		await expect(page.getByText(/60-year-old self|long life|patience for slow goods/i)).toBeVisible();
	});

	test('creating a custom council then deleting it', async ({ page }) => {
		await page.goto('/councils');

		await page.getByRole('button', { name: 'New council' }).click();

		const councilName = 'E2E Test Council ' + Date.now();
		await page.getByLabel('Name').fill(councilName);

		// Select at least one persona
		await page.getByRole('button', { name: /🌿 The Elder/ }).first().click();

		await page.getByRole('button', { name: /^Create$/ }).click();

		// New council should appear in the list
		await expect(page.getByRole('heading', { name: councilName })).toBeVisible();

		// Find its delete button (seeded councils don't have one)
		const councilCard = page.locator('div').filter({ has: page.getByRole('heading', { name: councilName }) }).first();
		await councilCard.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByRole('heading', { name: councilName })).not.toBeVisible();
	});
});

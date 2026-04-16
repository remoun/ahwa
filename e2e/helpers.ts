// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, type Page } from '@playwright/test';

/** How long to wait for a full deliberation under the mock LLM. */
export const DELIBERATION_TIMEOUT = 30_000;

/**
 * Go to the home page, fill the dilemma, click "Set a table".
 * Returns the URL of the resulting table view.
 */
export async function createTable(page: Page, dilemma: string, councilName?: string): Promise<string> {
	await page.goto('/');
	await page.getByPlaceholder(/describe the decision/i).fill(dilemma);
	if (councilName) {
		await page.getByRole('button', { name: councilName }).click();
	}
	await page.getByRole('button', { name: /^Set a table$/ }).click();
	await expect(page).toHaveURL(/\/t\/.+\?party=.+/);
	return page.url();
}

/**
 * Wait for the "Deliberation complete." marker, which the UI shows after
 * the SSE stream closes cleanly.
 */
export async function waitForCompletion(page: Page) {
	await expect(page.getByText('Deliberation complete.')).toBeVisible({
		timeout: DELIBERATION_TIMEOUT
	});
}

/**
 * Create a table and wait for it to complete. Returns the table URL.
 */
export async function runDeliberation(page: Page, dilemma: string, councilName?: string): Promise<string> {
	const url = await createTable(page, dilemma, councilName);
	await waitForCompletion(page);
	return url;
}

/**
 * Scoped text assertion that ignores SvelteKit's aria-live announcer
 * (which duplicates the page title outside the main content).
 */
export async function expectMainText(page: Page, text: string | RegExp) {
	await expect(page.getByRole('main').getByText(text)).toBeVisible();
}

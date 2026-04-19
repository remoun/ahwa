// SPDX-License-Identifier: AGPL-3.0-or-later
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { DELIBERATION_TIMEOUT } from './helpers';

/**
 * Browser-driven multi-party flow with isolated contexts per party so
 * cookies + locals.party identity don't leak between sessions. Catches
 * the bits the API spec can't see: stance editor, invite copy, reveal
 * buttons, synthesize button, viewer-scoped turn replay.
 */

async function createMediationTable(page: Page, dilemma: string) {
	await page.goto('/');
	await page.getByPlaceholder(/describe the decision/i).fill(dilemma);
	await page.getByRole('checkbox', { name: /Mediation mode/i }).check();
	await page.getByRole('button', { name: /^Set the table$/ }).click();
	await expect(page).toHaveURL(/\/t\/.+\?party=.+&compose=1/);
}

async function fillStanceAndRun(page: Page, stance: string) {
	await page.getByLabel(/Your stance/i).fill(stance);
	await page.getByRole('button', { name: /Save & run my council/i }).click();
	await expect(page.getByText(/Deliberation complete\.|Your council has finished/i)).toBeVisible({
		timeout: DELIBERATION_TIMEOUT
	});
}

async function copyInviteUrl(page: Page, context: BrowserContext): Promise<string> {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: /Invite someone/i }).click();
	const inviteUrl = await page.getByLabel(/Share this link/i).inputValue();
	expect(inviteUrl).toMatch(/\/t\/.+\?party=.+&token=/);
	return inviteUrl;
}

test.describe('multi-party UI', () => {
	test('two parties: invite → stances → both run → synthesize', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();

		// Alice: create mediation table, set her stance, invite bob.
		await createMediationTable(aliceTab, 'Should we move in together?');
		await aliceTab.getByLabel(/Your stance/i).fill('Yes — feels grounded.');
		await aliceTab.getByRole('button', { name: /^Save draft$/ }).click();
		const inviteUrl = await copyInviteUrl(aliceTab, aliceCtx);

		// Bob opens the invite in a fresh context.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(inviteUrl);
		await expect(bobTab.getByRole('heading', { name: /Your seat at the table/i })).toBeVisible();

		// Bob writes a stance + runs his council.
		await fillStanceAndRun(bobTab, "I'm hesitant — it's a big step.");

		// Alice goes back and runs her council.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: /Save & run my council/i }).click();
		await expect(aliceTab.getByText(/Your council has finished/i)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Synthesize from alice's tab. Page reloads on success.
		await aliceTab.getByRole('button', { name: /^Synthesize this deliberation$/ }).click();
		await expect(aliceTab.getByRole('heading', { name: 'Synthesis' })).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Bob reloads — synthesis is visible to him too.
		await bobTab.reload();
		await expect(bobTab.getByRole('heading', { name: 'Synthesis' })).toBeVisible();

		await aliceCtx.close();
		await bobCtx.close();
	});

	test("invitee never sees the initiator's private turns before reveal", async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Visibility check');
		await aliceTab.getByLabel(/Your stance/i).fill('alice POV: distinct text TURN-A-PRIVATE');
		await aliceTab.getByRole('button', { name: /^Save draft$/ }).click();
		const inviteUrl = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice runs her council.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: /Save & run my council/i }).click();
		await expect(aliceTab.getByText(/Your council has finished/i)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Bob opens the link — he should see his stance editor but NONE
		// of alice's turns. Mock LLM yields predictable text.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(inviteUrl);
		await expect(bobTab.getByRole('heading', { name: /Your seat at the table/i })).toBeVisible();
		await expect(bobTab.getByText('TURN-A-PRIVATE')).not.toBeVisible();
		// Mock LLM emits "mocked response for E2E testing" in every persona
		// turn. Alice's turns shouldn't be on bob's page.
		await expect(bobTab.getByText(/mocked response for E2E testing/i)).not.toBeVisible();

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('three parties: synthesize button only enables when all three are done', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, '3-way mediation');
		await aliceTab.getByLabel(/Your stance/i).fill('A');
		await aliceTab.getByRole('button', { name: /^Save draft$/ }).click();

		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);
		// Second invite click after closing the first share-URL state — reload
		// makes the invite button reappear (otherwise it stays in URL-shown state).
		await aliceTab.reload();
		const carolInvite = await copyInviteUrl(aliceTab, aliceCtx);
		expect(bobInvite).not.toBe(carolInvite);

		// Bob + Carol set stances and run.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await fillStanceAndRun(bobTab, 'B');

		const carolCtx = await browser.newContext();
		const carolTab = await carolCtx.newPage();
		await carolTab.goto(carolInvite);
		await fillStanceAndRun(carolTab, 'C');

		// Alice still hasn't run — synthesize button must NOT be visible
		// (the "all parties done" gate hides it).
		await aliceTab.reload();
		await expect(
			aliceTab.getByRole('button', { name: /^Synthesize this deliberation$/ })
		).not.toBeVisible();

		// Alice runs → synthesize button now appears → click it.
		await aliceTab.getByRole('button', { name: /Save & run my council/i }).click();
		await expect(aliceTab.getByText(/Your council has finished/i)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});
		await expect(
			aliceTab.getByRole('button', { name: /^Synthesize this deliberation$/ })
		).toBeVisible();

		await aliceCtx.close();
		await bobCtx.close();
		await carolCtx.close();
	});

	test('live broadcast: bob writing a stance updates alice without reload', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Live broadcast test');
		await aliceTab.getByLabel(/Your stance/i).fill('A');
		await aliceTab.getByRole('button', { name: /^Save draft$/ }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice sees bob's row in the parties list (via the local invite
		// onChange invalidate). Bob is "drafting" — no stance yet.
		await expect(aliceTab.getByText('drafting').first()).toBeVisible();

		// Bob writes a stance. Alice's tab is still open — no manual
		// reload — and should pick up bob's stance via the bus.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await bobTab.getByLabel(/Your stance/i).fill('B');
		await bobTab.getByRole('button', { name: /^Save draft$/ }).click();

		// Alice's "drafting" badge flips to "stance ✓" within a few
		// seconds (bus event → invalidateAll → page-server reload).
		await expect(aliceTab.getByText(/stance ✓/i).first()).toBeVisible({ timeout: 10_000 });

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('live broadcast: alice synthesizing closes the table on bob without reload', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Live synth test');
		await aliceTab.getByLabel(/Your stance/i).fill('A');
		await aliceTab.getByRole('button', { name: /^Save draft$/ }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await fillStanceAndRun(bobTab, 'B');
		await expect(bobTab.getByRole('heading', { name: 'Synthesis' })).not.toBeVisible();

		// Alice runs.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: /Save & run my council/i }).click();
		await expect(aliceTab.getByText(/Your council has finished/i)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});
		// Alice triggers synthesis.
		await aliceTab.getByRole('button', { name: /^Synthesize this deliberation$/ }).click();

		// Bob's still-open tab picks up table_synthesized via the bus and
		// re-renders with the synthesis heading visible.
		await expect(bobTab.getByRole('heading', { name: 'Synthesis' })).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('reveal button shares one of own turns with the other party', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Reveal test');
		await aliceTab.getByLabel(/Your stance/i).fill('A');
		await aliceTab.getByRole('button', { name: /^Save draft$/ }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice runs first so she has historical turns to reveal.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: /Save & run my council/i }).click();
		await expect(aliceTab.getByText(/Your council has finished/i)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Page reloads alice into the post-run view. Reveal button on the
		// first historical turn.
		const revealBtn = aliceTab.getByRole('button', { name: /^Reveal to /i }).first();
		await expect(revealBtn).toBeVisible();
		await revealBtn.click();
		// On reload the same turn now shows "Shared with <party>".
		await expect(aliceTab.getByText(/Shared with /i).first()).toBeVisible();

		// Bob opens the link — he can now see at least one of alice's
		// persona turns (the revealed one). Mock LLM emits the "mocked
		// response" marker in every persona turn.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await expect(bobTab.getByText(/mocked response for E2E testing/i).first()).toBeVisible();

		await aliceCtx.close();
		await bobCtx.close();
	});
});

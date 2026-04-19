// SPDX-License-Identifier: AGPL-3.0-or-later
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { Labels } from '../src/lib/labels';
import { DELIBERATION_TIMEOUT } from './helpers';

/**
 * Build a case-insensitive regex that matches any of several literals
 * (escaped + `|`-joined). For single-string matches, Playwright's
 * default behavior already does case-insensitive substring on plain
 * strings — pass the bare string and skip this helper.
 */
function rx(...literals: string[]): RegExp {
	const escaped = literals.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(escaped.join('|'), 'i');
}

/**
 * Browser-driven multi-party flow with isolated contexts per party so
 * cookies + locals.party identity don't leak between sessions. Catches
 * the bits the API spec can't see: stance editor, invite copy, reveal
 * buttons, synthesize button, viewer-scoped turn replay.
 */

async function createMediationTable(page: Page, dilemma: string) {
	await page.goto('/');
	await page.getByPlaceholder(/describe the decision/i).fill(dilemma);
	await page.getByRole('checkbox', { name: Labels.mediationCheckbox }).check();
	await page.getByRole('button', { name: Labels.setTableMediation, exact: true }).click();
	await expect(page).toHaveURL(/\/t\/.+\?party=.+&compose=1/);
}

async function fillStanceAndRun(page: Page, stance: string) {
	await page.getByLabel(Labels.stanceLabel).fill(stance);
	await page.getByRole('button', { name: Labels.saveAndRun }).click();
	// Either marker is acceptable — single-party shows "Deliberation
	// complete." (table.status flips to completed); multi-party stops
	// at "Your council has finished" (waiting on others before synth).
	await expect(page.getByText(rx(Labels.deliberationComplete, Labels.councilFinished))).toBeVisible(
		{ timeout: DELIBERATION_TIMEOUT }
	);
}

async function copyInviteUrl(page: Page, context: BrowserContext): Promise<string> {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: Labels.inviteButton }).click();
	const inviteUrl = await page.getByLabel(Labels.shareLinkLabel).inputValue();
	expect(inviteUrl).toMatch(/\/t\/.+\?party=.+&token=/);
	return inviteUrl;
}

test.describe('multi-party UI', () => {
	test('two parties: invite → stances → both run → synthesize', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();

		// Alice: create mediation table, set her stance, invite bob.
		await createMediationTable(aliceTab, 'Should we move in together?');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('Yes — feels grounded.');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const inviteUrl = await copyInviteUrl(aliceTab, aliceCtx);

		// Bob opens the invite in a fresh context.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(inviteUrl);
		await expect(bobTab.getByRole('heading', { name: Labels.seatHeading })).toBeVisible();

		// Bob writes a stance + runs his council.
		await fillStanceAndRun(bobTab, "I'm hesitant — it's a big step.");

		// Alice goes back and runs her council.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Synthesize from alice's tab. Page reloads on success.
		await aliceTab.getByRole('button', { name: Labels.synthesizeButton, exact: true }).click();
		await expect(
			aliceTab.getByRole('heading', { name: Labels.synthesisHeading, exact: true })
		).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Bob reloads — synthesis is visible to him too.
		await bobTab.reload();
		await expect(
			bobTab.getByRole('heading', { name: Labels.synthesisHeading, exact: true })
		).toBeVisible();

		await aliceCtx.close();
		await bobCtx.close();
	});

	test("invitee never sees the initiator's private turns before reveal", async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Visibility check');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('alice POV: distinct text TURN-A-PRIVATE');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const inviteUrl = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice runs her council.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Bob opens the link — he should see his stance editor but NONE
		// of alice's turns. Mock LLM yields predictable text.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(inviteUrl);
		await expect(bobTab.getByRole('heading', { name: Labels.seatHeading })).toBeVisible();
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
		await aliceTab.getByLabel(Labels.stanceLabel).fill('A');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();

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
			aliceTab.getByRole('button', { name: Labels.synthesizeButton, exact: true })
		).not.toBeVisible();

		// Alice runs → synthesize button now appears → click it.
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});
		await expect(
			aliceTab.getByRole('button', { name: Labels.synthesizeButton, exact: true })
		).toBeVisible();

		await aliceCtx.close();
		await bobCtx.close();
		await carolCtx.close();
	});

	test('live broadcast: bob writing a stance updates alice without reload', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Live broadcast test');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('A');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice sees bob's row in the parties list (via the local invite
		// onChange invalidate). Bob is "drafting" — no stance yet.
		await expect(aliceTab.getByText('drafting').first()).toBeVisible();

		// Bob writes a stance. Alice's tab is still open — no manual
		// reload — and should pick up bob's stance via the bus.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await bobTab.getByLabel(Labels.stanceLabel).fill('B');
		await bobTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();

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
		await aliceTab.getByLabel(Labels.stanceLabel).fill('A');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await fillStanceAndRun(bobTab, 'B');
		await expect(
			bobTab.getByRole('heading', { name: Labels.synthesisHeading, exact: true })
		).not.toBeVisible();

		// Alice runs.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});
		// Alice triggers synthesis.
		await aliceTab.getByRole('button', { name: Labels.synthesizeButton, exact: true }).click();

		// Bob's still-open tab picks up table_synthesized via the bus and
		// re-renders with the synthesis heading visible.
		await expect(
			bobTab.getByRole('heading', { name: Labels.synthesisHeading, exact: true })
		).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('reveal button shares one of own turns with the other party', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Reveal test');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('A');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice runs first so she has historical turns to reveal.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Page reloads alice into the post-run view. Reveal button on the
		// first historical turn.
		const revealBtn = aliceTab.getByRole('button', { name: Labels.revealToPrefix }).first();
		await expect(revealBtn).toBeVisible();
		await revealBtn.click();
		// On reload the same turn now shows "Shared with <party>".
		await expect(aliceTab.getByText(Labels.sharedWithPrefix).first()).toBeVisible();

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

	test('uncommit & re-edit: alice runs, uncommits, edits stance, runs again', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Uncommit flow');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('first take');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		await copyInviteUrl(aliceTab, aliceCtx); // make it multi-party so synth is deferred

		// Run with the first stance.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Uncommit. Editor should reappear with the previous stance prefilled.
		await aliceTab.getByRole('button', { name: /uncommit & edit/i }).click();
		await expect(aliceTab.getByLabel(Labels.stanceLabel)).toBeVisible({ timeout: 5_000 });
		await expect(aliceTab.getByLabel(Labels.stanceLabel)).toHaveValue('first take');

		// Edit + re-run.
		await aliceTab.getByLabel(Labels.stanceLabel).fill('revised take');
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		await aliceCtx.close();
	});

	test('live broadcast: alice revealing a turn surfaces it on bob without reload', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Live reveal test');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('A');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		// Alice runs first.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Bob opens the link and sees no persona turns yet (alice's are private).
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await expect(bobTab.getByText(/mocked response for E2E testing/i)).not.toBeVisible();

		// Alice reveals her first turn — bob's tab should pick up the
		// turn_revealed event via the bus and re-render with that turn
		// visible. No reload on bob's side.
		await aliceTab.getByRole('button', { name: Labels.revealToPrefix }).first().click();
		await expect(bobTab.getByText(/mocked response for E2E testing/i).first()).toBeVisible({
			timeout: 10_000
		});

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('per-party failure: alice errors via [MOCK_FAIL], badge + errorMessage shown, recovery via uncommit', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Failure recovery test');
		// [MOCK_FAIL] in the stance is what the council prompt forwards
		// to the LLM as user message — the mock LLM throws on it.
		await aliceTab.getByLabel(Labels.stanceLabel).fill('[MOCK_FAIL] please fail');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		await copyInviteUrl(aliceTab, aliceCtx);

		// Run — expected to fail.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.runFailed)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});
		// Per-party errorMessage surfaced in the badge area.
		await expect(aliceTab.getByText(/Mock LLM failure injected/i).first()).toBeVisible();

		// Recover via uncommit — should reset to a writable stance editor.
		await aliceTab.getByRole('button', { name: Labels.resetAndTryAgain }).click();
		await expect(aliceTab.getByLabel(Labels.stanceLabel)).toBeVisible({ timeout: 5_000 });

		// Edit + re-run with a passing stance.
		await aliceTab.getByLabel(Labels.stanceLabel).fill('clean re-attempt');
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		await aliceCtx.close();
	});

	test('concurrent runs: alice and bob start at the same time, both complete', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Concurrent runs');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('A');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		await bobTab.getByLabel(Labels.stanceLabel).fill('B');
		await bobTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();

		// Navigate alice off compose mode so the "run my council" path
		// is the same shape as bob's.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));

		// Fire both runs in parallel via Promise.all on the click events.
		// The per-party gate is row-scoped (table_parties.run_status
		// atomic claim), so A's claim must not block B's. If gating were
		// table-scoped, one party would 409.
		await Promise.all([
			aliceTab.getByRole('button', { name: Labels.saveAndRun }).click(),
			bobTab.getByRole('button', { name: Labels.saveAndRun }).click()
		]);

		await Promise.all([
			expect(aliceTab.getByText(Labels.councilFinished)).toBeVisible({
				timeout: DELIBERATION_TIMEOUT
			}),
			expect(bobTab.getByText(Labels.councilFinished)).toBeVisible({
				timeout: DELIBERATION_TIMEOUT
			})
		]);

		await aliceCtx.close();
		await bobCtx.close();
	});

	test('live broadcast: bob seeing alice fail mid-run picks up party_run_failed', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const aliceTab = await aliceCtx.newPage();
		await createMediationTable(aliceTab, 'Live failure test');
		await aliceTab.getByLabel(Labels.stanceLabel).fill('[MOCK_FAIL] failing stance');
		await aliceTab.getByRole('button', { name: Labels.saveDraft, exact: true }).click();
		const bobInvite = await copyInviteUrl(aliceTab, aliceCtx);

		// Bob opens the link and sees alice in 'pending' state.
		const bobCtx = await browser.newContext();
		const bobTab = await bobCtx.newPage();
		await bobTab.goto(bobInvite);
		// Alice's badge should be visible (other-party row).
		await expect(bobTab.locator('text=initiator').first()).toBeVisible();

		// Alice runs and fails.
		await aliceTab.goto(aliceTab.url().replace(/&compose=1/, ''));
		await aliceTab.getByRole('button', { name: Labels.saveAndRun }).click();
		await expect(aliceTab.getByText(Labels.runFailed)).toBeVisible({
			timeout: DELIBERATION_TIMEOUT
		});

		// Bob's tab — still open — picks up party_run_failed event;
		// alice's badge in his other-parties list flips to 'failed'.
		await expect(bobTab.locator('text=failed').first()).toBeVisible({ timeout: 10_000 });

		await aliceCtx.close();
		await bobCtx.close();
	});
});

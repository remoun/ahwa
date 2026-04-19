// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Single source of truth for user-visible UI strings that have e2e
 * tests asserting against them. Imported by both Svelte components
 * and Playwright specs so a copy edit doesn't silently break tests
 * (or worse, leave tests passing against a label that no longer
 * appears in the UI).
 *
 * Strings here are still localizable later — i18n would replace this
 * module's exports with `t('stance.label')` lookups. Until then,
 * one place to grep beats text duplicated across 6 files.
 */

export const Labels = {
	// AppHome (table creation form)
	mediationCheckbox: 'Mediation mode',
	setTableSolo: 'Set a table',
	setTableMediation: 'Set the table',

	// MultiPartyControls
	seatHeading: 'Your seat at the table',
	stanceLabel: 'Your stance / framing',
	saveDraft: 'Save draft',
	saveAndRun: 'Save & run my council',
	uncommit: 'uncommit & edit',
	resetAndTryAgain: 'Reset and try again',
	councilFinished: 'Your council has finished',
	runFailed: 'Your run failed',
	inviteButton: '+ Invite someone to this table',
	shareLinkLabel: 'Share this link with the other party',
	synthesizeButton: 'Synthesize this deliberation',
	stanceReady: 'stance ✓',
	stanceDrafting: 'drafting',

	// Page-level
	deliberationComplete: 'Deliberation complete.',
	synthesisHeading: 'Synthesis',

	// Reveal control
	revealToPrefix: 'Reveal to ',
	sharedWithPrefix: 'Shared with '
} as const;

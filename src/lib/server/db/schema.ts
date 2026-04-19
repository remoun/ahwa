// SPDX-License-Identifier: AGPL-3.0-or-later
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { ModelConfig, RoundStructure } from '../../schemas/council';

export const parties = sqliteTable('parties', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	displayName: text('display_name'),
	// External identity ID (e.g. SSOwat user). Nullable for the legacy
	// "me" party and any party created without an SSO identity. Unique so
	// repeat requests for the same external user resolve to the same row.
	externalId: text('external_id').unique(),
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const tables = sqliteTable('tables', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	title: text('title'),
	dilemma: text('dilemma'),
	councilId: text('council_id'),
	status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).default(
		'pending'
	),
	synthesis: text('synthesis'),
	errorMessage: text('error_message'),
	isDemo: integer('is_demo').default(0),
	// Optional per-table override of the council's round count. Null
	// uses the council's roundStructure as-is. When N exceeds the
	// council's defined rounds, the orchestrator repeats the last
	// round's prompt for the remainder — councils define round shape;
	// the operator decides depth.
	maxRounds: integer('max_rounds'),
	createdAt: integer('created_at').$defaultFn(() => Date.now()),
	updatedAt: integer('updated_at').$defaultFn(() => Date.now())
});

export const tableParties = sqliteTable(
	'table_parties',
	{
		tableId: text('table_id').notNull(),
		partyId: text('party_id').notNull(),
		role: text('role', { enum: ['initiator', 'invited'] }),
		// Per-party deliberation lifecycle. In multi-party tables each
		// party runs the council independently — gating on tables.status
		// would let A's run block B's. The atomic claim happens here.
		// Single-party tables track tables.status 1:1.
		runStatus: text('run_status', {
			enum: ['pending', 'running', 'completed', 'failed']
		}).default('pending'),
		// The party's framing/POV for the dilemma — markdown. Distinct
		// from tables.dilemma (which is the shared situation). Council
		// reads this as the party's opening message so personas
		// deliberate from this party's standpoint, not a neutral one.
		// Empty/null = not yet authored; run gating refuses to start.
		stance: text('stance')
	},
	(t) => [primaryKey({ columns: [t.tableId, t.partyId] })]
);

export const turns = sqliteTable('turns', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	tableId: text('table_id').notNull(),
	round: integer('round').notNull(),
	partyId: text('party_id'),
	personaName: text('persona_name'),
	text: text('text'),
	// JSON array of party_ids — Drizzle auto-parses on read and stringifies
	// on write via mode:'json'.
	visibleTo: text('visible_to', { mode: 'json' }).$type<string[]>(),
	// 1 if the LLM hit maxOutputTokens and the text was cut off — the
	// persisted text is incomplete. Ops can see this on reload without
	// re-running the deliberation.
	truncated: integer('truncated').default(0),
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const personas = sqliteTable('personas', {
	id: text('id').primaryKey(),
	name: text('name'),
	emoji: text('emoji'),
	// User-facing one-liner shown in council pickers and detail views.
	// Distinct from system_prompt (which is what the LLM sees).
	description: text('description'),
	systemPrompt: text('system_prompt'),
	requires: text('requires', { mode: 'json' }).$type<string[]>(),
	ownerParty: text('owner_party'),
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const councils = sqliteTable('councils', {
	id: text('id').primaryKey(),
	name: text('name'),
	description: text('description'),
	personaIds: text('persona_ids', { mode: 'json' }).$type<string[]>(),
	synthesisPrompt: text('synthesis_prompt'),
	roundStructure: text('round_structure', { mode: 'json' }).$type<RoundStructure>(),
	modelConfig: text('model_config', { mode: 'json' }).$type<ModelConfig>(),
	ownerParty: text('owner_party'),
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const memory = sqliteTable('memory', {
	partyId: text('party_id').primaryKey(),
	content: text('content'),
	updatedAt: integer('updated_at').$defaultFn(() => Date.now())
});

/**
 * Per-day demo-mode token + cost accounting. Primary key is the UTC
 * date (YYYY-MM-DD) so a single row accumulates across all demo
 * activity that day, and the bookkeeping resets at midnight UTC by
 * inserting a fresh row on the first demo of the new day.
 *
 * costMicroUsd is a soft estimate (per-million-token average) for
 * observability; the cap that's actually enforced is on tokens.
 */
export const demoUsage = sqliteTable('demo_usage', {
	dateUtc: text('date_utc').primaryKey(),
	tokens: integer('tokens').notNull().default(0),
	costMicroUsd: integer('cost_micro_usd').notNull().default(0),
	updatedAt: integer('updated_at').$defaultFn(() => Date.now())
});

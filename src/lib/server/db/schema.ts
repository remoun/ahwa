// SPDX-License-Identifier: AGPL-3.0-or-later
import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const parties = sqliteTable('parties', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	displayName: text('display_name'),
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
	createdAt: integer('created_at').$defaultFn(() => Date.now()),
	updatedAt: integer('updated_at').$defaultFn(() => Date.now())
});

export const tableParties = sqliteTable(
	'table_parties',
	{
		tableId: text('table_id').notNull(),
		partyId: text('party_id').notNull(),
		role: text('role', { enum: ['initiator', 'invited'] })
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
	visibleTo: text('visible_to'), // JSON array of party_ids
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const personas = sqliteTable('personas', {
	id: text('id').primaryKey(),
	name: text('name'),
	emoji: text('emoji'),
	systemPrompt: text('system_prompt'),
	requires: text('requires'), // JSON array of required features
	ownerParty: text('owner_party'),
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const councils = sqliteTable('councils', {
	id: text('id').primaryKey(),
	name: text('name'),
	personaIds: text('persona_ids'), // JSON array
	synthesisPrompt: text('synthesis_prompt'),
	roundStructure: text('round_structure'), // JSON
	modelConfig: text('model_config'), // JSON: { provider, model }
	ownerParty: text('owner_party'),
	createdAt: integer('created_at').$defaultFn(() => Date.now())
});

export const memory = sqliteTable('memory', {
	partyId: text('party_id').primaryKey(),
	content: text('content'),
	updatedAt: integer('updated_at').$defaultFn(() => Date.now())
});

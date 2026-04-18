// SPDX-License-Identifier: AGPL-3.0-or-later
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';
import type { ZodType } from 'zod';

import { getDb } from './db';

export interface CrudConfig {
	/** The Drizzle table definition */
	table: SQLiteTableWithColumns<any>;
	/** Zod schema for validating create/update request bodies */
	bodySchema: ZodType;
	/** Function to transform a validated body into DB insert values */
	toValues: (body: any, id: string) => Record<string, any>;
	/** Function to transform a validated body into DB update values */
	toUpdateValues: (body: any) => Record<string, any>;
	/** Check before delete — return error string or null */
	canDelete?: (id: string) => string | null;
}

/** Create a list handler (GET) */
export function listHandler(config: CrudConfig) {
	return async () => {
		const rows = getDb().select().from(config.table).all();
		return json(rows);
	};
}

/** Create a get-by-id handler (GET /:id) */
export function getHandler(config: CrudConfig) {
	return async ({ params }: { params: { id: string } }) => {
		const row = getDb()
			.select()
			.from(config.table)
			.where(eq((config.table as any).id, params.id))
			.get();

		if (!row) {
			return json({ error: 'Not found' }, { status: 404 });
		}

		return json(row);
	};
}

/** Create a create handler (POST) */
export function createHandler(config: CrudConfig) {
	return async ({ request }: { request: Request }) => {
		const body = await request.json();
		const result = config.bodySchema.safeParse(body);

		if (!result.success) {
			return json({ error: 'Validation failed', details: result.error.issues }, { status: 400 });
		}

		const id = nanoid();
		const values = config.toValues(result.data, id);

		getDb().insert(config.table).values(values).run();

		return json({ id, ...values }, { status: 201 });
	};
}

/** Create an update handler (PUT /:id) */
export function updateHandler(config: CrudConfig) {
	return async ({ params, request }: { params: { id: string }; request: Request }) => {
		const existing = getDb()
			.select()
			.from(config.table)
			.where(eq((config.table as any).id, params.id))
			.get();

		if (!existing) {
			return json({ error: 'Not found' }, { status: 404 });
		}

		// Seeded entities (ownerParty is null) are read-only
		if ((existing as any).ownerParty === null) {
			return json({ error: 'Cannot modify a seeded entity' }, { status: 403 });
		}

		const body = await request.json();
		const result = config.bodySchema.safeParse(body);

		if (!result.success) {
			return json({ error: 'Validation failed', details: result.error.issues }, { status: 400 });
		}

		const values = config.toUpdateValues(result.data);
		getDb()
			.update(config.table)
			.set(values)
			.where(eq((config.table as any).id, params.id))
			.run();

		return json({ id: params.id, ...values });
	};
}

/** Create a delete handler (DELETE /:id) */
export function deleteHandler(config: CrudConfig) {
	return async ({ params }: { params: { id: string } }) => {
		const existing = getDb()
			.select()
			.from(config.table)
			.where(eq((config.table as any).id, params.id))
			.get();

		if (!existing) {
			return json({ error: 'Not found' }, { status: 404 });
		}

		// Seeded entities (ownerParty is null) are read-only
		if ((existing as any).ownerParty === null) {
			return json({ error: 'Cannot delete a seeded entity' }, { status: 403 });
		}

		// Check for references
		if (config.canDelete) {
			const error = config.canDelete(params.id);
			if (error) {
				return json({ error }, { status: 409 });
			}
		}

		getDb()
			.delete(config.table)
			.where(eq((config.table as any).id, params.id))
			.run();

		return json({ deleted: true });
	};
}

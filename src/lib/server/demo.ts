// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from './db/schema';
import { signShareToken } from './share';

type Db = BunSQLiteDatabase<typeof schema>;

/**
 * Hard cap on demo dilemma length. Demos are pinned to a cheap model
 * (see councils/demo.json), share an IP rate limit, and burn against a
 * daily token budget. Long inputs amplify all three costs without
 * adding signal — for "try the tool" use cases, a paragraph or two is
 * plenty.
 */
export const MAX_DEMO_DILEMMA_LEN = 1000;

/** Council id used for every demo table. Pinned, not caller-selectable. */
export const DEMO_COUNCIL_ID = 'demo';

export interface CreateDemoTableInput {
	db: Db;
	dilemma: string;
}

export interface CreateDemoTableResult {
	tableId: string;
	partyId: string;
	token: string;
}

/**
 * Create a demo table — invariant #11 in code:
 * - is_demo=1 so the table is excluded from owned-table queries and
 *   eligible for TTL cleanup
 * - pinned to the cheap demo council (no caller-supplied council)
 * - fresh anonymous party (not the singleton "me", no SSO identity)
 * - signed share token so the demo URL can be shared without leaking
 *   other tables' partyIds
 *
 * Throws (without writing to the DB) if the dilemma is empty, too long,
 * or the demo council isn't installed.
 */
export function createDemoTable({ db, dilemma }: CreateDemoTableInput): CreateDemoTableResult {
	const trimmed = dilemma?.trim() ?? '';
	if (!trimmed) throw new Error('dilemma is required');
	if (trimmed.length > MAX_DEMO_DILEMMA_LEN) {
		throw new Error(`dilemma too long (max ${MAX_DEMO_DILEMMA_LEN} chars)`);
	}

	const council = db
		.select()
		.from(schema.councils)
		.where(eq(schema.councils.id, DEMO_COUNCIL_ID))
		.get();
	if (!council) {
		throw new Error(`demo council "${DEMO_COUNCIL_ID}" is not installed`);
	}

	const partyId = nanoid();
	db.insert(schema.parties).values({ id: partyId, displayName: 'demo' }).run();

	const tableId = nanoid();
	db.insert(schema.tables)
		.values({
			id: tableId,
			dilemma: trimmed,
			councilId: DEMO_COUNCIL_ID,
			status: 'pending',
			isDemo: 1
		})
		.run();

	db.insert(schema.tableParties).values({ tableId, partyId, role: 'initiator' }).run();

	return { tableId, partyId, token: signShareToken(tableId, partyId) };
}

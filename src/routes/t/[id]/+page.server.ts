// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, inArray } from 'drizzle-orm';

import { attachPersonaMeta } from '$lib/server/councils';
import { getDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { loadOrFail } from '$lib/server/load';
import { verifyShareToken } from '$lib/server/share';
import { visibleTurns } from '$lib/server/visibility';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, locals }) =>
	loadOrFail('t/[id]', () => {
		const tableId = params.id;
		const urlParty = url.searchParams.get('party') ?? '';
		const token = url.searchParams.get('token') ?? '';

		const db = getDb();
		const table = db.select().from(schema.tables).where(eq(schema.tables.id, tableId)).get();

		// Viewer resolution: a verified ?party=X&token=Y wins (invitee
		// flow); else fall back to the request's identity. Filtering
		// by viewer keeps an invitee from seeing the initiator's
		// private turns on reload — invariant #8 at the page layer.
		const tokenVerified = !!urlParty && verifyShareToken(tableId, urlParty, token);
		const viewerPartyId = tokenVerified ? urlParty : locals.party.id;

		// Echo the SAME identity to the client so the SSE GET / mutation
		// calls use the resolved viewer — never the unverified urlParty,
		// which would otherwise mismatch the server's filtering and the
		// SSE guard would 403 the start-run anyway.
		const partyId = viewerPartyId;

		if (!table) {
			return {
				tableId,
				partyId,
				token,
				table: null,
				turns: [],
				council: null,
				viewerPartyId,
				parties: []
			};
		}

		// Multi-party UI needs to know all party slots and their states
		// (not just the viewer's). Stances of OTHER parties stay hidden
		// until the table is fully synthesized — until then each party's
		// framing is private. Once synthesized, stances become readable
		// alongside the synthesizer's output.
		const allLinks = db
			.select()
			.from(schema.tableParties)
			.where(eq(schema.tableParties.tableId, tableId))
			.all();
		const parties = allLinks.map((l) => ({
			partyId: l.partyId,
			role: l.role,
			runStatus: l.runStatus,
			// Only expose this party's stance if it's the viewer's own
			// stance, or the table is already synthesized.
			stance:
				l.partyId === viewerPartyId || table.status === 'completed' ? (l.stance ?? null) : null
		}));

		const rawTurns = visibleTurns(db, tableId, viewerPartyId);

		const council = table.councilId
			? db.select().from(schema.councils).where(eq(schema.councils.id, table.councilId)).get()
			: null;

		const personaIds: string[] = council?.personaIds ?? [];
		const personas = personaIds.length
			? db.select().from(schema.personas).where(inArray(schema.personas.id, personaIds)).all()
			: [];
		const turns = attachPersonaMeta(rawTurns, personas);

		const personaMeta: Record<string, string> = {};
		for (const p of personas) {
			if (p.name && p.description) personaMeta[p.name] = p.description;
		}

		return {
			tableId,
			partyId,
			token,
			table,
			turns,
			council,
			personaMeta,
			viewerPartyId,
			parties
		};
	});

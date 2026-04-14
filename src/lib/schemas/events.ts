// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

const TableOpened = z.object({
	type: z.literal('table_opened'),
	tableId: z.string()
});

const RoundStarted = z.object({
	type: z.literal('round_started'),
	round: z.number(),
	kind: z.string()
});

const PersonaTurnStarted = z.object({
	type: z.literal('persona_turn_started'),
	personaId: z.string(),
	personaName: z.string(),
	emoji: z.string()
});

const Token = z.object({
	type: z.literal('token'),
	personaId: z.string(),
	text: z.string()
});

const PersonaTurnCompleted = z.object({
	type: z.literal('persona_turn_completed'),
	personaId: z.string()
});

const SynthesisStarted = z.object({
	type: z.literal('synthesis_started')
});

const SynthesisToken = z.object({
	type: z.literal('synthesis_token'),
	text: z.string()
});

const TableClosed = z.object({
	type: z.literal('table_closed')
});

const ErrorEvent = z.object({
	type: z.literal('error'),
	message: z.string()
});

export const SseEventSchema = z.discriminatedUnion('type', [
	TableOpened,
	RoundStarted,
	PersonaTurnStarted,
	Token,
	PersonaTurnCompleted,
	SynthesisStarted,
	SynthesisToken,
	TableClosed,
	ErrorEvent
]);

export type SseEvent = z.infer<typeof SseEventSchema>;

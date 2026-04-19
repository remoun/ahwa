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
	type: z.literal('table_closed'),
	// Sum of totalTokens reported by every completeFn call in the
	// deliberation (rounds + synthesis). Optional because mocks /
	// providers without usage info return undefined per call; the
	// orchestrator yields totalTokens only when ALL calls reported usage.
	totalTokens: z.number().optional()
});

const ErrorEvent = z.object({
	type: z.literal('error'),
	message: z.string()
});

const ConsensusChecked = z.object({
	type: z.literal('consensus_checked'),
	verdict: z.enum(['consensus', 'continue']),
	reason: z.string()
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
	ErrorEvent,
	ConsensusChecked
]);

export type SseEvent = z.infer<typeof SseEventSchema>;

/**
 * Sparse state events broadcast on the table bus. Subscribers (other
 * party tabs) react to these by invalidating their SvelteKit page data
 * so the next render shows fresh state. The events carry only the
 * minimum needed to know "something changed for this party" — no
 * stance text, no token streams. Visibility-sensitive details ride on
 * the page-server reload, which already enforces visible_to.
 *
 * Event types map to the user-visible state transitions:
 * - `party_joined` — new invitee row added
 * - `party_stance_set` — a party authored or edited their stance
 * - `party_run_started` / `party_run_completed` / `party_run_failed`
 * - `turn_revealed` — `visible_to` mutated; recipient should re-render
 * - `table_synthesized` — terminal state
 */
const PartyJoined = z.object({
	type: z.literal('party_joined'),
	partyId: z.string()
});
const PartyStanceSet = z.object({
	type: z.literal('party_stance_set'),
	partyId: z.string()
});
const PartyRunStarted = z.object({
	type: z.literal('party_run_started'),
	partyId: z.string()
});
const PartyRunCompleted = z.object({
	type: z.literal('party_run_completed'),
	partyId: z.string()
});
const PartyRunFailed = z.object({
	type: z.literal('party_run_failed'),
	partyId: z.string()
});
const TurnRevealed = z.object({
	type: z.literal('turn_revealed'),
	turnId: z.string(),
	withPartyId: z.string()
});
const TableSynthesized = z.object({
	type: z.literal('table_synthesized')
});

export const StateEventSchema = z.discriminatedUnion('type', [
	PartyJoined,
	PartyStanceSet,
	PartyRunStarted,
	PartyRunCompleted,
	PartyRunFailed,
	TurnRevealed,
	TableSynthesized
]);
export type StateEvent = z.infer<typeof StateEventSchema>;

// Per-event subtypes — exported so the Events.* factories can return
// the narrowest possible type. A consumer that does
// `const e = Events.partyJoined('a')` gets `PartyJoinedEvent`, not the
// whole union; downstream switch/if narrowing keeps working.
export type PartyJoinedEvent = z.infer<typeof PartyJoined>;
export type PartyStanceSetEvent = z.infer<typeof PartyStanceSet>;
export type PartyRunStartedEvent = z.infer<typeof PartyRunStarted>;
export type PartyRunCompletedEvent = z.infer<typeof PartyRunCompleted>;
export type PartyRunFailedEvent = z.infer<typeof PartyRunFailed>;
export type TurnRevealedEvent = z.infer<typeof TurnRevealed>;
export type TableSynthesizedEvent = z.infer<typeof TableSynthesized>;

/** Union of everything that can travel on the table bus. */
export type TableBusEvent = SseEvent | StateEvent;

/**
 * Typed constructors for state events. Single grep target for "every
 * place an event is created" + positional args (no risk of typo'ing
 * `partyiId`). Each factory returns its narrow subtype so consumers
 * keep full literal-type narrowing downstream.
 */
export const Events = {
	partyJoined: (partyId: string): PartyJoinedEvent => ({ type: 'party_joined', partyId }),
	partyStanceSet: (partyId: string): PartyStanceSetEvent => ({
		type: 'party_stance_set',
		partyId
	}),
	partyRunStarted: (partyId: string): PartyRunStartedEvent => ({
		type: 'party_run_started',
		partyId
	}),
	partyRunCompleted: (partyId: string): PartyRunCompletedEvent => ({
		type: 'party_run_completed',
		partyId
	}),
	partyRunFailed: (partyId: string): PartyRunFailedEvent => ({
		type: 'party_run_failed',
		partyId
	}),
	turnRevealed: (turnId: string, withPartyId: string): TurnRevealedEvent => ({
		type: 'turn_revealed',
		turnId,
		withPartyId
	}),
	tableSynthesized: (): TableSynthesizedEvent => ({ type: 'table_synthesized' })
} as const;

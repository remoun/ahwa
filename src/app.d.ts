// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { ResolvedParty } from '$lib/server/identity';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * The calling party, resolved by hooks.server.ts from a trusted
			 * reverse-proxy header (when AHWA_TRUST_IDENTITY=1) or the
			 * singleton "me" party. Always present — server routes can
			 * read it without null-checking.
			 */
			party: ResolvedParty;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

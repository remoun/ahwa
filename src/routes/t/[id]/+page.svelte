<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';

	import { invalidateAll } from '$app/navigation';
	import MultiPartyControls from '$lib/components/MultiPartyControls.svelte';
	import SynthesisPanel from '$lib/components/SynthesisPanel.svelte';
	import TurnCard from '$lib/components/TurnCard.svelte';
	import type { SseEvent } from '$lib/schemas/events';
	import { consumeSseStream } from '$lib/sse-client';

	import type { PageData } from './$types';

	/** Display labels per round kind; unknown kinds fall back to title-case. */
	const ROUND_LABELS: Record<string, string> = {
		opening: 'Opening Round',
		cross_examination: 'Cross-Examination',
		closing: 'Closing Round'
	};
	function labelForRound(kind: string): string {
		return ROUND_LABELS[kind] ?? kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	let { data }: { data: PageData } = $props();

	interface Turn {
		// id/partyId/visibleTo are populated for historical turns
		// (loaded from DB) so the reveal control can target them. Live
		// SSE turns leave these unset — reveal is a post-hoc action
		// available on reload after the run completes.
		id?: string;
		partyId?: string | null;
		visibleTo?: string[] | null;
		personaId: string;
		personaName: string;
		emoji: string;
		description: string;
		text: string;
		complete: boolean;
		round: number;
	}

	let turns = $state<Turn[]>([]);
	let currentRound = $state('');
	let currentRoundNum = $state(0);
	let synthesis = $state('');
	let synthesizing = $state(false);
	let done = $state(false);
	let error = $state('');

	// With personas running in parallel inside a round, multiple are speaking
	// at once. Derive the speaking label from the turns themselves so the
	// banner reflects reality rather than a single overwritten name.
	const speakingLabel = $derived.by(() => {
		if (synthesizing || done) return '';
		const active = turns.filter((t) => t.round === currentRoundNum && !t.complete);
		if (active.length === 0) return '';
		if (active.length === 1) return `${active[0].personaName} is speaking...`;
		return 'the council is speaking...';
	});

	/**
	 * A single derived view state replaces a handful of overlapping bools
	 * (isCompleted, isRunning, isFailed, done, synthesizing, ...). Every
	 * template branch dispatches on this; only one value is ever active.
	 *
	 *   connecting        — pending table, SSE not yet producing events
	 *   streaming         — SSE in flight (a round, persona, or synthesis)
	 *   runningElsewhere  — DB says running; we polled our way in
	 *   completed         — finished successfully (live or historical)
	 *   failed            — errored (DB marker or SSE error event)
	 */
	type View = 'connecting' | 'streaming' | 'runningElsewhere' | 'completed' | 'failed';
	const view: View = $derived.by(() => {
		if (error || data.table?.status === 'failed') return 'failed';
		if (done || data.table?.status === 'completed') return 'completed';
		if (data.table?.status === 'running') return 'runningElsewhere';
		if (currentRound || speakingLabel || synthesizing || turns.length > 0) return 'streaming';
		return 'connecting';
	});

	$effect(() => {
		// Render persisted turns whenever there are any visible to this
		// viewer — covers the obvious cases (completed/failed tables)
		// plus the multi-party intermediate state where the viewer's
		// own run is done but the table is still 'running' (waiting on
		// other parties). The page server already filtered visible_to
		// for us; we just render what we got.
		if (data.turns?.length) {
			turns = data.turns
				.filter((t) => t.round > 0)
				.map((t) => ({
					id: t.id,
					partyId: t.partyId,
					visibleTo: t.visibleTo,
					personaId: '',
					personaName: t.personaName ?? '',
					emoji: t.emoji ?? '',
					description: t.description ?? '',
					text: t.text ?? '',
					complete: true,
					round: t.round
				}));
			synthesis = data.table?.synthesis ?? '';
			if (data.table?.status === 'completed') {
				done = true;
			}
		}
	});

	onMount(() => {
		const status = data.table?.status;
		const isMultiParty = (data.parties?.length ?? 0) > 1;
		const viewer = data.parties?.find((p) => p.partyId === data.viewerPartyId);
		const params = new globalThis.URLSearchParams(window.location.search);
		const explicitStart = params.get('start') === '1';
		const composeMode = params.get('compose') === '1';

		// Subscribe to the table's event bus for live state updates.
		// Always open (when the table isn't terminal) — even single-party
		// tables can become multi-party mid-life via invite, and the
		// initiator's subscription needs to already be live to receive
		// the party_joined event for that very invite.
		let busAbort: AbortController | undefined;
		if (status !== 'completed' && status !== 'failed') {
			busAbort = new AbortController();
			const subUrl = data.token
				? `/t/${data.tableId}?subscribe=1&party=${data.partyId}&token=${data.token}`
				: `/t/${data.tableId}?subscribe=1&party=${data.partyId}`;
			consumeSseStream({
				url: subUrl,
				signal: busAbort.signal,
				onEvent: () => {
					// Coarse: any event triggers a full data refresh. The
					// page server already enforces visible_to so we trust
					// invalidateAll to deliver the right view per viewer.
					invalidateAll();
				},
				onError: () => {
					// Bus disconnect is non-fatal — page falls back to its
					// last-loaded state. User can reload to retry.
				}
			});
		}

		// Completed/failed tables show historical data only; no SSE.
		if (status === 'completed' || status === 'failed') return () => busAbort?.abort();

		// Multi-party OR initiator-in-compose-mode: hold off auto-start.
		// The page becomes the stance/invite/synthesize control surface.
		// SSE only fires when the user clicks "run my council" (?start=1)
		// or hits the URL with start=1 explicitly.
		if (isMultiParty || composeMode) {
			if (!explicitStart || viewer?.runStatus !== 'pending') {
				return () => busAbort?.abort();
			}
			// fall through to SSE start below
		} else if (status === 'running') {
			// Single-party table running server-side (user navigated
			// away and back). Poll until it completes.
			const interval = setInterval(async () => {
				const res = await fetch(`/api/tables/${data.tableId}`);
				if (res.ok) {
					const table = await res.json();
					if (table.status === 'completed' || table.status === 'failed') {
						clearInterval(interval);
						window.location.reload();
					}
				}
			}, 3000);
			return () => {
				clearInterval(interval);
				busAbort?.abort();
			};
		} else if (status !== 'pending') {
			return () => busAbort?.abort();
		}

		const controller = new AbortController();

		// Only abort on actual tab/window close, not SvelteKit navigation.
		// The deliberation continues server-side if the user navigates away
		// and they'll see the completed table when they return.
		const onUnload = () => controller.abort();
		window.addEventListener('beforeunload', onUnload);

		const sseUrl = data.token
			? `/t/${data.tableId}?party=${data.partyId}&token=${data.token}`
			: `/t/${data.tableId}?party=${data.partyId}`;
		consumeSseStream({
			url: sseUrl,
			signal: controller.signal,
			onEvent: handleEvent,
			onError: (message) => {
				error = message;
				done = true;
			}
		});

		return () => {
			window.removeEventListener('beforeunload', onUnload);
			busAbort?.abort();
		};
	});

	function handleEvent(event: SseEvent) {
		switch (event.type) {
			case 'table_opened':
				// No UI state to update; the page already knows its tableId.
				break;

			case 'round_started':
				currentRound = labelForRound(event.kind);
				currentRoundNum = event.round;
				break;

			case 'persona_turn_started':
				turns = [
					...turns,
					{
						personaId: event.personaId,
						personaName: event.personaName,
						emoji: event.emoji,
						description: data.personaMeta?.[event.personaName] ?? '',
						text: '',
						complete: false,
						round: currentRoundNum
					}
				];
				break;

			case 'token':
				// Reassign the whole array to guarantee reactivity — individual
				// element or property mutations have been flaky in production.
				turns = turns.map((t) =>
					t.personaId === event.personaId && !t.complete ? { ...t, text: t.text + event.text } : t
				);
				break;

			case 'persona_turn_completed':
				turns = turns.map((t) =>
					t.personaId === event.personaId && !t.complete ? { ...t, complete: true } : t
				);
				break;

			case 'synthesis_started':
				synthesizing = true;
				currentRound = 'Synthesis';
				break;

			case 'synthesis_token':
				synthesis += event.text;
				break;

			case 'table_closed': {
				synthesizing = false;
				currentRound = '';
				// Single-party: synthesis ran inline → table.status is now
				// 'completed' on disk. Flip done so the view shows the
				// deliberation-complete marker without waiting for an
				// invalidate round-trip. Multi-party: this party's run
				// closed but the table is still 'running' until synthesis
				// fires from the trigger; "done" would mislead by showing
				// "Deliberation complete." next to the still-active
				// MultiPartyControls. Hold off until the bus delivers
				// table_synthesized.
				const isMulti = (data.parties?.length ?? 0) > 1;
				if (!isMulti) done = true;
				break;
			}

			case 'error':
				error = event.message;
				done = true;
				synthesizing = false;
				// Drop any in-flight turns — they never got content
				turns = turns.filter((t) => t.complete);
				break;
		}
	}

	/**
	 * Detect when the sticky dilemma card has actually stuck. A 1px sentinel
	 * placed immediately above it leaves the viewport at the same moment the
	 * figure pins to top-14 (rootMargin matches that offset). Toggling a
	 * `stuck` class lets us shrink the card to stay out of the reading
	 * column's way on mobile without ever using a scroll listener.
	 */
	let sentinel: HTMLElement | undefined = $state();
	let dilemmaStuck = $state(false);
	const dilemmaClass = $derived(
		`font-display text-fg leading-relaxed whitespace-pre-wrap ${dilemmaStuck ? 'text-base line-clamp-3' : 'text-xl'}`
	);
	$effect(() => {
		if (!sentinel) return;
		const io = new IntersectionObserver(
			([entry]) => {
				dilemmaStuck = !entry.isIntersecting;
			},
			{ rootMargin: '-56px 0px 0px 0px', threshold: 0 }
		);
		io.observe(sentinel);
		return () => io.disconnect();
	});

	/**
	 * Per-turn reveal targets. Renders a "Reveal to <party>" button on
	 * the viewer's own private turns when the table is multi-party and
	 * not yet synthesized. Already-revealed parties show as "Shared
	 * with X" instead. Synthesizer turns and others' turns get nothing.
	 */
	function revealTargetsFor(turn: Turn) {
		const empty = {
			revealable: [] as { partyId: string; label: string }[],
			revealed: [] as { partyId: string; label: string }[]
		};
		if (!turn.id || !turn.partyId) return empty;
		if (turn.partyId === 'synthesizer') return empty;
		if (turn.partyId !== data.viewerPartyId) return empty;
		if (data.table?.status === 'completed') return empty;
		const others = (data.parties ?? []).filter((p) => p.partyId !== data.viewerPartyId);
		if (others.length === 0) return empty;
		const visible = new Set(turn.visibleTo ?? []);
		const revealable: { partyId: string; label: string }[] = [];
		const revealed: { partyId: string; label: string }[] = [];
		for (const p of others) {
			const label = p.partyId.slice(0, 8);
			if (visible.has(p.partyId)) revealed.push({ partyId: p.partyId, label });
			else revealable.push({ partyId: p.partyId, label });
		}
		return { revealable, revealed };
	}

	async function revealTurn(turnId: string, withPartyId: string) {
		const res = await fetch(`/api/turns/${turnId}/reveal`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ withPartyId })
		});
		if (res.ok) {
			// invalidateAll re-runs the page-server load which re-derives
			// visible_to. The recipient's tab picks up the turn live via
			// their own bus subscription's turn_revealed event.
			invalidateAll();
		}
	}

	let copyState = $state<'idle' | 'copied' | 'error'>('idle');
	async function copyMarkdown() {
		try {
			const res = await fetch(`/api/tables/${data.tableId}/export`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const text = await res.text();
			await navigator.clipboard.writeText(text);
			copyState = 'copied';
			setTimeout(() => (copyState = 'idle'), 2000);
		} catch {
			copyState = 'error';
			setTimeout(() => (copyState = 'idle'), 2000);
		}
	}
</script>

<svelte:head>
	<title>{data.table?.dilemma ? data.table.dilemma.slice(0, 50) : 'Table'} - Ahwa</title>
</svelte:head>

<main class="max-w-3xl mx-auto p-4 sm:p-8">
	{#if data.table?.isDemo === 1}
		<!--
			Demo chrome: invariant #11 says demo tables are second-class —
			users should never confuse them with owned tables. The amber
			banner + auto-delete copy makes the disposability explicit.
		-->
		<div
			role="status"
			class="mb-6 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
		>
			<strong class="font-semibold">Demo table.</strong> This deliberation auto-deletes within 24
			hours and is visible to anyone with the link. Self-host Ahwa for
			<a class="underline" href="https://github.com/remoun/ahwa">private, persistent tables</a>.
		</div>
	{/if}
	<div class="flex items-center justify-between mb-6">
		<a href="/" class="text-fg-subtle hover:text-fg text-sm transition-colors">← Back to tables</a>
		{#if view === 'completed'}
			<button
				onclick={copyMarkdown}
				title="Copy this deliberation to your clipboard as Markdown"
				class="text-sm px-3 py-1.5 border border-border-strong rounded-lg hover:bg-surface-muted text-fg-muted transition-colors inline-flex items-center gap-1.5"
			>
				{#if copyState === 'copied'}
					<span aria-hidden="true">✅</span> Copied
				{:else if copyState === 'error'}
					<span aria-hidden="true">⚠️</span> Failed
				{:else}
					<span aria-hidden="true">📋</span> Copy Markdown
				{/if}
			</button>
		{/if}
	</div>

	{#if data.table?.dilemma}
		<!--
			The dilemma is "pinned" to the top of the table — both visually
			(warm paper tone, soft drop shadow, serif body) and literally:
			sticky below the nav so the question stays in view while you
			scroll through the council's turns. top-14 matches Nav's h-14.
			Once stuck, the card shrinks (see dilemmaStuck above) so it
			takes less vertical real estate on mobile.
		-->
		<div bind:this={sentinel} aria-hidden="true" class="h-px"></div>
		<!--
			role="button" is applied conditionally alongside tabindex when
			dilemmaStuck, so the element IS interactive when it has tabindex=0.
			Svelte's static linter doesn't track the conditional role/tabindex
			pairing and flags the figure as if it were always noninteractive.
		-->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<figure
			class="sticky top-14 z-10 bg-surface border border-border-strong rounded-xl shadow-md transition-all
				{dilemmaStuck ? 'mb-10 px-4 py-2 cursor-pointer hover:border-accent' : 'mb-10 px-6 py-5'}"
			role={dilemmaStuck ? 'button' : undefined}
			tabindex={dilemmaStuck ? 0 : undefined}
			aria-label={dilemmaStuck ? 'Scroll to top to see the full dilemma' : undefined}
			onclick={dilemmaStuck ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined}
			onkeydown={dilemmaStuck
				? (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							window.scrollTo({ top: 0, behavior: 'smooth' });
						}
					}
				: undefined}
		>
			{#if !dilemmaStuck}
				<figcaption
					class="flex items-baseline justify-between gap-3 mb-2 text-xs font-medium text-fg-subtle uppercase tracking-wider"
				>
					<span>Dilemma</span>
					{#if data.council}
						<span class="normal-case font-normal">{data.council.name}</span>
					{/if}
				</figcaption>
			{/if}
			<p class={dilemmaClass}>{data.table.dilemma}</p>
		</figure>
	{/if}

	{#if data.parties && data.viewerPartyId}
		<MultiPartyControls
			tableId={data.tableId}
			viewerPartyId={data.viewerPartyId}
			token={data.token}
			parties={data.parties}
			tableStatus={data.table?.status}
			onChange={() => invalidateAll()}
		/>
	{/if}

	{#if error}
		<div class="bg-danger-bg border border-danger-border rounded-xl p-4 mb-6 animate-fade-in">
			<p class="text-danger text-sm">{error}</p>
		</div>
	{/if}

	{#if view === 'streaming' && (currentRound || speakingLabel)}
		<div
			class="mb-6 p-3 bg-surface border border-border rounded-xl shadow-sm flex items-center gap-3"
		>
			<div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
			<div class="text-sm text-accent">
				<span class="font-medium">{currentRound}</span>
				{#if speakingLabel}
					<span class="text-fg-subtle"> · {speakingLabel}</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if view === 'streaming' && currentRound && !synthesizing}
		<h2 class="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-3">
			{currentRound}
		</h2>
	{/if}

	{#if turns.length > 0}
		<div class="relative">
			<!--
				A thin vertical rule running down the middle of the persona avatars
				(w-10 → 20px offset from left) turns the stack of turns into a
				conversation thread rather than a pile of disconnected cards. Sits
				behind the avatars via -z-10 so they punch through.
			-->
			<div class="absolute left-5 top-5 bottom-5 w-px bg-border -z-10" aria-hidden="true"></div>
			{#each turns as turn, i (`${turn.personaId}-${turn.round}-${i}`)}
				<TurnCard
					emoji={turn.emoji}
					personaName={turn.personaName}
					description={turn.description}
					text={turn.text}
					complete={turn.complete}
					streaming={view === 'streaming'}
					turnId={turn.id}
					revealableTo={revealTargetsFor(turn).revealable}
					revealedTo={revealTargetsFor(turn).revealed}
					onReveal={revealTurn}
				/>
			{/each}
		</div>
	{/if}

	{#if synthesizing || synthesis}
		<SynthesisPanel text={synthesis} streaming={synthesizing} />
	{/if}

	{#if view === 'completed'}
		<p class="mt-8 text-fg-subtle text-sm text-center">Deliberation complete.</p>
	{:else if view === 'runningElsewhere'}
		<div
			class="flex items-center gap-3 text-fg-subtle text-sm p-4 bg-surface border border-border rounded-xl shadow-sm"
		>
			<div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
			Deliberation in progress. This page will update when it completes.
		</div>
	{:else if view === 'failed' && !error}
		<div class="p-4 bg-danger-bg border border-danger-border rounded-xl text-sm text-danger">
			{data.table?.errorMessage ?? 'This deliberation encountered an error and could not complete.'}
		</div>
	{:else if view === 'connecting'}
		<div class="flex items-center gap-3 text-fg-subtle text-sm">
			<div class="w-2 h-2 rounded-full bg-accent-hover animate-pulse"></div>
			Connecting to the council...
		</div>
	{/if}
</main>

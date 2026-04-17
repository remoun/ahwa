<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';
	import TurnCard from '$lib/components/TurnCard.svelte';
	import SynthesisPanel from '$lib/components/SynthesisPanel.svelte';
	import { consumeSseStream } from '$lib/sse-client';
	import type { SseEvent } from '$lib/schemas/events';
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
		personaId: string;
		personaName: string;
		emoji: string;
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
		// Render persisted turns for completed AND failed tables — a failed
		// deliberation may have completed some turns before the error, and
		// users should see what the council said before things went wrong.
		if (data.table?.status === 'completed' || data.table?.status === 'failed') {
			turns = data.turns
				.filter((t) => t.round > 0)
				.map((t) => ({
					personaId: '',
					personaName: t.personaName ?? '',
					emoji: t.emoji ?? '',
					text: t.text ?? '',
					complete: true,
					round: t.round
				}));
			synthesis = data.table?.synthesis ?? '';
			// Only mark done for successfully completed tables; failed tables
			// show their own banner via isFailed.
			if (data.table?.status === 'completed') {
				done = true;
			}
		}
	});

	onMount(() => {
		const status = data.table?.status;

		// Completed/failed tables show historical data only; no SSE.
		if (status === 'completed' || status === 'failed') return;

		if (status === 'running') {
			// Table is running server-side (user navigated away and back).
			// Poll until it completes, then reload to show the result.
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
			return () => clearInterval(interval);
		}

		// Pending — start the deliberation via SSE
		if (status !== 'pending') return;

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

			case 'table_closed':
				synthesizing = false;
				done = true;
				currentRound = '';
				break;

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
				<div class="flex items-baseline justify-between gap-3 mb-2">
					<figcaption class="text-xs font-medium text-fg-subtle uppercase tracking-wider">
						Dilemma
					</figcaption>
					{#if data.council}
						<span class="text-xs text-fg-subtle">{data.council.name}</span>
					{/if}
				</div>
			{/if}
			<p
				class="font-display text-fg leading-relaxed {dilemmaStuck
					? 'text-base line-clamp-3'
					: 'text-xl'}"
			>
				{data.table.dilemma}
			</p>
		</figure>
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
					text={turn.text}
					complete={turn.complete}
					streaming={view === 'streaming'}
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

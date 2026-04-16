<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';
	import TurnCard from '$lib/components/TurnCard.svelte';
	import SynthesisPanel from '$lib/components/SynthesisPanel.svelte';
	import { consumeSseStream } from '$lib/sse-client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Turn {
		personaId: string;
		personaName: string;
		emoji: string;
		text: string;
		complete: boolean;
		round: number;
	}

	let isCompleted = $derived(data.table?.status === 'completed');
	let isRunning = $derived(data.table?.status === 'running');
	let isFailed = $derived(data.table?.status === 'failed');

	let turns = $state<Turn[]>([]);
	let currentRound = $state('');
	let currentRoundNum = $state(0);
	let activePersona = $state('');
	let synthesis = $state('');
	let synthesizing = $state(false);
	let done = $state(false);
	let error = $state('');

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
					emoji: '',
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
		// Only start SSE for pending tables. Running tables are already
		// being processed server-side; completed/failed show historical data.
		if (isCompleted || isFailed) return;

		if (isRunning) {
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

		// Status is 'pending' — start the deliberation via SSE
		if (data.table?.status !== 'pending') return;

		const controller = new AbortController();

		// Only abort on actual tab/window close, not SvelteKit navigation.
		// The deliberation continues server-side if the user navigates away
		// and they'll see the completed table when they return.
		const onUnload = () => controller.abort();
		window.addEventListener('beforeunload', onUnload);

		consumeSseStream({
			url: `/t/${data.tableId}?party=${data.partyId}`,
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

	function handleEvent(event: any) {
		switch (event.type) {
			case 'round_started':
				currentRound = event.kind === 'opening' ? 'Opening Round' : 'Cross-Examination';
				currentRoundNum = event.round;
				break;

			case 'persona_turn_started':
				activePersona = event.personaName;
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
					t.personaId === event.personaId && !t.complete
						? { ...t, text: t.text + event.text }
						: t
				);
				break;

			case 'persona_turn_completed':
				turns = turns.map((t) =>
					t.personaId === event.personaId && !t.complete
						? { ...t, complete: true }
						: t
				);
				activePersona = '';
				break;

			case 'synthesis_started':
				synthesizing = true;
				activePersona = '';
				currentRound = 'Synthesis';
				break;

			case 'synthesis_token':
				synthesis += event.text;
				break;

			case 'table_closed':
				synthesizing = false;
				done = true;
				activePersona = '';
				currentRound = '';
				break;

			case 'error':
				error = event.message;
				done = true;
				synthesizing = false;
				activePersona = '';
				// Drop any in-flight turns — they never got content
				turns = turns.filter((t) => t.complete);
				break;
		}
	}

	function exportMarkdown() {
		window.location.href = `/api/tables/${data.tableId}/export`;
	}
</script>

<svelte:head>
	<title>{data.table?.dilemma ? data.table.dilemma.slice(0, 50) : 'Table'} - Ahwa</title>
</svelte:head>

<main class="max-w-3xl mx-auto p-4 sm:p-8">
	<div class="flex items-center justify-between mb-6">
		<a href="/" class="text-fg-subtle hover:text-fg text-sm transition-colors">&larr; Back to tables</a>
		{#if done}
			<button
				onclick={exportMarkdown}
				class="text-sm px-3 py-1.5 border border-border-strong rounded-lg hover:bg-surface-muted text-fg-muted transition-colors"
			>
				Export Markdown
			</button>
		{/if}
	</div>

	{#if data.table?.dilemma}
		<div class="mb-8 p-5 bg-gradient-to-br from-surface-muted to-surface-accent/50 rounded-xl border border-border-strong shadow-sm">
			<p class="text-xs font-medium text-fg-subtle uppercase tracking-wide mb-1.5">Dilemma</p>
			<p class="text-fg leading-relaxed">{data.table.dilemma}</p>
		</div>
	{/if}

	{#if error}
		<div class="bg-danger-bg border border-danger-border rounded-xl p-4 mb-6 animate-fade-in">
			<p class="text-danger text-sm">{error}</p>
		</div>
	{/if}

	<!-- Progress indicator -->
	{#if !isCompleted && !done && (currentRound || activePersona)}
		<div class="mb-6 p-3 bg-surface border border-border rounded-xl shadow-sm flex items-center gap-3">
			<div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
			<div class="text-sm text-accent">
				<span class="font-medium">{currentRound}</span>
				{#if activePersona}
					<span class="text-fg-subtle"> &middot; {activePersona} is speaking...</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if currentRound && !synthesizing && !done}
		<h2 class="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-3">{currentRound}</h2>
	{/if}

	{#each turns as turn}
		<TurnCard
			emoji={turn.emoji}
			personaName={turn.personaName}
			text={turn.text}
			complete={turn.complete}
			streaming={!isCompleted}
		/>
	{/each}

	{#if synthesizing || synthesis}
		<SynthesisPanel text={synthesis} streaming={synthesizing} />
	{/if}

	{#if done && !error}
		<p class="mt-8 text-fg-subtle text-sm text-center">Deliberation complete.</p>
	{/if}

	{#if isRunning && !done}
		<div class="flex items-center gap-3 text-fg-subtle text-sm p-4 bg-surface border border-border rounded-xl shadow-sm">
			<div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
			Deliberation in progress. This page will update when it completes.
		</div>
	{/if}

	{#if isFailed && !error}
		<div class="p-4 bg-danger-bg border border-danger-border rounded-xl text-sm text-danger">
			{data.table?.errorMessage ?? 'This deliberation encountered an error and could not complete.'}
		</div>
	{/if}

	{#if !currentRound && !error && !isCompleted && !isRunning && !isFailed}
		<div class="flex items-center gap-3 text-fg-subtle text-sm">
			<div class="w-2 h-2 rounded-full bg-accent-hover animate-pulse"></div>
			Connecting to the council...
		</div>
	{/if}
</main>

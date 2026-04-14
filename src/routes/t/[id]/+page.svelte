<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';
	import TurnCard from '$lib/components/TurnCard.svelte';
	import SynthesisPanel from '$lib/components/SynthesisPanel.svelte';
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

	// If table is already completed, populate from server data
	let isCompleted = $derived(data.table?.status === 'completed');

	let turns = $state<Turn[]>([]);
	let currentRound = $state('');
	let synthesis = $state('');
	let synthesizing = $state(false);
	let done = $state(false);
	let error = $state('');

	// Populate from server data when viewing a completed table
	$effect(() => {
		if (data.table?.status === 'completed') {
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
			done = true;
		}
	});

	onMount(() => {
		if (isCompleted) return; // No streaming needed

		const url = `/t/${data.tableId}?party=${data.partyId}`;
		const controller = new AbortController();

		(async () => {
			try {
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok || !res.body) {
					error = `Failed to connect: ${res.status}`;
					return;
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done: streamDone, value } = await reader.read();
					if (streamDone) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const json = line.slice(6);
						if (!json.trim()) continue;

						try {
							const event = JSON.parse(json);
							handleEvent(event);
						} catch {
							// skip malformed lines
						}
					}
				}
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					error = String(err);
				}
			}
		})();

		return () => controller.abort();
	});

	function handleEvent(event: any) {
		switch (event.type) {
			case 'round_started':
				currentRound = event.kind === 'opening' ? 'Opening Round' : 'Cross-Examination';
				break;

			case 'persona_turn_started':
				turns.push({
					personaId: event.personaId,
					personaName: event.personaName,
					emoji: event.emoji,
					text: '',
					complete: false,
					round: 0
				});
				break;

			case 'token': {
				const turn = turns.find(
					(t) => t.personaId === event.personaId && !t.complete
				);
				if (turn) turn.text += event.text;
				break;
			}

			case 'persona_turn_completed': {
				const turn = turns.find(
					(t) => t.personaId === event.personaId && !t.complete
				);
				if (turn) turn.complete = true;
				break;
			}

			case 'synthesis_started':
				synthesizing = true;
				break;

			case 'synthesis_token':
				synthesis += event.text;
				break;

			case 'table_closed':
				synthesizing = false;
				done = true;
				break;

			case 'error':
				error = event.message;
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
		<a href="/" class="text-stone-500 hover:text-stone-800 text-sm">&larr; Back to tables</a>
		{#if done}
			<button
				onclick={exportMarkdown}
				class="text-sm px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-50 text-stone-600 transition-colors"
			>
				Export Markdown
			</button>
		{/if}
	</div>

	{#if data.table?.dilemma}
		<div class="mb-6 p-4 bg-stone-50 rounded-lg border border-stone-200">
			<p class="text-sm text-stone-500 mb-1">Dilemma</p>
			<p class="text-stone-800">{data.table.dilemma}</p>
		</div>
	{/if}

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
			<p class="text-red-800 text-sm">{error}</p>
		</div>
	{/if}

	{#if currentRound}
		<h2 class="text-sm font-semibold text-stone-400 uppercase tracking-wide mb-3">{currentRound}</h2>
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
		<p class="mt-6 text-stone-400 text-sm text-center">Deliberation complete.</p>
	{/if}

	{#if !currentRound && !error && !isCompleted}
		<p class="text-stone-400 animate-pulse text-sm">Connecting to the council...</p>
	{/if}
</main>

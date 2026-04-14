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

	let isCompleted = $derived(data.table?.status === 'completed');

	let turns = $state<Turn[]>([]);
	let currentRound = $state('');
	let currentRoundNum = $state(0);
	let totalRounds = $state(0);
	let activePersona = $state('');
	let completedTurns = $state(0);
	let totalPersonas = $state(0);
	let synthesis = $state('');
	let synthesizing = $state(false);
	let done = $state(false);
	let error = $state('');

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
		if (isCompleted) return;

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
				currentRoundNum = event.round;
				// We don't know totalRounds from the event; estimate from council structure
				if (event.round > totalRounds) totalRounds = event.round;
				completedTurns = 0;
				break;

			case 'persona_turn_started':
				activePersona = event.personaName;
				totalPersonas++;
				turns.push({
					personaId: event.personaId,
					personaName: event.personaName,
					emoji: event.emoji,
					text: '',
					complete: false,
					round: currentRoundNum
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
				completedTurns++;
				activePersona = '';
				break;
			}

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
		<a href="/" class="text-amber-600/60 hover:text-amber-900 text-sm transition-colors">&larr; Back to tables</a>
		{#if done}
			<button
				onclick={exportMarkdown}
				class="text-sm px-3 py-1.5 border border-amber-200 rounded-lg hover:bg-amber-50 text-amber-700 transition-colors"
			>
				Export Markdown
			</button>
		{/if}
	</div>

	{#if data.table?.dilemma}
		<div class="mb-8 p-5 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-xl border border-amber-200 shadow-sm">
			<p class="text-xs font-medium text-amber-600/60 uppercase tracking-wide mb-1.5">Dilemma</p>
			<p class="text-amber-950 leading-relaxed">{data.table.dilemma}</p>
		</div>
	{/if}

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 animate-fade-in">
			<p class="text-red-800 text-sm">{error}</p>
		</div>
	{/if}

	<!-- Progress indicator -->
	{#if !isCompleted && !done && (currentRound || activePersona)}
		<div class="mb-6 p-3 bg-white border border-amber-100 rounded-xl shadow-sm flex items-center gap-3">
			<div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
			<div class="text-sm text-amber-800">
				<span class="font-medium">{currentRound}</span>
				{#if activePersona}
					<span class="text-amber-600/60"> &middot; {activePersona} is speaking...</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if currentRound && !synthesizing && !done}
		<h2 class="text-xs font-semibold text-amber-600/60 uppercase tracking-wide mb-3">{currentRound}</h2>
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
		<p class="mt-8 text-amber-600/40 text-sm text-center">Deliberation complete.</p>
	{/if}

	{#if !currentRound && !error && !isCompleted}
		<div class="flex items-center gap-3 text-amber-600/40 text-sm">
			<div class="w-2 h-2 rounded-full bg-amber-300 animate-pulse"></div>
			Connecting to the council...
		</div>
	{/if}
</main>

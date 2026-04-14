<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Turn {
		personaId: string;
		personaName: string;
		emoji: string;
		text: string;
		complete: boolean;
	}

	let turns = $state<Turn[]>([]);
	let currentRound = $state('');
	let synthesis = $state('');
	let synthesizing = $state(false);
	let done = $state(false);
	let error = $state('');

	onMount(() => {
		const url = `/t/${data.tableId}?party=${data.partyId}`;

		// Use fetch + ReadableStream instead of EventSource for streaming
		// EventSource doesn't support custom parsing well; fetch streaming is simpler
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
					complete: false
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
</script>

<main class="max-w-3xl mx-auto p-8">
	<a href="/" class="text-stone-500 hover:text-stone-800 text-sm mb-4 inline-block">&larr; Back</a>

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
			<p class="text-red-800">{error}</p>
		</div>
	{/if}

	{#if currentRound}
		<h2 class="text-lg font-semibold text-stone-500 mb-4">{currentRound}</h2>
	{/if}

	{#each turns as turn}
		<div class="mb-6 p-4 border rounded-lg {turn.complete ? 'border-stone-200' : 'border-stone-400'}">
			<div class="font-medium mb-2">
				{turn.emoji} {turn.personaName}
			</div>
			<div class="whitespace-pre-wrap text-stone-700">
				{turn.text}{#if !turn.complete}<span class="animate-pulse">|</span>{/if}
			</div>
		</div>
	{/each}

	{#if synthesizing || synthesis}
		<div class="mt-8 p-6 bg-stone-50 border-2 border-stone-300 rounded-lg">
			<h2 class="text-lg font-bold mb-3">Synthesis</h2>
			<div class="whitespace-pre-wrap text-stone-700">
				{synthesis}{#if synthesizing}<span class="animate-pulse">|</span>{/if}
			</div>
		</div>
	{/if}

	{#if done}
		<p class="mt-6 text-stone-500 text-sm text-center">Deliberation complete.</p>
	{/if}

	{#if !currentRound && !error}
		<p class="text-stone-400 animate-pulse">Connecting to the council...</p>
	{/if}
</main>

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
			done = true;
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

		const url = `/t/${data.tableId}?party=${data.partyId}`;
		const controller = new AbortController();

		// Only abort on actual tab/window close, not SvelteKit navigation.
		// The deliberation continues server-side if the user navigates away
		// and they'll see the completed table when they return.
		const onUnload = () => controller.abort();
		window.addEventListener('beforeunload', onUnload);

		(async () => {
			try {
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok || !res.body) {
					// Try to pull the server's error message out of the body
					let detail = '';
					try {
						const body = await res.json();
						detail = body.error ?? '';
					} catch {
						// not JSON — ignore
					}
					error = detail
						? `${detail} (HTTP ${res.status})`
						: `Failed to connect: HTTP ${res.status}`;
					done = true;
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

	{#if isCompleted}
		<p class="mt-8 text-amber-600/40 text-sm text-center">Deliberation complete.</p>
	{/if}

	{#if isRunning && !done}
		<div class="flex items-center gap-3 text-amber-600/60 text-sm p-4 bg-white border border-amber-100 rounded-xl shadow-sm">
			<div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
			Deliberation in progress. This page will update when it completes.
		</div>
	{/if}

	{#if isFailed && !error}
		<div class="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
			{data.table?.errorMessage ?? 'This deliberation encountered an error and could not complete.'}
		</div>
	{/if}

	{#if !currentRound && !error && !isCompleted && !isRunning && !isFailed}
		<div class="flex items-center gap-3 text-amber-600/40 text-sm">
			<div class="w-2 h-2 rounded-full bg-amber-300 animate-pulse"></div>
			Connecting to the council...
		</div>
	{/if}
</main>

<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import TableCard from '$lib/components/TableCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let dilemma = $state('');
	let councilId = $state('default');
	let loading = $state(false);

	async function setTable() {
		if (!dilemma.trim()) return;
		loading = true;

		const res = await fetch('/api/tables', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dilemma, councilId })
		});

		const { tableId, partyId } = await res.json();
		goto(`/t/${tableId}?party=${partyId}`);
	}
</script>

<svelte:head>
	<title>Ahwa - Your Tables</title>
</svelte:head>

<main class="max-w-2xl mx-auto p-4 sm:p-8">
	<section class="mb-10">
		<h1 class="text-2xl font-bold mb-1 text-stone-800">Set a table</h1>
		<p class="text-stone-500 text-sm mb-4">Pose a dilemma. The council will deliberate.</p>

		<form onsubmit={(e) => { e.preventDefault(); setTable(); }}>
			<textarea
				bind:value={dilemma}
				class="w-full h-28 p-3 border border-stone-300 rounded-lg mb-3 resize-y text-sm focus:outline-none focus:border-stone-500"
				placeholder="Describe the decision you're wrestling with..."
			></textarea>

			<div class="flex items-center gap-3">
				<select
					bind:value={councilId}
					class="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:border-stone-500"
				>
					{#each data.councils as council}
						<option value={council.id}>{council.name}</option>
					{/each}
				</select>

				<button
					type="submit"
					disabled={loading || !dilemma.trim()}
					class="px-5 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
				>
					{loading ? 'Setting the table...' : 'Set a table'}
				</button>
			</div>
		</form>
	</section>

	{#if data.tables.length > 0}
		<section>
			<h2 class="text-lg font-semibold text-stone-700 mb-3">Your tables</h2>
			<div class="space-y-2">
				{#each data.tables as table}
					<TableCard
						tableId={table.id}
						partyId={table.partyId}
						dilemma={table.dilemma ?? ''}
						status={table.status ?? 'pending'}
						councilId={table.councilId ?? ''}
						createdAt={table.createdAt ?? 0}
					/>
				{/each}
			</div>
		</section>
	{/if}
</main>

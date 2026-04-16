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

		const { tableId, partyId, token } = await res.json();
		goto(`/t/${tableId}?party=${partyId}&token=${token}`);
	}
</script>

<svelte:head>
	<title>Ahwa - Your Tables</title>
</svelte:head>

<main class="max-w-2xl mx-auto p-4 sm:p-8">
	<section class="mb-12">
		<h1 class="text-2xl font-bold mb-1 text-fg">Set a table</h1>
		<p class="text-fg-subtle text-sm mb-5">Pose a dilemma. The council will deliberate.</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				setTable();
			}}
		>
			<textarea
				bind:value={dilemma}
				class="w-full h-36 p-4 bg-surface border border-border-strong rounded-xl shadow-sm text-sm text-fg placeholder:text-fg-subtle resize-y focus:outline-none focus:ring-2 focus:ring-border-strong focus:border-border-strong transition-shadow"
				placeholder="Describe the decision you're wrestling with..."
			></textarea>

			<div class="mt-4 mb-2">
				<p class="text-xs font-medium text-fg-subtle mb-2">Choose a council</p>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
					{#each data.councils as council (council.id)}
						<button
							type="button"
							onclick={() => (councilId = council.id)}
							title={council.description ?? ''}
							class="text-left p-3 rounded-xl border transition-all
								{councilId === council.id
								? 'bg-surface-muted border-border-strong shadow-sm ring-1 ring-border-strong'
								: 'bg-surface border-border hover:border-border-strong hover:shadow-sm'}"
						>
							<div class="font-medium text-sm text-fg">{council.name}</div>
							{#if council.description}
								<div class="text-xs text-fg-subtle mt-1 line-clamp-2 leading-snug">
									{council.description}
								</div>
							{:else if council.personaIds}
								<div class="text-xs text-fg-subtle mt-0.5">
									{JSON.parse(council.personaIds).length} personas
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<button
				type="submit"
				disabled={loading || !dilemma.trim()}
				class="mt-4 w-full sm:w-auto px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-sm"
			>
				{loading ? 'Setting the table...' : 'Set a table'}
			</button>
		</form>
	</section>

	{#if data.tables.length > 0}
		<section>
			<h2 class="text-base font-semibold text-fg mb-3">Your tables</h2>
			<div class="space-y-2">
				{#each data.tables as table (table.id)}
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

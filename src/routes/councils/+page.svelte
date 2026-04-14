<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showForm = $state(false);
	let name = $state('');
	let synthesisPrompt = $state('You are a neutral synthesizer. Produce a clear summary.');
	let selectedPersonaIds = $state<string[]>([]);
	let saving = $state(false);
	let error = $state('');

	async function createCouncil() {
		if (!name.trim() || selectedPersonaIds.length === 0) return;
		saving = true;
		error = '';

		const res = await fetch('/api/councils', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				personaIds: selectedPersonaIds,
				synthesisPrompt,
				roundStructure: {
					rounds: [
						{ kind: 'opening', prompt_suffix: 'Give a 2-3 paragraph opening take.' },
						{ kind: 'cross_examination', prompt_suffix: 'Push back on what you think is wrong, concede what\'s right.' }
					],
					synthesize: true
				}
			})
		});

		if (!res.ok) {
			const body = await res.json();
			error = body.error || 'Failed to create council';
			saving = false;
			return;
		}

		name = '';
		synthesisPrompt = 'You are a neutral synthesizer. Produce a clear summary.';
		selectedPersonaIds = [];
		showForm = false;
		saving = false;
		invalidateAll();
	}

	async function deleteCouncil(id: string) {
		const res = await fetch(`/api/councils/${id}`, { method: 'DELETE' });
		if (res.ok) {
			invalidateAll();
		} else {
			const body = await res.json();
			alert(body.error || 'Failed to delete');
		}
	}

	function togglePersona(id: string) {
		if (selectedPersonaIds.includes(id)) {
			selectedPersonaIds = selectedPersonaIds.filter((p) => p !== id);
		} else {
			selectedPersonaIds = [...selectedPersonaIds, id];
		}
	}
</script>

<svelte:head>
	<title>Councils - Ahwa</title>
</svelte:head>

<main class="max-w-2xl mx-auto p-4 sm:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold text-stone-800">Councils</h1>
		<button
			onclick={() => showForm = !showForm}
			class="text-sm px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
		>
			{showForm ? 'Cancel' : 'New council'}
		</button>
	</div>

	{#if showForm}
		<div class="mb-8 p-4 border border-stone-300 rounded-lg bg-stone-50">
			<h2 class="font-semibold mb-3 text-stone-700">Create a council</h2>

			{#if error}
				<p class="text-red-600 text-sm mb-3">{error}</p>
			{/if}

			<label for="council-name" class="block text-sm font-medium text-stone-600 mb-1">Name</label>
			<input
				id="council-name"
				bind:value={name}
				class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm mb-3 focus:outline-none focus:border-stone-500"
				placeholder="My Custom Council"
			/>

			<span class="block text-sm font-medium text-stone-600 mb-1">Personas</span>
			<div class="flex flex-wrap gap-2 mb-3" role="group" aria-label="Persona selection">
				{#each data.personas as persona}
					<button
						type="button"
						onclick={() => togglePersona(persona.id)}
						class="text-sm px-3 py-1 rounded-full border transition-colors
							{selectedPersonaIds.includes(persona.id)
								? 'bg-stone-800 text-white border-stone-800'
								: 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'}"
					>
						{persona.emoji} {persona.name}
					</button>
				{/each}
			</div>

			<label for="synthesis-prompt" class="block text-sm font-medium text-stone-600 mb-1">Synthesis prompt</label>
			<textarea
				id="synthesis-prompt"
				bind:value={synthesisPrompt}
				class="w-full h-20 px-3 py-2 border border-stone-300 rounded-lg text-sm mb-3 resize-y focus:outline-none focus:border-stone-500"
			></textarea>

			<button
				onclick={createCouncil}
				disabled={saving || !name.trim() || selectedPersonaIds.length === 0}
				class="px-4 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
			>
				{saving ? 'Creating...' : 'Create'}
			</button>
		</div>
	{/if}

	<div class="space-y-3">
		{#each data.councils as council}
			<div class="p-4 border border-stone-200 rounded-lg">
				<div class="flex items-start justify-between">
					<div>
						<h3 class="font-medium text-stone-800">{council.name}</h3>
						<p class="text-xs text-stone-400 mt-1">
							{council.personaIds.length} personas
							{#if council.isSeeded}
								<span class="ml-2 px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-xs">built-in</span>
							{/if}
						</p>
					</div>
					{#if !council.isSeeded}
						<button
							onclick={() => deleteCouncil(council.id)}
							class="text-xs text-red-500 hover:text-red-700"
						>
							Delete
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</main>

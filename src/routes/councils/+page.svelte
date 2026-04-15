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
	let expandedPersona = $state<string | null>(null);

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

	function toggleExpandedPersona(key: string) {
		expandedPersona = expandedPersona === key ? null : key;
	}
</script>

<svelte:head>
	<title>Councils - Ahwa</title>
</svelte:head>

<main class="max-w-2xl mx-auto p-4 sm:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold text-amber-950">Councils</h1>
		<button
			onclick={() => showForm = !showForm}
			class="text-sm px-4 py-2 bg-amber-800 text-white rounded-xl hover:bg-amber-700 transition-colors shadow-sm"
		>
			{showForm ? 'Cancel' : 'New council'}
		</button>
	</div>

	{#if showForm}
		<div class="mb-8 p-5 border border-amber-200 rounded-xl bg-amber-50/50 shadow-sm animate-fade-in">
			<h2 class="font-semibold mb-4 text-amber-900">Create a council</h2>

			{#if error}
				<p class="text-red-600 text-sm mb-3">{error}</p>
			{/if}

			<label for="council-name" class="block text-xs font-medium text-amber-700/60 uppercase tracking-wide mb-1">Name</label>
			<input
				id="council-name"
				bind:value={name}
				class="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300"
				placeholder="My Custom Council"
			/>

			<span class="block text-xs font-medium text-amber-700/60 uppercase tracking-wide mb-2">Personas</span>
			<div class="flex flex-wrap gap-2 mb-4" role="group" aria-label="Persona selection">
				{#each data.allPersonas as persona}
					<button
						type="button"
						onclick={() => togglePersona(persona.id)}
						class="text-sm px-3 py-1.5 rounded-full border transition-all
							{selectedPersonaIds.includes(persona.id)
								? 'bg-amber-800 text-white border-amber-800 shadow-sm'
								: 'bg-white text-amber-800 border-amber-200 hover:border-amber-300 hover:shadow-sm'}"
					>
						<span class="mr-1">{persona.emoji}</span> {persona.name}
					</button>
				{/each}
			</div>

			<label for="synthesis-prompt" class="block text-xs font-medium text-amber-700/60 uppercase tracking-wide mb-1">Synthesis prompt</label>
			<textarea
				id="synthesis-prompt"
				bind:value={synthesisPrompt}
				class="w-full h-20 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm mb-4 resize-y focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300"
			></textarea>

			<button
				onclick={createCouncil}
				disabled={saving || !name.trim() || selectedPersonaIds.length === 0}
				class="px-5 py-2 bg-amber-800 text-white text-sm rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
			>
				{saving ? 'Creating...' : 'Create'}
			</button>
		</div>
	{/if}

	<div class="space-y-3">
		{#each data.councils as council}
			<div class="p-4 bg-white border border-amber-100 rounded-xl shadow-sm">
				<div class="flex items-start justify-between">
					<div>
						<h3 class="font-medium text-amber-900">{council.name}</h3>
						{#if council.isSeeded}
							<span class="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">built-in</span>
						{/if}
					</div>
					{#if !council.isSeeded}
						<button
							onclick={() => deleteCouncil(council.id)}
							class="text-xs text-red-400 hover:text-red-600 transition-colors"
						>
							Delete
						</button>
					{/if}
				</div>

				<!-- Persona chips -->
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#each council.personas as persona}
						<button
							type="button"
							onclick={() => toggleExpandedPersona(`${council.id}-${persona.id}`)}
							class="text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer
								{expandedPersona === `${council.id}-${persona.id}`
									? 'bg-amber-100 border-amber-300 text-amber-900'
									: 'bg-amber-50/50 border-amber-100 text-amber-700 hover:border-amber-200'}"
							title="Click to see prompt"
						>
							{persona.emoji} {persona.name}
						</button>
					{/each}
				</div>

				<!-- Expanded persona prompt -->
				{#each council.personas as persona}
					{#if expandedPersona === `${council.id}-${persona.id}`}
						<div class="mt-3 p-3 bg-amber-50/50 border border-amber-100 rounded-lg animate-fade-in">
							<div class="flex items-center gap-2 mb-2">
								<span class="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-sm">{persona.emoji}</span>
								<span class="text-sm font-medium text-amber-900">{persona.name}</span>
							</div>
							<p class="text-xs text-amber-800/70 leading-relaxed">{persona.systemPrompt}</p>
						</div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</main>

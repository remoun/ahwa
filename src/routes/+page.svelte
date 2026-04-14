<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { goto } from '$app/navigation';

	let dilemma = $state('');
	let loading = $state(false);

	async function setTable() {
		if (!dilemma.trim()) return;
		loading = true;

		const res = await fetch('/api/tables', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dilemma })
		});

		const { tableId, partyId } = await res.json();
		goto(`/t/${tableId}?party=${partyId}`);
	}
</script>

<main class="max-w-2xl mx-auto p-8">
	<h1 class="text-3xl font-bold mb-2">Ahwa</h1>
	<p class="text-gray-600 mb-8">A private council of voices, around your table.</p>

	<form onsubmit={(e) => { e.preventDefault(); setTable(); }}>
		<label class="block mb-2 font-medium" for="dilemma">
			What's on your mind?
		</label>
		<textarea
			id="dilemma"
			bind:value={dilemma}
			class="w-full h-32 p-3 border rounded-lg mb-4 resize-y"
			placeholder="Describe the decision you're wrestling with..."
		></textarea>
		<button
			type="submit"
			disabled={loading || !dilemma.trim()}
			class="px-6 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50"
		>
			{loading ? 'Setting the table...' : 'Set a table'}
		</button>
	</form>
</main>

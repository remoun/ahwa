<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { goto } from '$app/navigation';

	let dilemma = $state('');
	let loading = $state(false);
	let error = $state('');

	async function tryDemo() {
		const trimmed = dilemma.trim();
		if (!trimmed) return;

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/demo/tables', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dilemma: trimmed })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data?.error ?? `Demo request failed (${res.status})`;
				loading = false;
				return;
			}
			goto(`/t/${data.tableId}?party=${data.partyId}&token=${data.token}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error';
			loading = false;
		}
	}
</script>

<!-- svelte:head is hoisted to the parent (src/routes/+page.svelte) so
     SvelteKit accepts it at the top of the document. -->

<main class="max-w-3xl mx-auto px-4 sm:px-8 py-12 sm:py-16">
	<section class="mb-14">
		<h1 class="font-display text-5xl sm:text-6xl text-fg leading-tight mb-4">Ahwa</h1>
		<p class="font-display text-xl sm:text-2xl text-fg-muted leading-relaxed">
			Private AI deliberation rooms. Convene a small council of personas to think through a dilemma
			that doesn't fit a one-shot answer.
		</p>
	</section>

	<section class="mb-16 p-6 sm:p-8 bg-surface border border-border-strong rounded-2xl shadow-md">
		<h2 class="font-display text-2xl text-fg mb-2">Try the demo</h2>
		<p class="text-sm text-fg-muted mb-4">
			A short, three-persona deliberation pinned to a small model. Auto-deletes within 24 hours;
			anyone with the link can read it.
		</p>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				tryDemo();
			}}
		>
			<label for="dilemma" class="sr-only">Your dilemma</label>
			<textarea
				id="dilemma"
				bind:value={dilemma}
				disabled={loading}
				placeholder="What's the dilemma you're sitting with? A few sentences. The council reads what you write — be specific."
				rows="5"
				maxlength="1000"
				class="w-full p-3 rounded-lg border border-border-strong bg-surface-muted text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent resize-y"
			></textarea>
			{#if error}
				<p class="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>
			{/if}
			<button
				type="submit"
				disabled={loading || !dilemma.trim()}
				class="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
			>
				{loading ? 'Convening the council…' : 'Convene the council'}
			</button>
		</form>
	</section>

	<section class="mb-16">
		<h2 class="font-display text-xl text-fg mb-2">Self-host in 15 minutes</h2>
		<p class="text-sm text-fg-muted leading-relaxed mb-3">
			Your dilemmas, your API keys, your machine. Bring your own Anthropic / OpenAI / OpenRouter key
			— or run fully local with Ollama. Single SQLite file, no analytics, no telemetry.
		</p>
		<a
			class="inline-block text-sm font-medium text-accent hover:underline"
			href="https://github.com/remoun/ahwa#install-via-docker"
		>
			Self-host guide →
		</a>
	</section>

	<section class="text-sm text-fg-muted">
		<h2 class="font-display text-base text-fg mb-2">What gets sent where</h2>
		<ul class="list-disc list-inside space-y-1 leading-relaxed">
			<li>
				Your dilemma text → this server, then forwarded once to the LLM provider configured for the
				demo (Anthropic, by default)
			</li>
			<li>The deliberation is stored in a SQLite file on this server until it auto-deletes</li>
			<li>No analytics, no tracking pixels, no third-party scripts</li>
			<li>
				For private use, self-host — nothing leaves your machine except the LLM API call. Point Ahwa
				at a local
				<a class="underline hover:no-underline" href="https://ollama.com">Ollama</a> install and even
				that stays on your hardware.
			</li>
		</ul>
	</section>
</main>

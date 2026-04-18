<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import AppHome from '$lib/components/AppHome.svelte';
	import LandingHero from '$lib/components/LandingHero.svelte';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	{#if data.mode === 'demo'}
		<title>Ahwa — private AI deliberation rooms</title>
		<meta
			name="description"
			content="Convene a small council of AI personas to think through a dilemma. Self-hosted, private by design, no telemetry."
		/>
	{:else}
		<title>Ahwa - Your Tables</title>
	{/if}
</svelte:head>

{#if data.mode === 'demo'}
	<LandingHero />
{:else}
	<AppHome {data} />
{/if}

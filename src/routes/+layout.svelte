<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Ahwa</title>
</svelte:head>

<Nav />
{@render children()}

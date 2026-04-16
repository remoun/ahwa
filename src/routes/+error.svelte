<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<main class="max-w-2xl mx-auto p-8 text-center">
	<h1 class="text-5xl font-bold text-fg-subtle mb-4">{page.status}</h1>
	<p class="text-accent">{page.error?.message ?? 'Something went wrong.'}</p>
	<a href="/" class="inline-block mt-6 text-sm text-fg-subtle hover:text-fg transition-colors">&larr; Back to tables</a>
</main>

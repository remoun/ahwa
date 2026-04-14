<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<main class="max-w-2xl mx-auto p-8 text-center">
	<h1 class="text-4xl font-bold text-stone-300 mb-4">{page.status}</h1>
	<p class="text-stone-600">{page.error?.message ?? 'Something went wrong.'}</p>
	<a href="/" class="inline-block mt-6 text-sm text-stone-500 hover:text-stone-800">&larr; Back to tables</a>
</main>

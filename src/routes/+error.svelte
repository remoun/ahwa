<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<main class="max-w-2xl mx-auto p-8 text-center">
	<h1 class="text-5xl font-bold text-sky-200 mb-4">{page.status}</h1>
	<p class="text-sky-800">{page.error?.message ?? 'Something went wrong.'}</p>
	<a href="/" class="inline-block mt-6 text-sm text-sky-600/60 hover:text-sky-900 transition-colors">&larr; Back to tables</a>
</main>

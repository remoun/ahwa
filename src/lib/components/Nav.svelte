<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<nav class="border-b border-stone-200 bg-white">
	<div class="max-w-4xl mx-auto px-4 sm:px-8 flex items-center gap-6 h-14">
		<a href="/" class="font-bold text-lg text-stone-800">Ahwa</a>
		<div class="flex gap-4 text-sm">
			<a
				href="/"
				class="hover:text-stone-800 {page.url.pathname === '/' ? 'text-stone-800 font-medium' : 'text-stone-500'}"
			>
				Tables
			</a>
			<a
				href="/councils"
				class="hover:text-stone-800 {page.url.pathname.startsWith('/councils') ? 'text-stone-800 font-medium' : 'text-stone-500'}"
			>
				Councils
			</a>
		</div>
	</div>
</nav>

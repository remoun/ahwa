<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<nav class="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
	<div class="max-w-4xl mx-auto px-4 sm:px-8 flex items-center gap-6 h-14">
		<a href="/" class="font-bold text-lg text-amber-900">Ahwa</a>
		<div class="flex gap-4 text-sm">
			<a
				href="/"
				class="hover:text-amber-900 transition-colors {page.url.pathname === '/' ? 'text-amber-900 font-medium' : 'text-amber-600/60'}"
			>
				Tables
			</a>
			<a
				href="/councils"
				class="hover:text-amber-900 transition-colors {page.url.pathname.startsWith('/councils') ? 'text-amber-900 font-medium' : 'text-amber-600/60'}"
			>
				Councils
			</a>
		</div>
	</div>
</nav>

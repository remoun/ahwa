<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';
</script>

<nav class="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
	<div class="max-w-3xl mx-auto px-4 sm:px-8 flex items-center gap-6 h-14">
		<a href="/" class="font-bold text-lg text-fg">Ahwa</a>
		<div class="flex gap-4 text-sm flex-1">
			<a
				href="/"
				class="hover:text-fg transition-colors {page.url.pathname === '/'
					? 'text-fg font-medium'
					: 'text-fg-subtle'}"
			>
				Tables
			</a>
			<a
				href="/councils"
				class="hover:text-fg transition-colors {page.url.pathname.startsWith('/councils')
					? 'text-fg font-medium'
					: 'text-fg-subtle'}"
			>
				Councils
			</a>
		</div>
		<ThemeToggle />
	</div>
</nav>

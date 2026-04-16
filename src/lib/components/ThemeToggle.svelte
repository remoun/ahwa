<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'light' | 'dark' | 'system';

	let theme = $state<Theme>('system');

	onMount(() => {
		const stored = localStorage.getItem('ahwa-theme');
		if (stored === 'light' || stored === 'dark' || stored === 'system') {
			theme = stored;
		}
	});

	function applyTheme(next: Theme) {
		const root = document.documentElement;
		root.classList.remove('light', 'dark');
		if (next !== 'system') {
			root.classList.add(next);
		}
		localStorage.setItem('ahwa-theme', next);
		theme = next;
	}

	function cycleTheme() {
		const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
		applyTheme(next);
	}

	const themeLabel = $derived(
		theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'
	);
	const themeIcon = $derived(
		theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️'
	);
</script>

<button
	type="button"
	onclick={cycleTheme}
	class="text-xs px-2.5 py-1 rounded-full border border-border hover:border-border-strong text-fg-muted transition-colors flex items-center gap-1.5"
	title="Click to change theme: {themeLabel}"
	aria-label="Theme: {themeLabel}"
>
	<span aria-hidden="true">{themeIcon}</span>
	<span class="hidden sm:inline">{themeLabel}</span>
</button>

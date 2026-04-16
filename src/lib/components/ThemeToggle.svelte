<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'light' | 'dark' | 'system';

	const THEMES: Record<Theme, { label: string; icon: string; next: Theme }> = {
		system: { label: 'System', icon: '🖥️', next: 'light' },
		light: { label: 'Light', icon: '☀️', next: 'dark' },
		dark: { label: 'Dark', icon: '🌙', next: 'system' }
	};

	const THEME_KEYS = new Set(Object.keys(THEMES));

	let theme = $state<Theme>('system');

	onMount(() => {
		const stored = localStorage.getItem('ahwa-theme');
		if (stored && THEME_KEYS.has(stored)) {
			theme = stored as Theme;
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

	const current = $derived(THEMES[theme]);
</script>

<button
	type="button"
	onclick={() => applyTheme(current.next)}
	class="text-xs px-2.5 py-1 rounded-full border border-border hover:border-border-strong text-fg-muted transition-colors flex items-center gap-1.5"
	title="Click to change theme: {current.label}"
	aria-label="Theme: {current.label}"
>
	<span aria-hidden="true">{current.icon}</span>
	<span class="hidden sm:inline">{current.label}</span>
</button>

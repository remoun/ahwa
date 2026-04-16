<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let {
		text = '',
		streaming = false
	}: {
		text?: string;
		streaming?: boolean;
	} = $props();

	const html = $derived(renderMarkdown(text));
</script>

<div
	class="mt-8 p-6 bg-gradient-to-br from-surface-muted to-surface-accent border border-border-strong rounded-xl shadow-md animate-fade-in"
>
	<div class="flex items-center gap-2 mb-3">
		<div
			class="w-8 h-8 rounded-full bg-surface-accent flex items-center justify-center text-base"
			aria-hidden="true"
		>
			✨
		</div>
		<h2 class="text-lg font-bold text-fg">Synthesis</h2>
	</div>
	<div class="markdown-body text-fg text-sm leading-relaxed">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html html}{#if streaming}<span class="animate-pulse text-accent">|</span>{/if}
	</div>
</div>

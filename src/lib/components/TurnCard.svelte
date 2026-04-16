<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let {
		emoji = '',
		personaName = '',
		text = '',
		complete = true,
		streaming = false
	}: {
		emoji?: string;
		personaName?: string;
		text?: string;
		complete?: boolean;
		streaming?: boolean;
	} = $props();

	const html = $derived(renderMarkdown(text));
</script>

<div class="mb-4 flex gap-3 animate-fade-in">
	<div
		class="flex-shrink-0 w-10 h-10 rounded-full bg-surface-muted border border-border-strong flex items-center justify-center text-lg"
		aria-hidden="true"
	>
		{emoji}
	</div>
	<div
		class="flex-1 p-4 rounded-xl shadow-sm {complete
			? 'bg-surface border border-border'
			: 'bg-surface-muted/50 border border-border-strong'}"
	>
		<div class="font-medium text-sm text-fg mb-1.5">
			{personaName}
		</div>
		<div class="prose-sm text-fg-muted text-sm leading-relaxed">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}{#if streaming && !complete}<span class="animate-pulse text-accent">|</span
				>{/if}
		</div>
	</div>
</div>

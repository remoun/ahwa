<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	import BreathingDots from './BreathingDots.svelte';

	let {
		text = '',
		streaming = false
	}: {
		text?: string;
		streaming?: boolean;
	} = $props();

	const html = $derived(renderMarkdown(text));
</script>

<section
	class="mt-12 pt-10 pb-8 px-4 sm:px-8 border-t border-border-strong animate-fade-in"
	aria-labelledby="synthesis-heading"
>
	<header class="flex flex-col items-center gap-3 mb-8">
		<div
			class="w-12 h-12 rounded-full bg-gradient-to-br from-surface-muted to-surface-accent border border-border-strong flex items-center justify-center text-xl shadow-sm"
			aria-hidden="true"
		>
			✨
		</div>
		<h2 id="synthesis-heading" class="font-display text-3xl text-fg">Synthesis</h2>
	</header>
	<div class="markdown-body text-fg text-[15px] leading-relaxed max-w-prose mx-auto">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html html}{#if streaming}
			<BreathingDots />
		{/if}
	</div>
</section>

<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	let { text = '', streaming = false }: {
		text?: string;
		streaming?: boolean;
	} = $props();
</script>

<div class="mt-8 p-6 bg-stone-50 border-2 border-stone-300 rounded-lg">
	<h2 class="text-lg font-bold mb-3 text-stone-800">Synthesis</h2>
	<div class="whitespace-pre-wrap text-stone-700 text-sm leading-relaxed">
		{text}{#if streaming}<span class="animate-pulse">|</span>{/if}
	</div>
</div>

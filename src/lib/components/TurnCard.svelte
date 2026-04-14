<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	let { emoji = '', personaName = '', text = '', complete = true, streaming = false }: {
		emoji?: string;
		personaName?: string;
		text?: string;
		complete?: boolean;
		streaming?: boolean;
	} = $props();
</script>

<div class="mb-4 p-4 border rounded-lg {complete ? 'border-stone-200' : 'border-stone-400'}">
	<div class="font-medium mb-2 text-stone-800">
		{emoji} {personaName}
	</div>
	<div class="whitespace-pre-wrap text-stone-700 text-sm leading-relaxed">
		{text}{#if streaming && !complete}<span class="animate-pulse">|</span>{/if}
	</div>
</div>

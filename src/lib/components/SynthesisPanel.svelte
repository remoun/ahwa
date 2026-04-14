<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	let { text = '', streaming = false }: {
		text?: string;
		streaming?: boolean;
	} = $props();
</script>

<div class="mt-8 p-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-md animate-fade-in">
	<div class="flex items-center gap-2 mb-3">
		<div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base" aria-hidden="true">
			&#x2728;
		</div>
		<h2 class="text-lg font-bold text-amber-900">Synthesis</h2>
	</div>
	<div class="whitespace-pre-wrap text-amber-950 text-sm leading-relaxed">
		{text}{#if streaming}<span class="animate-pulse text-amber-400">|</span>{/if}
	</div>
</div>

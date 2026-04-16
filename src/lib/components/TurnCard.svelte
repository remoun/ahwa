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

<div class="mb-4 flex gap-3 animate-fade-in">
	<div class="flex-shrink-0 w-10 h-10 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center text-lg" aria-hidden="true">
		{emoji}
	</div>
	<div class="flex-1 p-4 rounded-xl shadow-sm {complete ? 'bg-white border border-sky-100' : 'bg-sky-50/50 border border-sky-200'}">
		<div class="font-medium text-sm text-sky-900 mb-1.5">
			{personaName}
		</div>
		<div class="whitespace-pre-wrap text-slate-700 text-sm leading-relaxed">
			{text}{#if streaming && !complete}<span class="animate-pulse text-sky-400">|</span>{/if}
		</div>
	</div>
</div>

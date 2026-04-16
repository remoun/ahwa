<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import StatusBadge from './StatusBadge.svelte';

	let {
		tableId = '',
		partyId = '',
		dilemma = '',
		status = '',
		councilId = '',
		createdAt = 0
	}: {
		tableId?: string;
		partyId?: string;
		dilemma?: string;
		status?: string;
		councilId?: string;
		createdAt?: number;
	} = $props();

	function timeAgo(ts: number): string {
		const seconds = Math.floor((Date.now() - ts) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}
</script>

<a
	href="/t/{tableId}?party={partyId}"
	class="block p-4 bg-surface border border-border rounded-xl shadow-sm hover:shadow-md hover:border-border-strong transition-all"
>
	<div class="flex items-start justify-between gap-3">
		<p class="text-fg text-sm line-clamp-2 flex-1">{dilemma}</p>
		<StatusBadge {status} />
	</div>
	<div class="mt-2 flex items-center gap-3 text-xs text-fg-subtle">
		<span>{councilId}</span>
		{#if createdAt}
			<span>{timeAgo(createdAt)}</span>
		{/if}
	</div>
</a>

<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	let { tableId = '', partyId = '', dilemma = '', status = '', councilId = '', createdAt = 0 }: {
		tableId?: string;
		partyId?: string;
		dilemma?: string;
		status?: string;
		councilId?: string;
		createdAt?: number;
	} = $props();

	const statusColors: Record<string, string> = {
		pending: 'bg-yellow-100 text-yellow-800',
		running: 'bg-blue-100 text-blue-800',
		completed: 'bg-green-100 text-green-800',
		failed: 'bg-red-100 text-red-800'
	};

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
	class="block p-4 border border-stone-200 rounded-lg hover:border-stone-400 transition-colors"
>
	<div class="flex items-start justify-between gap-3">
		<p class="text-stone-700 text-sm line-clamp-2 flex-1">{dilemma}</p>
		<span class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap {statusColors[status] ?? 'bg-stone-100 text-stone-600'}">
			{status}
		</span>
	</div>
	<div class="mt-2 flex items-center gap-3 text-xs text-stone-400">
		<span>{councilId}</span>
		{#if createdAt}
			<span>{timeAgo(createdAt)}</span>
		{/if}
	</div>
</a>

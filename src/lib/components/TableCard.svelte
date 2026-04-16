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

	const statusConfig: Record<string, { bg: string; dot: string }> = {
		pending: { bg: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-400' },
		running: { bg: 'bg-blue-50 text-blue-700', dot: 'bg-blue-400 animate-pulse' },
		completed: { bg: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
		failed: { bg: 'bg-red-50 text-red-700', dot: 'bg-red-400' }
	};

	let cfg = $derived(statusConfig[status] ?? { bg: 'bg-gray-50 text-gray-600', dot: 'bg-gray-400' });

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
		<span class="text-xs px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1.5 {cfg.bg}">
			<span class="w-1.5 h-1.5 rounded-full {cfg.dot}"></span>
			{status}
		</span>
	</div>
	<div class="mt-2 flex items-center gap-3 text-xs text-fg-subtle">
		<span>{councilId}</span>
		{#if createdAt}
			<span>{timeAgo(createdAt)}</span>
		{/if}
	</div>
</a>

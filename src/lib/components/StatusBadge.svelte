<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	let { status = 'pending' }: { status?: string } = $props();

	const config: Record<string, { bg: string; dot: string }> = {
		pending: { bg: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-400' },
		running: { bg: 'bg-blue-50 text-blue-700', dot: 'bg-blue-400 animate-pulse' },
		completed: { bg: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
		failed: { bg: 'bg-red-50 text-red-700', dot: 'bg-red-400' }
	};

	const cfg = $derived(config[status] ?? { bg: 'bg-surface-muted text-fg-muted', dot: 'bg-fg-subtle' });
</script>

<span class="text-xs px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1.5 {cfg.bg}">
	<span class="w-1.5 h-1.5 rounded-full {cfg.dot}"></span>
	{status}
</span>

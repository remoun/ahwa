<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	let { status = 'pending' }: { status?: string } = $props();

	const config: Record<string, { bg: string; fg: string; dot: string }> = {
		pending: { bg: 'bg-warning-bg', fg: 'text-warning', dot: 'bg-warning' },
		running: { bg: 'bg-info-bg', fg: 'text-info', dot: 'bg-info animate-pulse' },
		completed: { bg: 'bg-success-bg', fg: 'text-success', dot: 'bg-success' },
		failed: { bg: 'bg-danger-bg', fg: 'text-danger', dot: 'bg-danger' }
	};

	const cfg = $derived(config[status] ?? { bg: 'bg-surface-muted', fg: 'text-fg-muted', dot: 'bg-fg-subtle' });
</script>

<span class="text-xs px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1.5 {cfg.bg} {cfg.fg}">
	<span class="w-1.5 h-1.5 rounded-full {cfg.dot}"></span>
	{status}
</span>

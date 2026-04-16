<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	/**
	 * A clickable pill showing an emoji + name, with an active/inactive
	 * styling pair. Used for council creation (toggle selection) and
	 * council detail chips (toggle expansion).
	 */
	let {
		emoji = '',
		name = '',
		active = false,
		size = 'md',
		onclick,
		title
	}: {
		emoji?: string;
		name?: string;
		active?: boolean;
		size?: 'sm' | 'md';
		onclick?: () => void;
		title?: string;
	} = $props();

	const sizeClasses = {
		sm: 'text-xs px-2.5 py-1',
		md: 'text-sm px-3 py-1.5'
	};
</script>

<button
	type="button"
	{onclick}
	{title}
	class="{sizeClasses[size]} rounded-full border transition-all cursor-pointer
		{active
		? 'bg-accent text-accent-fg border-accent shadow-sm'
		: 'bg-surface text-accent border-border-strong hover:border-accent hover:shadow-sm'}"
>
	{#if emoji}<span class="mr-1">{emoji}</span>{/if}{name}
</button>

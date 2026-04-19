<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	import BreathingDots from './BreathingDots.svelte';

	interface RevealTarget {
		partyId: string;
		label: string;
	}

	let {
		emoji = '',
		personaName = '',
		description = '',
		text = '',
		complete = true,
		streaming = false,
		// Reveal controls — multi-party only. When `turnId` is set and
		// `revealableTo` has any entries, a small "Reveal to" row renders
		// under the card so the turn's author can share it post-hoc.
		// Single-party tables and live SSE turns omit these props and
		// nothing extra renders.
		turnId,
		revealableTo = [],
		revealedTo = [],
		onReveal
	}: {
		emoji?: string;
		personaName?: string;
		description?: string;
		text?: string;
		complete?: boolean;
		streaming?: boolean;
		turnId?: string;
		revealableTo?: RevealTarget[];
		revealedTo?: RevealTarget[];
		onReveal?: (turnId: string, withPartyId: string) => Promise<void>;
	} = $props();

	const html = $derived(renderMarkdown(text));
	const avatarTitle = $derived(description ? `${personaName} — ${description}` : personaName);

	let revealing = $state<string | null>(null);
	async function handleReveal(withPartyId: string) {
		if (!turnId || !onReveal) return;
		revealing = withPartyId;
		try {
			await onReveal(turnId, withPartyId);
		} finally {
			revealing = null;
		}
	}
</script>

<div class="mb-4 flex gap-3 animate-fade-in">
	<div
		class="flex-shrink-0 w-10 h-10 rounded-full bg-surface-muted border border-border-strong flex items-center justify-center text-lg cursor-help"
		title={avatarTitle}
	>
		{emoji}
	</div>
	<div class="flex-1">
		<div
			class="p-4 rounded-xl shadow-sm {complete
				? 'bg-surface border border-border'
				: 'bg-surface-muted/50 border border-border-strong'}"
		>
			<div class="font-medium text-sm text-fg mb-1.5">
				{personaName}
			</div>
			<div class="markdown-body text-fg-muted text-sm leading-relaxed">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html html}{#if streaming && !complete}
					<BreathingDots />
				{/if}
			</div>
		</div>
		{#if turnId && (revealableTo.length > 0 || revealedTo.length > 0)}
			<div class="mt-1.5 ml-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
				{#if revealedTo.length > 0}
					<span class="text-fg-subtle">
						Shared with
						{#each revealedTo as r, i (r.partyId)}
							<span class="font-mono text-fg-muted">{r.label}</span>{#if i < revealedTo.length - 1},
							{/if}
						{/each}
					</span>
				{/if}
				{#each revealableTo as r (r.partyId)}
					<button
						onclick={() => handleReveal(r.partyId)}
						disabled={revealing !== null}
						class="px-2 py-0.5 border border-border rounded-full hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
						title="Make this turn visible to {r.label}"
					>
						{revealing === r.partyId ? 'Revealing…' : `Reveal to ${r.label}`}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

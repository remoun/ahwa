<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
	/**
	 * Multi-party deliberation controls: stance editor, run, uncommit,
	 * invite, synthesize. Renders nothing for single-party tables — the
	 * existing auto-start flow handles those.
	 *
	 * The viewer's identity is determined by the page (?party=X&token=Y
	 * for invitees, locals.party fallback for the initiator). All
	 * mutations carry the token so an anonymous invitee's writes are
	 * authorized at the API layer.
	 */
	interface PartyState {
		partyId: string;
		role: 'initiator' | 'invited' | null;
		runStatus: 'pending' | 'running' | 'completed' | 'failed' | null;
		stance: string | null;
	}

	let {
		tableId,
		viewerPartyId,
		token,
		parties,
		tableStatus,
		onChange
	}: {
		tableId: string;
		viewerPartyId: string;
		token: string;
		parties: PartyState[];
		tableStatus: 'pending' | 'running' | 'completed' | 'failed' | null | undefined;
		onChange: () => void;
	} = $props();

	const viewer = $derived(parties.find((p) => p.partyId === viewerPartyId));
	const isMultiParty = $derived(parties.length > 1);
	const allDone = $derived(
		parties.every((p) => p.runStatus === 'completed' || p.runStatus === 'failed')
	);
	const tokenQuery = $derived(token ? `?token=${token}` : '');

	// Local editable copy of the viewer's stance. The parent reloads on
	// successful save (onChange), which remounts and re-initializes
	// from the new prop — no need for an effect-driven re-sync.
	let stanceText = $state(viewer?.stance ?? '');
	let saving = $state(false);
	let saveError = $state('');

	async function saveStance() {
		saving = true;
		saveError = '';
		try {
			const res = await fetch(
				`/api/tables/${tableId}/parties/${viewerPartyId}/stance${tokenQuery}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ stance: stanceText })
				}
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				saveError = body.error ?? `HTTP ${res.status}`;
				return;
			}
			onChange();
		} finally {
			saving = false;
		}
	}

	let inviteUrl = $state('');
	let inviting = $state(false);
	let inviteError = $state('');
	let copied = $state(false);

	async function invite() {
		inviting = true;
		inviteError = '';
		try {
			const res = await fetch(`/api/tables/${tableId}/invite`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				inviteError = body.error ?? `HTTP ${res.status}`;
				return;
			}
			const body = (await res.json()) as { url: string };
			inviteUrl = `${window.location.origin}${body.url}`;
			onChange();
		} finally {
			inviting = false;
		}
	}

	async function copyInvite() {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard blocked — user can long-press the link instead
		}
	}

	let syncingRun = $state(false);
	function startRun() {
		// SSE is consumed by the parent page on mount when tableStatus is
		// 'pending'. For multi-party we kick off by reloading with the
		// party + token in the URL — page mounts, sees pending runStatus
		// for this party, opens SSE.
		syncingRun = true;
		const url = `/t/${tableId}?party=${viewerPartyId}${token ? `&token=${token}` : ''}&start=1`;
		window.location.href = url;
	}

	let uncommitting = $state(false);
	async function uncommit() {
		uncommitting = true;
		try {
			const res = await fetch(
				`/api/tables/${tableId}/parties/${viewerPartyId}/uncommit${tokenQuery}`,
				{ method: 'POST' }
			);
			if (res.ok) window.location.reload();
		} finally {
			uncommitting = false;
		}
	}

	let synthesizing = $state(false);
	let synthError = $state('');
	async function synthesize() {
		synthesizing = true;
		synthError = '';
		try {
			const res = await fetch(`/api/tables/${tableId}/synthesize`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				synthError = body.error ?? `HTTP ${res.status}`;
				return;
			}
			window.location.reload();
		} finally {
			synthesizing = false;
		}
	}

	const isInitiator = $derived(viewer?.role === 'initiator');
	const stanceCommitted = $derived(viewer?.runStatus !== 'pending');
</script>

{#if isMultiParty || (isInitiator && tableStatus === 'pending')}
	<section
		class="mb-8 p-5 bg-surface border border-border rounded-xl shadow-sm space-y-5"
		aria-labelledby="mp-heading"
	>
		<div class="flex items-baseline justify-between gap-3">
			<h2 id="mp-heading" class="font-semibold text-fg">Your seat at the table</h2>
			{#if isMultiParty}
				<span class="text-xs text-fg-subtle uppercase tracking-wider">{parties.length} parties</span
				>
			{/if}
		</div>

		<!-- Stance editor (own only) -->
		{#if viewer && !stanceCommitted && tableStatus !== 'completed'}
			<div class="space-y-2">
				<label for="stance" class="block text-sm font-medium text-fg-muted">
					Your stance / framing
				</label>
				<p class="text-xs text-fg-subtle">
					How you see this dilemma, in your own words. The council reads this so personas deliberate
					from your standpoint.
				</p>
				<textarea
					id="stance"
					bind:value={stanceText}
					class="w-full min-h-[120px] p-3 bg-surface border border-border-strong rounded-lg text-sm focus:outline-none focus:border-accent"
					placeholder="What's at stake for you, what you've considered, what you're leaning toward..."
				></textarea>
				{#if saveError}
					<p class="text-xs text-danger">{saveError}</p>
				{/if}
				<div class="flex items-center gap-2">
					<button
						onclick={saveStance}
						disabled={saving || !stanceText.trim()}
						class="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{saving ? 'Saving…' : 'Save draft'}
					</button>
					<button
						onclick={async () => {
							await saveStance();
							if (!saveError) startRun();
						}}
						disabled={saving || syncingRun || !stanceText.trim()}
						class="px-3 py-1.5 text-sm border border-accent text-accent rounded-lg hover:bg-accent hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{syncingRun ? 'Starting…' : 'Save & run my council'}
					</button>
				</div>
			</div>
		{:else if viewer?.runStatus === 'completed'}
			<div class="space-y-2">
				<p class="text-sm text-fg-muted">
					Your council has finished deliberating. Waiting on the others, or
					<button
						onclick={uncommit}
						disabled={uncommitting || tableStatus === 'completed'}
						class="underline text-fg-subtle hover:text-fg disabled:no-underline disabled:opacity-50"
						>uncommit & edit</button
					> if you want to revise.
				</p>
			</div>
		{:else if viewer?.runStatus === 'running'}
			<p class="text-sm text-fg-muted flex items-center gap-2">
				<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
				Your council is deliberating…
			</p>
		{:else if viewer?.runStatus === 'failed'}
			<p class="text-sm text-danger">
				Your run failed. <button onclick={uncommit} class="underline">Reset and try again</button>.
			</p>
		{/if}

		<!-- Other parties at a glance (multi-party only) -->
		{#if isMultiParty}
			<ul class="text-sm space-y-1 border-t border-border pt-3">
				{#each parties as p (p.partyId)}
					{#if p.partyId !== viewerPartyId}
						<li class="flex items-center gap-2 text-fg-muted">
							<span class="text-xs uppercase tracking-wider text-fg-subtle"
								>{p.role ?? 'party'}</span
							>
							<span class="font-mono text-xs">{p.partyId.slice(0, 8)}</span>
							<span
								class="text-xs px-2 py-0.5 rounded-full
								{p.runStatus === 'completed'
									? 'bg-accent-bg text-accent'
									: p.runStatus === 'running'
										? 'bg-amber-100 text-amber-800'
										: p.runStatus === 'failed'
											? 'bg-danger-bg text-danger'
											: 'bg-surface-muted text-fg-subtle'}"
							>
								{p.runStatus ?? 'pending'}
							</span>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}

		<!-- Invite (initiator only, not yet synthesized) -->
		{#if isInitiator && tableStatus !== 'completed'}
			<div class="border-t border-border pt-3 space-y-2">
				{#if !inviteUrl}
					<button
						onclick={invite}
						disabled={inviting}
						class="text-sm px-3 py-1.5 border border-border-strong rounded-lg hover:bg-surface-muted text-fg-muted disabled:opacity-50"
					>
						{inviting ? 'Generating…' : '+ Invite someone to this table'}
					</button>
					{#if inviteError}
						<p class="text-xs text-danger">{inviteError}</p>
					{/if}
				{:else}
					<label
						for="invite-url"
						class="block text-xs font-medium text-fg-muted uppercase tracking-wider"
						>Share this link with the other party</label
					>
					<div class="flex items-center gap-2">
						<input
							id="invite-url"
							type="text"
							readonly
							value={inviteUrl}
							class="flex-1 px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-mono text-fg-muted"
						/>
						<button
							onclick={copyInvite}
							class="px-3 py-1.5 text-sm border border-border-strong rounded-lg hover:bg-surface-muted text-fg-muted"
						>
							{copied ? '✓ Copied' : 'Copy'}
						</button>
					</div>
					<p class="text-xs text-fg-subtle">
						Anyone with this link can write a stance for that seat. The link is the identity.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Synthesize (any member, multi-party only, all done, not yet synthesized) -->
		{#if isMultiParty && allDone && tableStatus !== 'completed'}
			<div class="border-t border-border pt-3 space-y-2">
				<button
					onclick={synthesize}
					disabled={synthesizing}
					class="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
				>
					{synthesizing ? 'Synthesizing…' : 'Synthesize this deliberation'}
				</button>
				{#if synthError}
					<p class="text-xs text-danger">{synthError}</p>
				{/if}
				<p class="text-xs text-fg-subtle">
					Combines both parties' deliberations into one synthesis. Stances become visible to all
					members afterward.
				</p>
			</div>
		{/if}
	</section>
{/if}

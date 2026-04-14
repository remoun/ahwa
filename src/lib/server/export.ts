// SPDX-License-Identifier: AGPL-3.0-or-later

interface TableInfo {
	id: string;
	dilemma: string | null;
	createdAt: number | null;
}

interface TurnInfo {
	round: number;
	personaName: string | null;
	emoji?: string | null;
	text: string | null;
}

interface CouncilInfo {
	name: string | null;
}

/**
 * Generate a markdown export of a completed deliberation.
 * Pure function — no DB access, no side effects.
 */
export function generateMarkdown(
	table: TableInfo,
	turns: TurnInfo[],
	council: CouncilInfo,
	synthesis: string | null
): string {
	const lines: string[] = [];

	// Title
	lines.push(`# ${table.dilemma ?? 'Untitled deliberation'}`);
	lines.push('');

	// Metadata
	if (council.name) {
		lines.push(`*Council: ${council.name}*`);
	}
	if (table.createdAt) {
		lines.push(`*Date: ${new Date(table.createdAt).toISOString().split('T')[0]}*`);
	}
	lines.push('');

	// Group turns by round
	const roundMap = new Map<number, TurnInfo[]>();
	for (const turn of turns) {
		if (turn.round === 0) continue; // skip synthesis turn (handled separately)
		const list = roundMap.get(turn.round) ?? [];
		list.push(turn);
		roundMap.set(turn.round, list);
	}

	for (const [round, roundTurns] of roundMap) {
		lines.push(`## Round ${round}`);
		lines.push('');

		for (const turn of roundTurns) {
			const emoji = turn.emoji ?? '';
			const name = turn.personaName ?? 'Unknown';
			lines.push(`### ${emoji ? emoji + ' ' : ''}${name}`);
			lines.push('');
			lines.push(turn.text ?? '');
			lines.push('');
		}
	}

	// Synthesis
	if (synthesis) {
		lines.push('## Synthesis');
		lines.push('');
		lines.push(synthesis);
		lines.push('');
	}

	return lines.join('\n');
}

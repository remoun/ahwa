// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Minimal reproduction of the "AI SDK + OpenRouter provider = empty stream"
// issue. Calls `complete()` directly (same entry point the orchestrator
// uses), counts chunks, prints what it actually received. Run with:
//
//   bun run scripts/probe-or.ts [model-id]
//
// Env: OPENROUTER_API_KEY must be set (picked up from .env automatically
// by Bun).
import { complete } from '../src/lib/server/llm';

const model = process.argv[2] ?? 'google/gemini-2.5-flash';

console.log(`\n> Probing OpenRouter via AI SDK with model: ${model}\n`);

const result = await complete({
	model,
	system: 'You are a helpful assistant.',
	messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
	stream: true,
	modelConfig: { provider: 'openrouter', model }
});

let chunkCount = 0;
let fullText = '';
const started = Date.now();

for await (const chunk of result.textStream) {
	chunkCount++;
	fullText += chunk;
	console.log(`chunk #${chunkCount} (+${Date.now() - started}ms):`, JSON.stringify(chunk));
}

console.log(`\n> Stream ended after ${Date.now() - started}ms`);
console.log(`> Total chunks: ${chunkCount}`);
console.log(`> Total text length: ${fullText.length}`);
console.log(`> Text: ${JSON.stringify(fullText)}`);

if (fullText === '') {
	console.error('\n❌ EMPTY STREAM — this is the bug we are chasing.');
	process.exit(1);
}

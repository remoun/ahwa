// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'bun:test';

import { toSseStream } from '../src/lib/server/sse';

/** Read a ReadableStream to completion and return the decoded text */
async function readAll(stream: ReadableStream): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let out = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		out += decoder.decode(value, { stream: true });
	}
	return out;
}

async function* events<T>(...items: T[]): AsyncGenerator<T> {
	for (const item of items) yield item;
}

describe('toSseStream', () => {
	it('frames each event as "data: {json}\\n\\n"', async () => {
		const stream = toSseStream(events({ type: 'hello' }, { type: 'world' }));
		const text = await readAll(stream);
		expect(text).toBe(`data: {"type":"hello"}\n\ndata: {"type":"world"}\n\n`);
	});

	it('preserves object fields in the JSON payload', async () => {
		const stream = toSseStream(events({ type: 'token', text: 'hi', n: 42 }));
		const text = await readAll(stream);
		expect(text).toBe(`data: {"type":"token","text":"hi","n":42}\n\n`);
	});

	it('emits an error envelope when the generator throws', async () => {
		async function* throwing() {
			yield { type: 'opened' };
			throw new Error('something broke');
		}
		const stream = toSseStream(throwing());
		const text = await readAll(stream);
		expect(text).toContain(`data: {"type":"opened"}\n\n`);
		expect(text).toContain(`"type":"error"`);
		expect(text).toContain(`"message":"something broke"`);
	});

	it('suppresses the error envelope for aborted errors (client already gone)', async () => {
		async function* aborting() {
			yield { type: 'opened' };
			throw new Error('Deliberation aborted');
		}
		const stream = toSseStream(aborting());
		const text = await readAll(stream);
		expect(text).toContain(`data: {"type":"opened"}\n\n`);
		expect(text).not.toContain(`"type":"error"`);
	});

	it('closes the stream after the generator completes', async () => {
		const stream = toSseStream(events({ type: 'a' }));
		const reader = stream.getReader();
		await reader.read(); // first event
		const second = await reader.read();
		// After the generator yields everything, the stream closes
		expect(second.done).toBe(true);
	});

	it('handles an empty generator cleanly', async () => {
		const stream = toSseStream(events());
		const text = await readAll(stream);
		expect(text).toBe('');
	});

	it('streams events one at a time (not batched)', async () => {
		let emitted = 0;
		async function* ticker() {
			yield { type: 'tick', n: 1 };
			emitted = 1;
			yield { type: 'tick', n: 2 };
			emitted = 2;
		}
		const stream = toSseStream(ticker());
		const reader = stream.getReader();
		const decoder = new TextDecoder();

		const first = await reader.read();
		expect(decoder.decode(first.value)).toContain('"n":1');
		expect(emitted).toBe(1); // generator paused after yielding 1

		const second = await reader.read();
		expect(decoder.decode(second.value)).toContain('"n":2');
	});
});

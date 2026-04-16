// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'bun:test';
import { consumeSseStream } from '../src/lib/sse-client';

/**
 * Build a Response whose body is a ReadableStream emitting the given
 * chunks. Chunks are encoded as UTF-8.
 */
function sseResponse(chunks: string[], init?: ResponseInit): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		}
	});
	return new Response(stream, init);
}

/** Mock fetch that returns the given Response for one URL */
function mockFetch(response: Response): typeof fetch {
	return (async () => response) as unknown as typeof fetch;
}

describe('consumeSseStream', () => {
	it('parses events from "data: {json}\\n\\n" frames', async () => {
		const fetchImpl = mockFetch(
			sseResponse([`data: {"type":"a"}\n\ndata: {"type":"b","n":42}\n\n`])
		);
		const events: unknown[] = [];
		await consumeSseStream({
			url: '/stream',
			onEvent: (e) => events.push(e),
			fetchImpl
		});
		expect(events).toEqual([{ type: 'a' }, { type: 'b', n: 42 }]);
	});

	it('skips malformed JSON lines', async () => {
		const fetchImpl = mockFetch(
			sseResponse([`data: not json\n\ndata: {"type":"ok"}\n\n`])
		);
		const events: unknown[] = [];
		await consumeSseStream({
			url: '/stream',
			onEvent: (e) => events.push(e),
			fetchImpl
		});
		expect(events).toEqual([{ type: 'ok' }]);
	});

	it('calls onError with server error body on non-OK response', async () => {
		const fetchImpl = mockFetch(
			new Response(JSON.stringify({ error: 'Council not found' }), {
				status: 409,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		let err = '';
		await consumeSseStream({
			url: '/stream',
			onEvent: () => {},
			onError: (m) => (err = m),
			fetchImpl
		});
		expect(err).toBe('Council not found (HTTP 409)');
	});

	it('calls onError with generic message when body is not JSON', async () => {
		const fetchImpl = mockFetch(new Response('plain text', { status: 500 }));
		let err = '';
		await consumeSseStream({
			url: '/stream',
			onEvent: () => {},
			onError: (m) => (err = m),
			fetchImpl
		});
		expect(err).toBe('Failed to connect: HTTP 500');
	});

	it('returns silently when fetch is aborted', async () => {
		const fetchImpl = (async () => {
			throw new DOMException('aborted', 'AbortError');
		}) as unknown as typeof fetch;
		let err = '';
		await consumeSseStream({
			url: '/stream',
			onEvent: () => {},
			onError: (m) => (err = m),
			fetchImpl
		});
		expect(err).toBe('');
	});

	it('ignores non-data lines', async () => {
		const fetchImpl = mockFetch(
			sseResponse([`event: ping\ndata: {"type":"ok"}\n\n: comment\n\n`])
		);
		const events: unknown[] = [];
		await consumeSseStream({
			url: '/stream',
			onEvent: (e) => events.push(e),
			fetchImpl
		});
		expect(events).toEqual([{ type: 'ok' }]);
	});
});

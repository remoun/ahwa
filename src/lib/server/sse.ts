// SPDX-License-Identifier: AGPL-3.0-or-later
import { errorMessage } from '../util';

/**
 * Wrap an async generator in a Server-Sent Events ReadableStream.
 *
 * Each yielded value is serialized as JSON and framed as
 * `data: {json}\n\n` (the standard SSE event format).
 *
 * If the generator throws, an error envelope is emitted as a final
 * `data: {"type":"error","message":...}` event — unless the error message
 * contains "aborted", in which case the envelope is suppressed (the
 * client triggered the abort and is already gone).
 *
 * The stream closes cleanly whether the generator completes normally or
 * throws.
 */
export function toSseStream<T>(generator: AsyncIterable<T>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const event of generator) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				}
			} catch (err) {
				// Don't send error events for aborts — client is already gone
				if (!(err instanceof Error && err.message.includes('aborted'))) {
					// Log server-side so operators can see the full error with
					// stack trace, then send a clean message to the client.
					console.error('SSE stream error:', err);
					const payload = { type: 'error', message: errorMessage(err) };
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
				}
			} finally {
				controller.close();
			}
		}
	});
}

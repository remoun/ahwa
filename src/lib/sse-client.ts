// SPDX-License-Identifier: AGPL-3.0-or-later
import { errorMessage } from './util';

export interface SseClientOptions<T> {
	url: string;
	onEvent: (event: T) => void;
	onError?: (message: string) => void;
	signal?: AbortSignal;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetchImpl?: typeof fetch;
}

/**
 * Consume a Server-Sent Events stream over fetch.
 *
 * Handles the `data: {json}\n\n` framing, buffers events split across
 * reads, skips malformed lines, and reports non-OK HTTP responses via
 * onError. Aborts are treated as clean returns, not errors.
 *
 * Returns when the stream ends, the abort signal fires, or an error
 * occurs.
 */
export async function consumeSseStream<T>(opts: SseClientOptions<T>): Promise<void> {
	const { url, onEvent, onError, signal, fetchImpl = fetch } = opts;

	let res: Response;
	try {
		res = await fetchImpl(url, { signal });
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') return;
		onError?.(errorMessage(err));
		return;
	}

	if (!res.ok || !res.body) {
		let detail = '';
		try {
			const body = await res.json();
			detail = typeof body?.error === 'string' ? body.error : '';
		} catch {
			// body wasn't JSON — fall through to generic message
		}
		onError?.(detail ? `${detail} (HTTP ${res.status})` : `Failed to connect: HTTP ${res.status}`);
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const json = line.slice(6);
				if (!json.trim()) continue;
				try {
					onEvent(JSON.parse(json) as T);
				} catch {
					// skip malformed lines
				}
			}
		}
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') return;
		onError?.(errorMessage(err));
	}
}

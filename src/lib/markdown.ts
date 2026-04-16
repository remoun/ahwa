// SPDX-License-Identifier: AGPL-3.0-or-later
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Render markdown to sanitized HTML for display. LLM output is untrusted
 * — DOMPurify strips any script/style/event-handler payloads that could
 * XSS through marked's raw-HTML support.
 *
 * Only runs in the browser; returns the raw text on the server (SSR)
 * since DOMPurify needs a DOM. Streaming tokens arrive client-side
 * anyway, so this is not a limitation in practice.
 */
export function renderMarkdown(text: string): string {
	if (typeof window === 'undefined') return text;
	const html = marked.parse(text, { async: false, breaks: true, gfm: true }) as string;
	return DOMPurify.sanitize(html);
}

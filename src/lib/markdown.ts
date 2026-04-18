// SPDX-License-Identifier: AGPL-3.0-or-later
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Render markdown to sanitized HTML for display.
 *
 * LLM output is untrusted — a crafted dilemma could prompt the LLM to
 * emit <script> or event-handler payloads. DOMPurify strips them before
 * the HTML reaches the DOM.
 *
 * Server-side (SSR) this returns the raw text: DOMPurify needs a DOM,
 * and streaming tokens arrive client-side after hydration anyway.
 */
export function renderMarkdown(text: string): string {
	if (typeof window === 'undefined') return text;
	const html = marked.parse(text, { async: false, breaks: true, gfm: true }) as string;
	return DOMPurify.sanitize(html);
}

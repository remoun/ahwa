// SPDX-License-Identifier: AGPL-3.0-or-later
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				// Browser + Node + Bun + Svelte
				window: 'readonly',
				document: 'readonly',
				localStorage: 'readonly',
				alert: 'readonly',
				fetch: 'readonly',
				Response: 'readonly',
				Request: 'readonly',
				ReadableStream: 'readonly',
				TextEncoder: 'readonly',
				TextDecoder: 'readonly',
				AbortController: 'readonly',
				AbortSignal: 'readonly',
				DOMException: 'readonly',
				URL: 'readonly',
				navigator: 'readonly',
				HTMLElement: 'readonly',
				IntersectionObserver: 'readonly',
				process: 'readonly',
				console: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				setTimeout: 'readonly',
				crypto: 'readonly'
			}
		},
		rules: {
			// TDD project — tests use `any` in a few places for mock shapes
			'@typescript-eslint/no-explicit-any': 'off',
			// We use _ prefix for intentionally-unused vars
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			// Plain href strings are fine — we haven't opted into the
			// new type-safe route resolver from SvelteKit 2.20+.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'src/lib/server/db/migrations/',
			'e2e/.data/',
			'playwright-report/',
			'test-results/',
			// Per-feature scratch worktrees Claude Code creates; their own
			// eslint.config.js confuses tseslint's tsconfigRootDir resolution.
			'.claude/'
		]
	}
];

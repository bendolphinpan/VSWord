/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.9 — math view helpers.
//
// Pure logic for the math NodeView chrome:
//   • normalizeLatex   — canonical LaTeX source (trim, collapse trailing $)
//   • detectKatexError — extract the KaTeX ParseError message from an exception
//   • buildKatexOpts   — final KaTeX render options (Q7 answer: displayMode + errorColor + throwOnError=false)
//   • latexIsEmpty     — treat pure whitespace / '' as "empty" for placeholder rendering
//
// No Milkdown / DOM / KaTeX imports so it runs unchanged inside node unit tests.

/**
 * Normalize a LaTeX source string. Users often paste `$$...$$` or `$...$` with
 * the delimiters included; strip those (only when they *fully wrap* the string)
 * and trim outer whitespace. Interior whitespace is preserved.
 */
export function normalizeLatex(input) {
	if (input == null) return '';
	let s = String(input);
	// Strip a *full* pair of `$$…$$` delimiters (block form).
	const trimmed = s.trim();
	if (trimmed.length >= 4 && trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
		s = trimmed.slice(2, -2);
	} else if (trimmed.length >= 2 && trimmed.startsWith('$') && trimmed.endsWith('$') && !trimmed.startsWith('$$')) {
		s = trimmed.slice(1, -1);
	}
	return s.trim();
}

/**
 * Detect whether a KaTeX render throw is a ParseError, and pull the human
 * message. KaTeX's ParseError is `err.name === 'ParseError'` with the message
 * carrying an ASCII arrow pointing at the offending token.
 */
export function detectKatexError(err) {
	if (!err || typeof err !== 'object') return null;
	if (err.name !== 'ParseError' && !/ParseError|KaTeX/.test(err.message || '')) return null;
	// Keep first line only for tooltip use; drop the `KaTeX parse error: ` prefix.
	const msg = String(err.message || '').split('\n')[0].replace(/^KaTeX parse error:\s*/, '');
	return msg || 'LaTeX 语法错误';
}

/**
 * Build the KaTeX options object for a given surface.
 * Q7=推荐：throwOnError=false lets KaTeX render the offending fragment in
 * red instead of crashing the whole view.
 */
export function buildKatexOpts({ displayMode }) {
	return {
		displayMode: !!displayMode,
		throwOnError: false,
		errorColor: '#cc0000',
		strict: 'ignore', // Suppress KaTeX's console warnings for legal-but-noisy sources.
		trust: false,
		output: 'html',
	};
}

/** True when the source has no visible content — used to render a placeholder. */
export function latexIsEmpty(src) {
	return !src || !String(src).trim();
}

/**
 * Textarea auto-sizing: pick a height in px based on the source's line count,
 * clamped to a min/max. Called from the NodeView on every keystroke.
 *
 * Pure so it's unit-testable — no DOM measurement, only glyph counting.
 */
export function autoSizeHeightPx(source, { lineHeightPx = 20, padPx = 16, minPx = 44, maxPx = 320 } = {}) {
	const lines = String(source ?? '').split('\n').length;
	const raw = lines * lineHeightPx + padPx;
	return Math.max(minPx, Math.min(maxPx, raw));
}

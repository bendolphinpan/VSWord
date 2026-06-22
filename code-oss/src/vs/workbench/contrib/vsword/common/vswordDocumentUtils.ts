/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Result of splitting frontmatter from document body.
 */
export interface FrontmatterResult {
	/** Raw YAML frontmatter text (null if no frontmatter found). */
	readonly frontmatter: string | null;
	/** Body text after frontmatter (entire document if no frontmatter). */
	readonly body: string;
	/** Whether frontmatter was detected and split off. */
	readonly hasFrontmatter: boolean;
}

/**
 * Parse YAML frontmatter from a Markdown document.
 *
 * Frontmatter is delimited by `---` on its own line at the start of the document.
 * Unknown fields are preserved verbatim — we only split, not interpret.
 */
export function parseFrontmatter(content: string): FrontmatterResult {
	// Must start with "---\n" or "---\r\n"
	if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
		return { frontmatter: null, body: content, hasFrontmatter: false };
	}

	const newlineLen = content.startsWith('---\r\n') ? 5 : 4;
	const rest = content.slice(newlineLen);

	// Find the closing "---" on its own line
	const closeIdx = rest.search(/^---[\r\n]/m);
	if (closeIdx === -1) {
		// No closing delimiter — treat entire doc as body
		return { frontmatter: null, body: content, hasFrontmatter: false };
	}

	const frontmatter = content.slice(0, newlineLen + closeIdx);
	const bodyStart = newlineLen + closeIdx + (rest.startsWith('---\r\n', closeIdx) ? 5 : 4);
	const body = content.slice(bodyStart);

	return { frontmatter, body, hasFrontmatter: true };
}

/**
 * Word count result.
 */
export interface WordCountResult {
	/** Total characters (no whitespace). */
	readonly chars: number;
	/** CJK characters (Unicode ranges for CJK). */
	readonly cjkChars: number;
	/** Latin/other words (split on whitespace). */
	readonly words: number;
	/** Total line count. */
	readonly lines: number;
}

/**
 * Count words and characters in text.
 *
 * - CJK characters (Chinese, Japanese, Korean) are counted by character.
 * - Latin/other text is split by whitespace into words.
 * - Numbers and punctuation attached to words count as part of that word.
 */
export function countWords(text: string): WordCountResult {
	const lines = text.split(/\r?\n/).length;
	const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
	const cjkChars = (text.match(cjkRegex) || []).length;

	// Remove CJK characters, then split remaining by whitespace for word count
	const nonCjk = text.replace(cjkRegex, ' ');
	const words = nonCjk
		.split(/[\s]+/)
		.filter(w => w.length > 0)
		.length;

	// Total non-whitespace chars
	const chars = text.replace(/[\s]/g, '').length;

	return { chars, cjkChars, words: words + cjkChars, lines };
}
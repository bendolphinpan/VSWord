/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parsed known VSWord frontmatter fields.
 */
export interface VswordFrontmatterKnown {
	readonly title?: string;
	readonly created?: string;
	readonly updated?: string;
	readonly tags?: string[];
	readonly aliases?: string[];
	readonly status?: string;
	readonly cover?: string;
}

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
	/** Known VSWord frontmatter fields parsed from YAML. */
	readonly known: VswordFrontmatterKnown;
	/** Unknown YAML fields preserved for future property panels/round-trip logic. */
	readonly unknown: Record<string, string | string[]>;
	/** Non-fatal parse error for frontmatter metadata. Source editing must still work. */
	readonly parseError?: string;
}

/**
 * Parse YAML frontmatter from a Markdown document.
 *
 * Frontmatter is delimited by `---` on its own line at the start of the document.
 * Unknown fields are preserved as parsed key/value data. The raw frontmatter text
 * is also preserved so future write paths can avoid losing comments/order.
 */
export function parseFrontmatter(content: string): FrontmatterResult {
	const emptyMetadata: Pick<FrontmatterResult, 'known' | 'unknown'> = { known: {}, unknown: {} };
	// Must start with "---\n" or "---\r\n".
	if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
		return { frontmatter: null, body: content, hasFrontmatter: false, ...emptyMetadata };
	}

	const newlineLen = content.startsWith('---\r\n') ? 5 : 4;
	const rest = content.slice(newlineLen);

	// Find the closing "---" on its own line.
	const closeMatch = /^---(?:\r?\n|$)/m.exec(rest);
	if (!closeMatch) {
		// No closing delimiter — treat entire doc as body.
		return { frontmatter: null, body: content, hasFrontmatter: false, ...emptyMetadata };
	}

	const closeIdx = closeMatch.index;
	const frontmatter = content.slice(0, newlineLen + closeIdx);
	const bodyStart = newlineLen + closeIdx + closeMatch[0].length;
	const body = content.slice(bodyStart);
	const metadata = parseFrontmatterYaml(rest.slice(0, closeIdx));

	return { frontmatter, body, hasFrontmatter: true, ...metadata };
}

interface ParsedYamlMetadata {
	readonly known: VswordFrontmatterKnown;
	readonly unknown: Record<string, string | string[]>;
	readonly parseError?: string;
}

function parseFrontmatterYaml(yaml: string): ParsedYamlMetadata {
	const values: Record<string, string | string[]> = {};
	let activeArrayKey: string | undefined;
	let parseError: string | undefined;

	for (const rawLine of yaml.replace(/\r\n/g, '\n').split('\n')) {
		const line = rawLine.trimEnd();
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const arrayItem = /^-\s+(.*)$/.exec(trimmed);
		if (arrayItem && activeArrayKey) {
			const current = values[activeArrayKey];
			const list = Array.isArray(current) ? current : [];
			list.push(unquoteYamlScalar(arrayItem[1]));
			values[activeArrayKey] = list;
			continue;
		}

		const pair = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
		if (!pair) {
			parseError = parseError ?? `Unsupported frontmatter line: ${rawLine}`;
			activeArrayKey = undefined;
			continue;
		}

		const key = pair[1];
		const rawValue = pair[2] ?? '';
		if (!rawValue.trim()) {
			values[key] = [];
			activeArrayKey = key;
			continue;
		}

		values[key] = parseYamlScalarOrArray(rawValue.trim());
		activeArrayKey = undefined;
	}

	const known: VswordFrontmatterKnown = {};
	const unknown: Record<string, string | string[]> = {};
	for (const [key, value] of Object.entries(values)) {
		switch (key) {
			case 'title':
			case 'created':
			case 'updated':
			case 'status':
			case 'cover':
				(known as Record<string, string | undefined>)[key] = Array.isArray(value) ? value.join(', ') : value;
				break;
			case 'tags':
			case 'aliases':
				(known as Record<string, string[] | undefined>)[key] = Array.isArray(value) ? value : [value];
				break;
			default:
				unknown[key] = value;
		}
	}

	return parseError ? { known, unknown, parseError } : { known, unknown };
}

function parseYamlScalarOrArray(rawValue: string): string | string[] {
	if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
		const inner = rawValue.slice(1, -1).trim();
		if (!inner) {
			return [];
		}
		return inner.split(',').map(part => unquoteYamlScalar(part.trim())).filter(Boolean);
	}
	return unquoteYamlScalar(rawValue);
}

function unquoteYamlScalar(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
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

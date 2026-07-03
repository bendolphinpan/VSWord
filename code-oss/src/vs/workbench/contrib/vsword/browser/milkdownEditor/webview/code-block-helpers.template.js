// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7 — pure helpers for code-block chrome. No Milkdown / DOM imports; safe
// to import from unit tests. The heavy NodeView + $view live in
// `code-block-chrome.template.js`.
//
// Canonical language list (Q1=a: 27 refractor modules + 3 aliases → 30 entries).
// - `id` is the Prism/refractor module name (what refractor.register() sees) and
//   what we serialise to markdown fence (```<id>).
// - `label` is the human-facing name shown in the picker.
// - `aliases` are extra strings the fuzzy matcher accepts as input; when the
//   user types `sh` we should highlight `bash` (id=bash), etc. Aliases NEVER
//   override the id — they only feed search.
//
// Order below is the display order in the picker. `<空>` is a special sentinel
// with id='' (empty string) meaning "no language / no highlight".

export const CODE_LANGS = Object.freeze([
	{ id: '',            label: '<空>',       aliases: ['none', 'plain', 'plaintext', 'text', 'txt'] },
	{ id: 'javascript',  label: 'JavaScript', aliases: ['js', 'node', 'nodejs'] },
	{ id: 'typescript',  label: 'TypeScript', aliases: ['ts'] },
	{ id: 'jsx',         label: 'JSX',        aliases: [] },
	{ id: 'tsx',         label: 'TSX',        aliases: [] },
	{ id: 'python',      label: 'Python',     aliases: ['py'] },
	{ id: 'go',          label: 'Go',         aliases: ['golang'] },
	{ id: 'rust',        label: 'Rust',       aliases: ['rs'] },
	{ id: 'c',           label: 'C',          aliases: [] },
	{ id: 'cpp',         label: 'C++',        aliases: ['c++', 'cxx'] },
	{ id: 'csharp',      label: 'C#',         aliases: ['c#', 'cs', 'dotnet'] },
	{ id: 'java',        label: 'Java',       aliases: [] },
	{ id: 'php',         label: 'PHP',        aliases: [] },
	{ id: 'ruby',        label: 'Ruby',       aliases: ['rb'] },
	{ id: 'bash',        label: 'Bash',       aliases: ['sh', 'shell', 'zsh'] },
	{ id: 'powershell',  label: 'PowerShell', aliases: ['ps', 'ps1', 'pwsh'] },
	{ id: 'sql',         label: 'SQL',        aliases: ['mysql', 'postgres', 'pgsql', 'sqlite'] },
	{ id: 'json',        label: 'JSON',       aliases: [] },
	{ id: 'yaml',        label: 'YAML',       aliases: ['yml'] },
	{ id: 'toml',        label: 'TOML',       aliases: [] },
	{ id: 'markup',      label: 'HTML/XML',   aliases: ['html', 'xml', 'svg', 'xhtml'] },
	{ id: 'css',         label: 'CSS',        aliases: [] },
	{ id: 'scss',        label: 'SCSS',       aliases: ['sass'] },
	{ id: 'markdown',    label: 'Markdown',   aliases: ['md'] },
	{ id: 'docker',      label: 'Dockerfile', aliases: ['dockerfile'] },
	{ id: 'nginx',       label: 'Nginx',      aliases: [] },
	{ id: 'ini',         label: 'INI',        aliases: ['conf', 'config', 'properties'] },
	{ id: 'diff',        label: 'Diff',       aliases: ['patch'] },
]);

/**
 * Normalize a raw language attribute string coming from the schema into a
 * lookup-safe form. Trim + lowercase, empty string preserved.
 */
export function normalizeLangKey(raw) {
	if (typeof raw !== 'string') return '';
	return raw.trim().toLowerCase();
}

/**
 * Given a normalized language key, find the canonical entry. Falls back to
 * matching by alias. Returns the CODE_LANGS entry, or null when the string
 * doesn't map to any known language (custom fence like `mermaid`).
 */
export function resolveLang(raw) {
	const key = normalizeLangKey(raw);
	if (key === '') return CODE_LANGS[0]; // <空>
	for (const entry of CODE_LANGS) {
		if (entry.id === key) return entry;
		if (entry.aliases.includes(key)) return entry;
	}
	return null;
}

/**
 * Display label for the picker button. Custom / unknown ids are echoed
 * verbatim so users retain visibility into what they typed.
 */
export function labelForLang(raw) {
	const key = normalizeLangKey(raw);
	if (key === '') return CODE_LANGS[0].label;
	const entry = resolveLang(key);
	if (entry && entry.id !== '') return entry.label;
	return raw; // custom / unknown — echo verbatim
}

/**
 * Fuzzy language search (Q7=b). Scoring rules, higher-is-better:
 *   1000 — exact id match
 *    900 — exact alias match
 *    800 — id startsWith(query)
 *    700 — alias startsWith(query)
 *    500 — id contains all query chars in order (subsequence)
 *    400 — label contains all query chars in order (subsequence, case-insensitive)
 *      0 — no match (filtered out)
 *
 * Empty query returns the full list in canonical order.
 * Ties broken by canonical list order (stable sort assumed).
 */
export function searchLangs(query) {
	const q = normalizeLangKey(query);
	if (q === '') return CODE_LANGS.map((entry, order) => ({ entry, score: 0, order }));

	const isSubseq = (needle, haystack) => {
		let i = 0;
		for (let j = 0; j < haystack.length && i < needle.length; j++) {
			if (haystack.charCodeAt(j) === needle.charCodeAt(i)) i++;
		}
		return i === needle.length;
	};

	const scored = [];
	for (let order = 0; order < CODE_LANGS.length; order++) {
		const entry = CODE_LANGS[order];
		const id = entry.id;
		const labelLc = entry.label.toLowerCase();

		let score = 0;
		if (id === q) score = 1000;
		else if (entry.aliases.includes(q)) score = 900;
		else if (id && id.startsWith(q)) score = 800;
		else if (entry.aliases.some(a => a.startsWith(q))) score = 700;
		else if (id && isSubseq(q, id)) score = 500;
		else if (isSubseq(q, labelLc)) score = 400;

		if (score > 0) scored.push({ entry, score, order });
	}
	scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
	return scored;
}

/** Canonical set of ids to register with refractor. `<空>` sentinel excluded. */
export function refractorLangIds() {
	return CODE_LANGS.filter(e => e.id !== '').map(e => e.id);
}

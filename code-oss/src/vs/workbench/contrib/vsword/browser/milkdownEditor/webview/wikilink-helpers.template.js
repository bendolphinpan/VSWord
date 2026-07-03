/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
// T-3.11.1 wiki-link pure helpers. No Milkdown / DOM imports — safe for jsdom-free unit tests.
//
// Syntax:  [[target]]           → target is the display + resolution key
//          [[target|alias]]     → alias is the display, target is the resolution key
//
// Design notes:
//   - target: trimmed; empty / control chars → invalid (skip)
//   - alias:  trimmed; empty alias falls back to target for display
//   - `]]` inside target/alias is impossible by the greedy negative-lookahead regex
//   - `\[[…]]` (leading escape) is treated as literal, not a wikilink
//   - We DO NOT match across newlines: a bracket that never closes on the same line is literal

/** Regex captures four groups: (open) (target) (|alias?)? (close) — used by remark & inputRule. */
export const WIKILINK_RE = /(?<!\\)\[\[([^\[\]\|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

/** Single-shot variant with `y` (sticky) for inputRule use — matches at exactly one position. */
export function makeStickyRe() {
	return /(?<!\\)\[\[([^\[\]\|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/y;
}

/** Normalize target: trim, collapse internal runs of whitespace, strip control chars. */
export function normalizeTarget(raw) {
	if (typeof raw !== 'string') return '';
	// Strip C0 control chars (but keep tab→space) then collapse whitespace.
	return raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Normalize alias: same as target but keep empty as null (means "use target as display"). */
export function normalizeAlias(raw) {
	if (raw == null) return null;
	const n = normalizeTarget(raw);
	return n.length === 0 ? null : n;
}

/** Extract every wikilink from a body of text. Returns array of {target, alias, start, end}. */
export function parseAll(text) {
	const out = [];
	if (typeof text !== 'string' || text.length === 0) return out;
	// New RegExp so we don't share lastIndex with concurrent callers.
	const re = new RegExp(WIKILINK_RE.source, 'g');
	let m;
	while ((m = re.exec(text)) !== null) {
		const target = normalizeTarget(m[1]);
		if (target.length === 0) continue;
		const alias = normalizeAlias(m[2]);
		out.push({ target, alias, start: m.index, end: m.index + m[0].length });
	}
	return out;
}

/** Display text for a link: alias if present, otherwise the target. */
export function displayFor(link) {
	if (!link) return '';
	return link.alias && link.alias.length ? link.alias : link.target;
}

/** Serialize a link back to source form. Round-trips parseAll output. */
export function toMarkdown(target, alias) {
	const t = normalizeTarget(target);
	if (!t) return '';
	const a = normalizeAlias(alias);
	return a ? `[[${t}|${a}]]` : `[[${t}]]`;
}

// ---------------------------------------------------------------------------
// Resolution (Q1=c: name-first, path-fallback, ambiguity flag)
// ---------------------------------------------------------------------------

/**
 * Resolve a wikilink target against a file index.
 *   index: Array<{ name, path, dir }>   name = "MyNote" (no ext), path = full workspace-relative
 *
 * Rules (Q1=c):
 *   1. If target contains "/" or "\", treat as relative path — exact path match wins.
 *   2. Otherwise short-name match:
 *        exact case-insensitive matches on `name`
 *        - 0 matches → { status: 'missing' }
 *        - 1 match   → { status: 'found', file }
 *        - N matches → { status: 'ambiguous', candidates }  (caller renders ⚠)
 *
 * Callers pass an already-indexed workspace; this is pure so it's testable.
 */
export function resolveTarget(target, index) {
	const t = normalizeTarget(target);
	if (!t) return { status: 'missing' };
	if (!Array.isArray(index) || index.length === 0) return { status: 'missing' };

	// Path-style target: try exact path match (drop .md if user included it).
	if (t.indexOf('/') !== -1 || t.indexOf('\\') !== -1) {
		const wanted = t.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
		for (const f of index) {
			const p = f.path.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
			if (p === wanted) return { status: 'found', file: f };
		}
		return { status: 'missing' };
	}

	// Short-name match, case-insensitive. Strip a trailing .md the user may have typed.
	const wanted = t.replace(/\.md$/i, '').toLowerCase();
	const matches = [];
	for (const f of index) {
		if (f.name.toLowerCase() === wanted) matches.push(f);
	}
	if (matches.length === 0) return { status: 'missing' };
	if (matches.length === 1) return { status: 'found', file: matches[0] };
	return { status: 'ambiguous', candidates: matches };
}

/** Build the CSS class list for a wikilink NodeView based on its resolution status. */
export function classForStatus(status) {
	const base = 'vsword-wikilink';
	switch (status) {
		case 'found':     return base;
		case 'missing':   return base + ' vsword-wikilink-missing';
		case 'ambiguous': return base + ' vsword-wikilink-ambiguous';
		case 'pending':   return base + ' vsword-wikilink-pending';
		default:          return base;
	}
}

/** Tooltip text (title attr) based on status + resolved file (if any). */
export function titleForStatus(status, target, file) {
	if (status === 'missing')   return `文件不存在: ${target} · 点击创建`;
	if (status === 'ambiguous') return `目标不唯一: ${target} · 存在多个同名文件`;
	if (status === 'pending')   return `解析中: ${target}`;
	if (file && file.path)      return file.path;
	return target;
}

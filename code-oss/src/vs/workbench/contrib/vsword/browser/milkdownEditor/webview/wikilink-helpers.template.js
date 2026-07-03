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

// ---------------------------------------------------------------------------
// T-3.11.2 — autocomplete: prefix detection + fuzzy ranking
// ---------------------------------------------------------------------------

/**
 * Find an open `[[…` prefix ending at `caret` inside `text`.
 * Returns `{ from, query }` where `from` is the offset of the `[[` opener
 * (so the caller can replace `text.slice(from, caret)` on accept), or `null`.
 *
 * Rules:
 *   • No closing `]]` between the opener and the caret.
 *   • No newline inside the query (kills wandering triggers across paragraphs).
 *   • Escaped `\[[` doesn't trigger.
 */
export function findWikilinkTrigger(text, caret) {
	if (typeof text !== 'string' || caret <= 1) return null;
	const scan = text.slice(0, caret);
	const open = scan.lastIndexOf('[[');
	if (open < 0) return null;
	// Escaped `\[[` — bail.
	if (open > 0 && scan.charCodeAt(open - 1) === 0x5c /* \\ */) return null;
	const between = scan.slice(open + 2);
	if (between.indexOf(']]') !== -1) return null;
	if (between.indexOf('\n') !== -1) return null;
	return { from: open, query: between };
}

/**
 * Fuzzy-score a candidate against a query. Higher = better. Zero = no match.
 * Tuned for note-name UX: prefix/exact wins, then substring, then subsequence.
 * Case-insensitive; also considers path so `folder/note` queries work.
 */
export function fuzzyScore(query, entry) {
	if (!query) return 1; // empty query — everything ranks equally (order preserved)
	const q = String(query).toLowerCase();
	const name = String(entry.name || '').toLowerCase();
	const path = String(entry.path || '').toLowerCase();
	// Exact name match — top.
	if (name === q) return 1000;
	// Name prefix — very strong.
	if (name.startsWith(q)) return 800 - (name.length - q.length);
	// Path prefix (folder-qualified search).
	if (path.startsWith(q)) return 700 - (path.length - q.length);
	// Substring in name.
	const nameIdx = name.indexOf(q);
	if (nameIdx >= 0) return 500 - nameIdx - (name.length - q.length) * 0.1;
	// Substring in path.
	const pathIdx = path.indexOf(q);
	if (pathIdx >= 0) return 300 - pathIdx - (path.length - q.length) * 0.1;
	// Subsequence match — chars appear in order.
	let qi = 0;
	for (let i = 0; i < name.length && qi < q.length; i++) {
		if (name.charCodeAt(i) === q.charCodeAt(qi)) qi++;
	}
	if (qi === q.length) return 100 - (name.length - q.length) * 0.5;
	return 0;
}

/**
 * Rank an index against `query`, returning the top `limit` matches.
 * Pure function: same input → same output; safe to call on every keystroke.
 */
export function rankCandidates(query, index, limit = 8) {
	if (!Array.isArray(index) || index.length === 0) return [];
	const scored = [];
	for (const entry of index) {
		const score = fuzzyScore(query, entry);
		if (score > 0) scored.push({ entry, score });
	}
	scored.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
	return scored.slice(0, limit).map(s => s.entry);
}

/**
 * Decide the target string to emit when the user picks `entry` from the popover.
 * Uses the folder-qualified form when the entry name is duplicated in the index
 * (avoids the `ambiguous` broken state at insertion time). Otherwise uses the
 * short name.
 */
export function pickTargetFor(entry, index) {
	if (!entry) return '';
	const name = String(entry.name || '');
	if (!name) return String(entry.path || '').replace(/\.md$/i, '');
	let dupes = 0;
	for (const e of index) {
		if (String(e.name || '').toLowerCase() === name.toLowerCase()) {
			dupes++;
			if (dupes > 1) break;
		}
	}
	if (dupes > 1) return String(entry.path || '').replace(/\.md$/i, '');
	return name;
}

// ---------------------------------------------------------------------------
// T-3.11.3 · hover preview snippet extraction (pure, shared by host + tests).
// ---------------------------------------------------------------------------

const PREVIEW_DEFAULT_MAX = 320;

/**
 * Given raw markdown, produce a short plain-text-ish preview:
 *   1. strip YAML frontmatter (leading `---\n…\n---\n`),
 *   2. drop lines that are just a heading marker (`# `) — the caller uses
 *      the top-level heading separately as a title,
 *   3. collapse consecutive blank lines,
 *   4. truncate to `max` chars at a word/space boundary and append `…`.
 * Never throws; falsy input returns ''.
 */
export function extractPreviewSnippet(md, max = PREVIEW_DEFAULT_MAX) {
	if (typeof md !== 'string' || md.length === 0) return '';
	let body = md;
	// Strip YAML frontmatter.
	if (body.startsWith('---\n') || body.startsWith('---\r\n')) {
		const end = body.indexOf('\n---', 3);
		if (end !== -1) {
			const after = body.indexOf('\n', end + 4);
			body = after === -1 ? '' : body.slice(after + 1);
		}
	}
	// Drop the first ATX heading line if it opens the doc (we surface it as title).
	body = body.replace(/^\s*#{1,6}\s+[^\n]*\n?/, '');
	// Collapse blank runs.
	body = body.replace(/\n{3,}/g, '\n\n').trim();
	if (body.length <= max) return body;
	// Truncate at nearest whitespace before `max`.
	const slice = body.slice(0, max);
	const lastWs = slice.lastIndexOf(' ');
	const cut = lastWs > max * 0.6 ? lastWs : max;
	return body.slice(0, cut).trimEnd() + '…';
}

/**
 * Extract the document title: the text of the first ATX heading, or the file
 * basename if none. Pure; never throws.
 */
export function extractPreviewTitle(md, fallback = '') {
	if (typeof md !== 'string' || md.length === 0) return fallback;
	let body = md;
	if (body.startsWith('---\n') || body.startsWith('---\r\n')) {
		const end = body.indexOf('\n---', 3);
		if (end !== -1) {
			const after = body.indexOf('\n', end + 4);
			body = after === -1 ? '' : body.slice(after + 1);
		}
	}
	const m = body.match(/^\s*#{1,6}\s+([^\n]+)/);
	return m ? m[1].trim() : fallback;
}


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.11.1 wiki-link resolver — host-side pure helpers.
// Mirrors the webview helper (`wikilink-helpers.template.js` — `resolveTarget`)
// so the *same* Q1=c rules apply on both ends: name-first, path-fallback,
// ambiguity-flag. The webview cannot see the file system directly, so the host
// runs the same algorithm over its in-memory index and streams results back.

/** A single indexed .md file in the workspace. */
export interface WikilinkIndexEntry {
	/** Base name without extension. `MyNote.md` → `MyNote`. Case-preserving. */
	readonly name: string;
	/** Workspace-root-relative POSIX path. `MyNote.md` → `notes/MyNote.md`. */
	readonly path: string;
	/** Parent folder as workspace-relative POSIX. `notes/x/MyNote.md` → `notes/x`. */
	readonly dir: string;
}

export type WikilinkResolveStatus = 'found' | 'missing' | 'ambiguous';

export interface WikilinkResolution {
	readonly status: WikilinkResolveStatus;
	readonly file?: WikilinkIndexEntry;
	readonly candidates?: readonly WikilinkIndexEntry[];
}

/** Normalize a target string — same rules as the webview helper. */
export function normalizeTarget(raw: string | null | undefined): string {
	if (typeof raw !== 'string') return '';
	return raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a wiki-link target against a file index (Q1=c rules).
 *   1. If the target contains "/" or "\", try exact workspace-relative path match
 *      (dropping any trailing `.md`).
 *   2. Otherwise, try short-name case-insensitive exact match on `.name`.
 *        - 0 matches → 'missing'
 *        - 1 match   → 'found'
 *        - N matches → 'ambiguous' (candidates listed for UX)
 */
export function resolveWikilink(target: string, index: readonly WikilinkIndexEntry[]): WikilinkResolution {
	const t = normalizeTarget(target);
	if (!t || index.length === 0) return { status: 'missing' };

	if (t.indexOf('/') !== -1 || t.indexOf('\\') !== -1) {
		const wanted = t.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
		for (const f of index) {
			const p = f.path.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
			if (p === wanted) return { status: 'found', file: f };
		}
		return { status: 'missing' };
	}

	const wanted = t.replace(/\.md$/i, '').toLowerCase();
	const matches: WikilinkIndexEntry[] = [];
	for (const f of index) {
		if (f.name.toLowerCase() === wanted) matches.push(f);
	}
	if (matches.length === 0) return { status: 'missing' };
	if (matches.length === 1) return { status: 'found', file: matches[0] };
	return { status: 'ambiguous', candidates: matches };
}

/** Convert a resolution into the wire shape sent back to the webview. */
export function resolutionToWireResult(target: string, r: WikilinkResolution): {
	target: string;
	status: WikilinkResolveStatus;
	file?: WikilinkIndexEntry;
} {
	if (r.status === 'found') return { target, status: 'found', file: r.file };
	// For 'ambiguous' we intentionally omit `file` — the webview shows the ⚠ badge
	// and (in T-3.11.2) can pop up a disambiguation menu.
	return { target, status: r.status };
}

// ---------------------------------------------------------------------------
// T-3.11.3 · preview snippet extractor (host mirror of the webview helper).
// ---------------------------------------------------------------------------

const PREVIEW_DEFAULT_MAX = 320;

/** Strip a leading YAML frontmatter block; returns body if present, else input. */
function stripFrontmatter(md: string): string {
	if (!md.startsWith('---\n') && !md.startsWith('---\r\n')) return md;
	const end = md.indexOf('\n---', 3);
	if (end === -1) return md;
	const after = md.indexOf('\n', end + 4);
	return after === -1 ? '' : md.slice(after + 1);
}

/**
 * Extract a plain snippet from markdown for hover preview. Mirrors the pure
 * JS version in `webview/wikilink-helpers.template.js` so tests can pin both
 * paths to the same fixtures.
 */
export function extractPreviewSnippet(md: string, max: number = PREVIEW_DEFAULT_MAX): string {
	if (typeof md !== 'string' || md.length === 0) return '';
	let body = stripFrontmatter(md);
	body = body.replace(/^\s*#{1,6}\s+[^\n]*\n?/, '');
	body = body.replace(/\n{3,}/g, '\n\n').trim();
	if (body.length <= max) return body;
	const slice = body.slice(0, max);
	const lastWs = slice.lastIndexOf(' ');
	const cut = lastWs > max * 0.6 ? lastWs : max;
	return body.slice(0, cut).trimEnd() + '…';
}

/** Extract the first heading text as title, else return `fallback`. */
export function extractPreviewTitle(md: string, fallback: string = ''): string {
	if (typeof md !== 'string' || md.length === 0) return fallback;
	const body = stripFrontmatter(md);
	const m = body.match(/^\s*#{1,6}\s+([^\n]+)/);
	return m ? m[1].trim() : fallback;
}

// T-3.11.4 · backlinks graph.
// Scans a markdown source for [[target]] / [[target|alias]] tokens and yields
// the raw target strings. Duplicates preserved so callers can compute per-doc
// reference counts. Escaped forms `\[[…]]` are skipped, and code fences /
// inline code are stripped first to avoid false positives in code snippets.
const BACKLINK_RE = /\[\[([^\[\]\n|]+)(?:\|[^\[\]\n]*)?\]\]/g;

function stripCode(md: string): string {
	return md
		.replace(/```[\s\S]*?```/g, '')  // fenced code blocks
		.replace(/`[^`\n]*`/g, '');       // inline code
}

/** Extract every wiki-link target referenced from a markdown source. */
export function extractWikilinkReferences(md: string): string[] {
	if (typeof md !== 'string' || md.length === 0) return [];
	const stripped = stripCode(stripFrontmatter(md));
	const out: string[] = [];
	let m: RegExpExecArray | null;
	BACKLINK_RE.lastIndex = 0;
	while ((m = BACKLINK_RE.exec(stripped)) !== null) {
		// Reject escaped `\[[…]]` — check the char preceding the match.
		if (m.index > 0 && stripped.charCodeAt(m.index - 1) === 92 /* \ */) continue;
		const t = m[1].trim();
		if (t) out.push(t);
	}
	return out;
}

/**
 * A single entry in the inverse graph.
 * `count` = how many times `fromPath` references the owning target.
 */
export interface WikilinkBackref {
	readonly fromPath: string;
	readonly fromName: string;
	readonly count: number;
}

/**
 * Build an inverse reference graph: `targetPath → Backref[]`. Each source
 * markdown is scanned for wiki-link tokens; every token is resolved against
 * the workspace index and, if it lands on a real file, recorded as a reference
 * from the source path to that resolved target.
 *
 * Pure over `(index, sources)` so it round-trips cleanly in unit tests.
 */
export function buildBacklinksGraph(
	index: readonly WikilinkIndexEntry[],
	sources: ReadonlyArray<{ path: string; name: string; text: string }>,
): Map<string, WikilinkBackref[]> {
	const graph = new Map<string, WikilinkBackref[]>();
	for (const src of sources) {
		const refs = extractWikilinkReferences(src.text);
		if (refs.length === 0) continue;
		// Per-source dedupe: same file citing the same target N times → count=N,
		// one row per (fromPath, targetPath) pair.
		const perTarget = new Map<string, number>();
		for (const raw of refs) {
			const resolution = resolveWikilink(raw, index);
			const file = resolution.status === 'found'
				? resolution.file
				: resolution.status === 'ambiguous' && resolution.candidates
					? resolution.candidates[0]
					: undefined;
			if (!file || file.path === src.path) continue; // skip self-references
			perTarget.set(file.path, (perTarget.get(file.path) ?? 0) + 1);
		}
		for (const [targetPath, count] of perTarget) {
			const list = graph.get(targetPath) ?? [];
			list.push({ fromPath: src.path, fromName: src.name, count });
			graph.set(targetPath, list);
		}
	}
	// Stable ordering: refs sorted by fromPath for deterministic output.
	for (const list of graph.values()) list.sort((a, b) => a.fromPath.localeCompare(b.fromPath));
	return graph;
}

/** Look up backlinks for a specific target path. */
export function backlinksFor(graph: Map<string, WikilinkBackref[]>, path: string): WikilinkBackref[] {
	return graph.get(path) ?? [];
}

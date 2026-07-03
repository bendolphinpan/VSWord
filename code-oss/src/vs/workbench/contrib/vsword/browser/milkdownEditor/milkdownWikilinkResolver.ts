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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//
// T-3.11.4 · Backlinks footer widget.
// ---------------------------------------------------------------------------
// Small, self-contained module owning:
//   1. A DOM footer pinned to the editor container's bottom edge, listing every
//      workspace doc that references the currently-open note.
//   2. A tiny host-comms shim (`configureWikilinkBacklinks`, `ingestBacklinks`)
//      so this file has zero direct coupling to `vscode.postMessage`.
//
// The footer starts collapsed (single "N Backlinks ▸" header row). Clicking the
// header expands to reveal the ref list. Each row Ctrl/Cmd+click opens in a
// split; plain click opens in place.
//
// Data flow:
//   entry.mjs → configureWikilinkBacklinks({ postToHost, openBacklink })
//   NodeView / editor mount → refreshBacklinks()
//     → postToHost({ type: 'wikilinkBacklinksRequest' })
//   host → wikilinkBacklinksResponse → entry.mjs → ingestBacklinks(payload)
//     → controller repaints
//
// Pure state helpers (`makeBacklinksState`, `applyBacklinksResponse`) are
// exported so the T-3.7 mocha runner can validate the reducer without touching
// the DOM.
//

/** @typedef {{ path: string, name: string, count: number }} BacklinkRef */
/** @typedef {{ ownPath: string, refs: BacklinkRef[] }} BacklinksPayload */

let postToHost = null;
let openBacklink = null;

/** Configure host-comms once at editor bootstrap. */
export function configureWikilinkBacklinks(opts) {
	postToHost = opts && typeof opts.postToHost === 'function' ? opts.postToHost : null;
	openBacklink = opts && typeof opts.openBacklink === 'function' ? opts.openBacklink : null;
}

// ---------------------------------------------------------------------------
// Pure state reducer (testable without DOM)
// ---------------------------------------------------------------------------

/** Fresh state object. */
export function makeBacklinksState() {
	return { ownPath: '', refs: [], loaded: false, expanded: false };
}

/**
 * Reduce a host response into the next state. Refs are normalised (missing
 * fields defaulted, counts clamped ≥1) and sorted by (count desc, name asc)
 * so the highest-frequency refs surface first.
 */
export function applyBacklinksResponse(state, msg) {
	if (!msg || msg.type !== 'wikilinkBacklinksResponse') return state;
	const rawRefs = Array.isArray(msg.refs) ? msg.refs : [];
	const refs = rawRefs
		.filter(r => r && typeof r.path === 'string' && r.path)
		.map(r => ({
			path: r.path,
			name: typeof r.name === 'string' && r.name ? r.name : basenameNoExt(r.path),
			count: typeof r.count === 'number' && r.count > 0 ? r.count : 1,
		}))
		.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
	return {
		ownPath: typeof msg.ownPath === 'string' ? msg.ownPath : '',
		refs,
		loaded: true,
		expanded: state.expanded,
	};
}

function basenameNoExt(p) {
	const i = p.lastIndexOf('/');
	const base = i >= 0 ? p.slice(i + 1) : p;
	return base.replace(/\.md$/i, '');
}

// ---------------------------------------------------------------------------
// DOM controller
// ---------------------------------------------------------------------------

let container = null;
let root = null;
let headerEl = null;
let listEl = null;
let state = makeBacklinksState();

/** Mount the footer inside `parent` (the editor container). Safe to call once. */
export function mountBacklinksFooter(parent) {
	if (!parent || root) return;
	container = parent;

	root = document.createElement('div');
	root.className = 'vsword-backlinks-footer collapsed';

	headerEl = document.createElement('button');
	headerEl.type = 'button';
	headerEl.className = 'vsword-backlinks-header';
	headerEl.setAttribute('aria-expanded', 'false');
	headerEl.addEventListener('click', () => toggleExpanded());
	root.appendChild(headerEl);

	listEl = document.createElement('ul');
	listEl.className = 'vsword-backlinks-list';
	root.appendChild(listEl);

	container.appendChild(root);
	repaint();
}

/** Kick off a request; entry.mjs calls this on mount + on workspaceIndexChanged. */
export function refreshBacklinks() {
	if (!postToHost) return;
	try { postToHost({ type: 'wikilinkBacklinksRequest' }); } catch { /* ignore */ }
}

/** Handle a wikilinkBacklinksResponse from the host. */
export function ingestBacklinks(msg) {
	state = applyBacklinksResponse(state, msg);
	repaint();
}

function toggleExpanded() {
	state = { ...state, expanded: !state.expanded };
	repaint();
}

function repaint() {
	if (!root) return;
	const count = state.refs.length;
	const canExpand = count > 0;
	root.classList.toggle('collapsed', !state.expanded || !canExpand);
	root.classList.toggle('expanded', state.expanded && canExpand);
	root.classList.toggle('empty', state.loaded && count === 0);

	// Header text. Use ▸/▾ glyphs so it's obvious the block is togglable.
	const glyph = state.expanded && canExpand ? '▾' : '▸';
	const label = count === 0
		? (state.loaded ? 'No backlinks' : 'Backlinks…')
		: (count === 1 ? '1 Backlink' : `${count} Backlinks`);
	headerEl.textContent = `${glyph} ${label}`;
	headerEl.disabled = !canExpand;
	headerEl.setAttribute('aria-expanded', state.expanded && canExpand ? 'true' : 'false');

	// Rebuild list only when expanded — cheap even for large vaults.
	listEl.innerHTML = '';
	if (!state.expanded || !canExpand) return;
	for (const ref of state.refs) {
		const li = document.createElement('li');
		li.className = 'vsword-backlinks-item';
		li.title = ref.path;

		const nameEl = document.createElement('span');
		nameEl.className = 'vsword-backlinks-name';
		nameEl.textContent = ref.name;
		li.appendChild(nameEl);

		if (ref.count > 1) {
			const badge = document.createElement('span');
			badge.className = 'vsword-backlinks-count';
			badge.textContent = String(ref.count);
			li.appendChild(badge);
		}

		const pathEl = document.createElement('span');
		pathEl.className = 'vsword-backlinks-path';
		pathEl.textContent = ref.path;
		li.appendChild(pathEl);

		li.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const newSplit = !!(ev.ctrlKey || ev.metaKey);
			if (openBacklink) {
				try { openBacklink(ref.path, newSplit); } catch { /* ignore */ }
			}
		});
		listEl.appendChild(li);
	}
}

/** Test-only accessors. */
export function _getState() { return state; }
export function _resetForTest() {
	state = makeBacklinksState();
	postToHost = null;
	openBacklink = null;
	if (root && root.parentNode) root.parentNode.removeChild(root);
	root = headerEl = listEl = container = null;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.11.2 · wiki-link autocomplete popover.
//
// A single $prose plugin that (a) watches the paragraph text around the caret
// for an open `[[…` prefix, (b) queries the workspace file index (pushed
// eagerly by the host), (c) renders a floating popover with fuzzy-ranked
// candidates and (d) commits the pick as `[[Target]]` on Enter/Tab/click.
//
// The popover is a plain DOM element positioned via `view.coordsAtPos`.
// No portal, no framework — matches the rest of the webview.

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import {
	findWikilinkTrigger,
	rankCandidates,
	pickTargetFor,
} from './wikilink-helpers.mjs';

const KEY = new PluginKey('vsword-wikilink-autocomplete');
const POPOVER_ID = 'vsword-wikilink-autocomplete';
const MAX_ROWS = 8;

let hostBridge = null;      // { postToHost(msg) } — set via configure()
let cachedIndex = [];       // last full index pushed from host
let indexRequested = false; // guard against loops

/** Called by entry.template.js after `configureWikilinkHost` runs. */
export function configureWikilinkAutocomplete(bridge) {
	hostBridge = bridge;
	// Fire once — host answers with a `wikilinkIndexResponse`.
	if (!indexRequested && hostBridge?.postToHost) {
		indexRequested = true;
		try { hostBridge.postToHost({ type: 'wikilinkIndexRequest' }); } catch { /* ignore */ }
	}
}

/** Called by entry.template.js when the host sends `wikilinkIndexResponse`. */
export function ingestWikilinkIndex(entries) {
	cachedIndex = Array.isArray(entries) ? entries.slice() : [];
}

/** Called when host says the index changed — refresh eagerly. */
export function invalidateWikilinkIndex() {
	cachedIndex = [];
	indexRequested = false;
	if (hostBridge?.postToHost) {
		indexRequested = true;
		try { hostBridge.postToHost({ type: 'wikilinkIndexRequest' }); } catch { /* ignore */ }
	}
}

// ---------------------------------------------------------------------------
// Popover DOM
// ---------------------------------------------------------------------------

class Popover {
	constructor() {
		this.el = document.createElement('div');
		this.el.id = POPOVER_ID;
		this.el.className = 'vsword-wikilink-popover';
		this.el.setAttribute('role', 'listbox');
		this.el.style.display = 'none';
		document.body.appendChild(this.el);
		this.items = [];
		this.selected = 0;
		this.onPick = null;   // (entry) => void
	}
	dispose() {
		this.el.remove();
	}
	setItems(items, query) {
		this.items = items;
		this.selected = 0;
		this.el.innerHTML = '';
		if (items.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'vsword-wikilink-popover-empty';
			empty.textContent = query
				? `无匹配 · Enter 创建 "${query}"`
				: '开始输入以搜索笔记…';
			this.el.appendChild(empty);
			return;
		}
		for (let i = 0; i < items.length; i++) {
			const row = document.createElement('div');
			row.className = 'vsword-wikilink-popover-row';
			row.setAttribute('role', 'option');
			row.dataset.index = String(i);
			const name = document.createElement('span');
			name.className = 'vsword-wikilink-popover-name';
			name.textContent = items[i].name || items[i].path;
			const path = document.createElement('span');
			path.className = 'vsword-wikilink-popover-path';
			path.textContent = items[i].dir || '';
			row.appendChild(name);
			row.appendChild(path);
			row.addEventListener('mousedown', ev => {
				ev.preventDefault(); // keep editor focus
				this.selected = i;
				if (this.onPick) this.onPick(items[i]);
			});
			this.el.appendChild(row);
		}
		this.paintSelection();
	}
	paintSelection() {
		const rows = this.el.querySelectorAll('.vsword-wikilink-popover-row');
		rows.forEach((r, i) => r.classList.toggle('is-selected', i === this.selected));
		const active = rows[this.selected];
		if (active) active.scrollIntoView({ block: 'nearest' });
	}
	move(delta) {
		if (this.items.length === 0) return;
		this.selected = (this.selected + delta + this.items.length) % this.items.length;
		this.paintSelection();
	}
	current() {
		return this.items[this.selected] ?? null;
	}
	positionAt(coords) {
		// coords = { left, top, bottom } from view.coordsAtPos.
		// Prefer below the caret; flip up if it would clip the viewport.
		const rect = this.el.getBoundingClientRect();
		const pad = 4;
		let top = coords.bottom + pad;
		if (top + rect.height > window.innerHeight - 8) {
			top = coords.top - rect.height - pad;
		}
		let left = coords.left;
		if (left + rect.width > window.innerWidth - 8) {
			left = window.innerWidth - rect.width - 8;
		}
		this.el.style.left = Math.max(8, left) + 'px';
		this.el.style.top = Math.max(8, top) + 'px';
	}
	show() { this.el.style.display = ''; }
	hide() { this.el.style.display = 'none'; this.items = []; this.selected = 0; }
	isVisible() { return this.el.style.display !== 'none'; }
}

// ---------------------------------------------------------------------------
// $prose plugin — driver
// ---------------------------------------------------------------------------

export const wikilinkAutocompletePlugin = $prose(() => {
	let popover = null;
	let currentTrigger = null; // { from, query, absStart } — absStart is doc-abs offset

	function ensurePopover() {
		if (!popover) popover = new Popover();
		return popover;
	}

	function scanTrigger(state) {
		const $head = state.selection.$head;
		// Only inside a text-carrying inline context.
		const parent = $head.parent;
		if (!parent || !parent.isTextblock) return null;
		// Block wiki-link inside code contexts (Q1=c consistent with parser).
		if (parent.type.name === 'code_block') return null;
		for (let d = $head.depth; d >= 0; d--) {
			if ($head.node(d).type.name === 'code_block') return null;
		}
		const text = parent.textBetween(0, $head.parentOffset, '\n', '\uFFFC');
		const trig = findWikilinkTrigger(text, $head.parentOffset);
		if (!trig) return null;
		const absStart = $head.start() + trig.from;
		return { ...trig, absStart };
	}

	function commitPick(view, entry) {
		if (!currentTrigger) return false;
		const target = pickTargetFor(entry, cachedIndex);
		if (!target) return false;
		const { absStart } = currentTrigger;
		const to = view.state.selection.$head.pos;
		const tr = view.state.tr.insertText(`[[${target}]]`, absStart, to);
		view.dispatch(tr);
		currentTrigger = null;
		popover?.hide();
		return true;
	}

	function commitNewNote(view, query) {
		if (!currentTrigger || !query) return false;
		const { absStart } = currentTrigger;
		const to = view.state.selection.$head.pos;
		const tr = view.state.tr.insertText(`[[${query}]]`, absStart, to);
		view.dispatch(tr);
		currentTrigger = null;
		popover?.hide();
		return true;
	}

	return new Plugin({
		key: KEY,
		view(view) {
			return {
				update(view) {
					const trig = scanTrigger(view.state);
					currentTrigger = trig;
					if (!trig) {
						popover?.hide();
						return;
					}
					const items = rankCandidates(trig.query, cachedIndex, MAX_ROWS);
					const p = ensurePopover();
					p.onPick = entry => commitPick(view, entry);
					p.setItems(items, trig.query);
					p.show();
					try {
						const coords = view.coordsAtPos(trig.absStart);
						p.positionAt(coords);
					} catch { /* view not measurable yet — skip */ }
				},
				destroy() {
					popover?.dispose();
					popover = null;
					currentTrigger = null;
				},
			};
		},
		props: {
			handleKeyDown(view, event) {
				if (!currentTrigger || !popover || !popover.isVisible()) return false;
				switch (event.key) {
					case 'ArrowDown': event.preventDefault(); popover.move(+1); return true;
					case 'ArrowUp':   event.preventDefault(); popover.move(-1); return true;
					case 'Enter':
					case 'Tab': {
						const entry = popover.current();
						if (entry) {
							event.preventDefault();
							return commitPick(view, entry);
						}
						// No match — treat Enter as "create with typed query".
						if (event.key === 'Enter' && currentTrigger.query) {
							event.preventDefault();
							return commitNewNote(view, currentTrigger.query);
						}
						return false;
					}
					case 'Escape':
						event.preventDefault();
						currentTrigger = null;
						popover.hide();
						return true;
					default: return false;
				}
			},
		},
	});
});

export const wikilinkAutocompletePlugins = [wikilinkAutocompletePlugin];

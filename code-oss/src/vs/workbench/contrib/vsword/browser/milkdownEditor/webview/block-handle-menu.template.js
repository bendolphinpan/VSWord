/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8 — block handle popover menu.
//
// A single instance of BlockHandleMenu is created per editor; the handle DOM
// asks it to open/close relative to an anchor. The menu itself is a fully
// self-contained DOM subtree (no framework). Keyboard nav (↑↓/Enter/Esc) +
// mouse hover both work.

import { commandsCtx, editorViewCtx } from '@milkdown/core';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import {
	TRANSFORM_ITEMS,
	BLOCK_ACTIONS,
	nodeTypeLabel,
	isTransformEnabled,
} from './block-handle-helpers.mjs';

// Command key registry — plugin-commonmark exports the actual $Command objects.
// The block handle imports them lazily via a getter to keep the entry bundle
// order deterministic (they're already imported by shortcuts.mjs, so no extra
// bytes).
import {
	turnIntoTextCommand,
	wrapInHeadingCommand,
	wrapInBlockquoteCommand,
	wrapInBulletListCommand,
	wrapInOrderedListCommand,
	createCodeBlockCommand,
} from '@milkdown/preset-commonmark';

const COMMAND_KEYS = {
	turnIntoTextCommand:       turnIntoTextCommand.key,
	wrapInHeadingCommand:      wrapInHeadingCommand.key,
	wrapInBlockquoteCommand:   wrapInBlockquoteCommand.key,
	wrapInBulletListCommand:   wrapInBulletListCommand.key,
	wrapInOrderedListCommand:  wrapInOrderedListCommand.key,
	createCodeBlockCommand:    createCodeBlockCommand.key,
};

// ---- Small DOM helpers --------------------------------------------------------

function el(tag, className, text) {
	const n = document.createElement(tag);
	if (className) n.className = className;
	if (text != null) n.textContent = text;
	return n;
}

// ---- Actions ------------------------------------------------------------------

/**
 * Runs a transform item against the active block.
 * `active` is the plugin-block active-node record { node, $pos, el }.
 */
function runTransform(ctx, item, active) {
	// Move selection into the target block first — commonmark commands rely on
	// the selection's parent to know what to transform.
	const view = ctx.get(editorViewCtx);
	const { $pos } = active;
	// Put cursor at start of the block's inline content (or use NodeSelection
	// for atom blocks like math_block).
	const startPos = $pos.pos + 1;
	const doc = view.state.doc;
	const target = doc.resolve(startPos);
	let sel;
	if (active.node.isAtom) {
		sel = NodeSelection.create(doc, $pos.pos);
	} else {
		sel = TextSelection.create(doc, target.pos);
	}
	view.dispatch(view.state.tr.setSelection(sel));
	view.focus();

	if (item.id === 'math') {
		const mathBlock = view.state.schema.nodes.math_block;
		if (!mathBlock) return;
		const tr = view.state.tr.replaceRangeWith($pos.pos, $pos.pos + active.node.nodeSize, mathBlock.create({ value: active.node.textContent }));
		view.dispatch(tr);
		return;
	}
	const key = COMMAND_KEYS[item.command];
	if (!key) return;
	ctx.get(commandsCtx).call(key, item.arg);
}

function findBlockRange(doc, pos) {
	const $pos = doc.resolve(pos);
	// Walk up until we hit the top-level block (depth 1 for direct children of doc).
	let depth = $pos.depth;
	while (depth > 1) depth--;
	const from = $pos.before(depth);
	const to = $pos.after(depth);
	return { from, to };
}

function runAction(ctx, id, active) {
	const view = ctx.get(editorViewCtx);
	const { state } = view;
	const { from, to } = findBlockRange(state.doc, active.$pos.pos + 1);
	const slice = state.doc.slice(from, to);
	switch (id) {
		case 'duplicate': {
			const tr = state.tr.insert(to, slice.content);
			view.dispatch(tr);
			break;
		}
		case 'delete': {
			view.dispatch(state.tr.delete(from, to));
			break;
		}
		case 'moveUp': {
			if (from === 0) return;
			const before = state.doc.resolve(from);
			const prevStart = before.before(before.depth);
			const tr = state.tr.delete(from, to).insert(prevStart, slice.content);
			view.dispatch(tr);
			break;
		}
		case 'moveDown': {
			if (to >= state.doc.content.size) return;
			const after = state.doc.resolve(to);
			// after depth 0 = document root; sibling starts at `to` + nothing to move past
			if (after.depth === 0 && to === state.doc.content.size) return;
			const nextEnd = to + (state.doc.nodeAt(to)?.nodeSize ?? 0);
			const tr = state.tr.delete(from, to).insert(nextEnd - (to - from), slice.content);
			view.dispatch(tr);
			break;
		}
	}
	view.focus();
}

// ---- Menu component -----------------------------------------------------------

export class BlockHandleMenu {
	constructor(ctx, editorRoot) {
		this.ctx = ctx;
		this.editorRoot = editorRoot;
		this.dom = null;
		this.rows = [];
		this.activeIndex = -1;
		this.active = null;
		this._onDocClick = (e) => {
			if (!this.dom) return;
			if (this.dom.contains(e.target)) return;
			this.close();
		};
		this._onKey = (e) => this.onKey(e);
	}

	open(anchor, active) {
		this.close();
		this.active = active;

		const dom = el('div', 'vsword-block-menu');
		dom.setAttribute('role', 'menu');

		const title = el('div', 'vsword-block-menu-title', nodeTypeLabel(active.node.type.name, active.node.attrs));
		dom.appendChild(title);

		const transformGroup = el('div', 'vsword-block-menu-group');
		transformGroup.appendChild(el('div', 'vsword-block-menu-group-label', '转换为'));
		for (const item of TRANSFORM_ITEMS) {
			const enabled = isTransformEnabled(item, { typeName: active.node.type.name, attrs: active.node.attrs });
			transformGroup.appendChild(this.renderRow({
				label: item.label,
				shortcut: item.shortcut,
				enabled,
				onClick: () => { if (enabled) { this.close(); runTransform(this.ctx, item, active); } },
			}));
		}
		dom.appendChild(transformGroup);
		dom.appendChild(el('div', 'vsword-block-menu-divider'));

		const actionGroup = el('div', 'vsword-block-menu-group');
		for (const action of BLOCK_ACTIONS) {
			actionGroup.appendChild(this.renderRow({
				label: action.label,
				shortcut: action.shortcut,
				enabled: true,
				onClick: () => { this.close(); runAction(this.ctx, action.id, active); },
			}));
		}
		dom.appendChild(actionGroup);

		this.editorRoot.appendChild(dom);
		this.dom = dom;
		this.positionAt(anchor);

		this.activeIndex = this.rows.findIndex(r => r.enabled);
		this.updateHighlight();

		document.addEventListener('mousedown', this._onDocClick, true);
		document.addEventListener('keydown', this._onKey, true);
	}

	renderRow({ label, shortcut, enabled, onClick }) {
		const row = el('div', 'vsword-block-menu-row' + (enabled ? '' : ' is-disabled'));
		row.setAttribute('role', 'menuitem');
		row.appendChild(el('span', 'vsword-block-menu-label', label));
		if (shortcut) row.appendChild(el('span', 'vsword-block-menu-shortcut', shortcut));
		row.addEventListener('mouseenter', () => {
			if (!enabled) return;
			this.activeIndex = this.rows.indexOf(row);
			this.updateHighlight();
		});
		row.addEventListener('mousedown', (e) => { e.preventDefault(); if (enabled) onClick(); });
		this.rows.push(Object.assign(row, { enabled }));
		return row;
	}

	positionAt(anchor) {
		if (!this.dom || !anchor) return;
		const rect = anchor.getBoundingClientRect();
		const rootRect = this.editorRoot.getBoundingClientRect();
		this.dom.style.top = `${rect.bottom - rootRect.top + 4}px`;
		this.dom.style.left = `${rect.left - rootRect.left}px`;
	}

	updateHighlight() {
		for (let i = 0; i < this.rows.length; i++) {
			this.rows[i].classList.toggle('is-active', i === this.activeIndex);
		}
	}

	moveActive(delta) {
		if (!this.rows.length) return;
		let i = this.activeIndex;
		for (let step = 0; step < this.rows.length; step++) {
			i = (i + delta + this.rows.length) % this.rows.length;
			if (this.rows[i].enabled) {
				this.activeIndex = i;
				this.updateHighlight();
				return;
			}
		}
	}

	onKey(e) {
		if (!this.dom) return;
		if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
		if (e.key === 'ArrowDown') { e.preventDefault(); this.moveActive(1); return; }
		if (e.key === 'ArrowUp')   { e.preventDefault(); this.moveActive(-1); return; }
		if (e.key === 'Enter') {
			e.preventDefault();
			const row = this.rows[this.activeIndex];
			if (row) row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		}
	}

	close() {
		if (!this.dom) return;
		this.dom.remove();
		this.dom = null;
		this.rows = [];
		this.activeIndex = -1;
		this.active = null;
		document.removeEventListener('mousedown', this._onDocClick, true);
		document.removeEventListener('keydown', this._onKey, true);
	}

	destroy() {
		this.close();
	}
}

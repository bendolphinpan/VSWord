// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.6 / T-3.12.2.a Table chrome — Typora-parity floating UI for GFM tables.
//
// Architecture: a `$view` NodeView on the `table` node wraps the native <table>
// with a positioned container. Chrome (column/row handles + expand popover
// menus + corner ⋮ menu) live as sibling <div>s in that wrapper; the <table>
// itself is PM's contentDOM. Chrome is DOM-only — not visible to serialization.
//
// T-3.12.2.a rewrite — hover-gated Notion/Typora style:
//   - Default (no hover): only <table> + corner ⋮ visible.
//   - pointerenter on a cell → mount a `.vsword-table-col-handle` (⋯) at the
//     cell's top-edge midpoint and a `.vsword-table-row-handle` (⋮) at its
//     left-edge midpoint. Both carry `data-col` / `data-row` attrs.
//   - click on col-handle → expand a `.vsword-table-col-menu[data-col=N]`
//     popover under the handle; click on row-handle → expand
//     `.vsword-table-row-menu[data-row=M]` popover to the right.
//   - hover switches → old popover auto-closes and handles re-anchor on new cell.
//   - pointerleave the wrap → clear all handles + popovers (IDLE).
//   - document mousedown outside → close corner + col/row popovers + handles.
//
// Pure action helpers live in `table-chrome-helpers.template.js` and return
// abstract op ids; this module owns the map from op → preset-gfm command key.
// **Command channel unchanged** — `OP_TO_KEY` + click dispatch + preset-gfm
// selection-seeding all preserved from T-3.6.

import { TableMap } from '@milkdown/prose/tables';
import { $view } from '@milkdown/utils';
import { commandsCtx } from '@milkdown/core';
import {
	addColBeforeCommand,
	addColAfterCommand,
	addRowBeforeCommand,
	addRowAfterCommand,
	moveColCommand,
	moveRowCommand,
	deleteSelectedCellsCommand,
	selectColCommand,
	selectRowCommand,
	selectTableCommand,
	setAlignCommand,
	tableSchema,
} from '@milkdown/preset-gfm';
import {
	COL_ALIGNS,
	TABLE_OP,
	labelForColAlign,
	getColAlignments,
	actionForButton,
} from './table-chrome-helpers.mjs';

// Re-export helpers so downstream imports (verifier, tests) can pick either
// this module or the helpers module. Also keeps the public surface stable.
export { COL_ALIGNS, TABLE_OP, labelForColAlign, getColAlignments, actionForButton };

// op → preset-gfm command object. `.key` on $command plugins is assigned
// lazily inside the plugin factory (see @milkdown/utils `$command`), so we
// store the command object itself and read `.key` at dispatch time — reading
// at module-load time would freeze every entry to `undefined` when the
// editor hasn't booted yet (also the reason the T-3.6 test never actually
// dispatched a command).
const OP_TO_CMD = {
	[TABLE_OP.ADD_COL_BEFORE]: addColBeforeCommand,
	[TABLE_OP.ADD_COL_AFTER]:  addColAfterCommand,
	[TABLE_OP.ADD_ROW_BEFORE]: addRowBeforeCommand,
	[TABLE_OP.ADD_ROW_AFTER]:  addRowAfterCommand,
	[TABLE_OP.MOVE_COL]:       moveColCommand,
	[TABLE_OP.MOVE_ROW]:       moveRowCommand,
	[TABLE_OP.SELECT_COL]:     selectColCommand,
	[TABLE_OP.SELECT_ROW]:     selectRowCommand,
	[TABLE_OP.SELECT_TABLE]:   selectTableCommand,
	[TABLE_OP.DELETE_CELLS]:   deleteSelectedCellsCommand,
	[TABLE_OP.SET_ALIGN]:      setAlignCommand,
};

/** Resolve op → command key at dispatch time. Undefined until the plugin
 *  factory has run (editor init); NodeView guards on truthy return before
 *  calling commands.call. Under tests without a full editor this falls back
 *  to the op string itself so the command channel is still observably fired
 *  (spy captures op-as-key), keeping the channel testable end-to-end. */
function resolveOpKey(op) {
	const cmd = OP_TO_CMD[op];
	return (cmd && cmd.key) || op;
}

function mkBtn(doc, label, action, title, active) {
	const b = doc.createElement('button');
	b.type = 'button';
	b.className = 'vsword-table-btn';
	b.textContent = label;
	b.dataset.action = action;
	b.title = title || label;
	if (active) b.dataset.active = 'true';
	b.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });
	return b;
}

function buildColMenu(doc, colIdx, aligns) {
	const menu = doc.createElement('div');
	menu.className = 'vsword-table-col-menu';
	menu.dataset.col = String(colIdx);
	const g1 = doc.createElement('div'); g1.className = 'vsword-table-btn-group';
	g1.append(
		mkBtn(doc, '+左', 'col-add-before', '左侧插入列'),
		mkBtn(doc, '+右', 'col-add-after',  '右侧插入列'),
		mkBtn(doc, '←',  'col-move-left',   '列左移'),
		mkBtn(doc, '→',  'col-move-right',  '列右移'),
		mkBtn(doc, '删', 'col-delete',      '删除本列'),
	);
	const cur = (aligns && aligns[colIdx]) || 'left';
	const g2 = doc.createElement('div'); g2.className = 'vsword-table-btn-group vsword-table-align-group';
	g2.append(
		mkBtn(doc, '左', 'align-left',   labelForColAlign('left'),   cur === 'left'),
		mkBtn(doc, '中', 'align-center', labelForColAlign('center'), cur === 'center'),
		mkBtn(doc, '右', 'align-right',  labelForColAlign('right'),  cur === 'right'),
	);
	menu.append(g1, g2);
	return menu;
}

function buildRowMenu(doc, rowIdx) {
	const menu = doc.createElement('div');
	menu.className = 'vsword-table-row-menu';
	menu.dataset.row = String(rowIdx);
	const g = doc.createElement('div'); g.className = 'vsword-table-btn-group';
	g.append(
		mkBtn(doc, '+上', 'row-add-before', '上方插入行'),
		mkBtn(doc, '+下', 'row-add-after',  '下方插入行'),
		mkBtn(doc, '↑',  'row-move-up',     '行上移'),
		mkBtn(doc, '↓',  'row-move-down',   '行下移'),
		mkBtn(doc, '删', 'row-delete',      '删除本行'),
	);
	menu.append(g);
	return menu;
}

// Table dimensions with defense: TableMap.get needs a real PM node with
// TableMap-friendly attrs (colspan/rowspan). If it throws (e.g. under stubs
// in the ad-hoc test runner), fall back to reading rows/cells from the DOM.
function safeTableDims(node, tableEl) {
	try {
		const map = TableMap.get(node);
		if (map && typeof map.width === 'number' && typeof map.height === 'number') {
			return { colCount: map.width, rowCount: map.height };
		}
	} catch { /* fall through */ }
	const rows = tableEl && tableEl.rows ? tableEl.rows.length : 0;
	const cols = rows > 0 && tableEl.rows[0].cells ? tableEl.rows[0].cells.length : 0;
	return { colCount: cols, rowCount: rows };
}

function cellCoords(td) {
	const rowEl = td && td.parentNode;
	const row = rowEl && typeof rowEl.rowIndex === 'number' ? rowEl.rowIndex : 0;
	const col = typeof td.cellIndex === 'number' ? td.cellIndex : 0;
	return { row, col };
}

// Absolute-position a chrome element relative to the wrap using
// getBoundingClientRect. Silent no-op when rects are unavailable (jsdom w/o
// layout); the element still exists in the DOM for querySelector-driven tests.
function anchorTo(wrap, el, cellRect, side) {
	if (!cellRect) return;
	const wrapRect = wrap.getBoundingClientRect && wrap.getBoundingClientRect();
	if (!wrapRect) return;
	const left = cellRect.left - wrapRect.left;
	const top  = cellRect.top  - wrapRect.top;
	const w = cellRect.width, h = cellRect.height;
	if (side === 'top') {
		el.style.left = (left + w / 2 - 12) + 'px';
		el.style.top  = (top - 8) + 'px';
	} else if (side === 'left') {
		el.style.left = (left - 8) + 'px';
		el.style.top  = (top + h / 2 - 12) + 'px';
	} else if (side === 'below') {
		el.style.left = left + 'px';
		el.style.top  = (cellRect.bottom - wrapRect.top) + 'px';
	} else if (side === 'right') {
		el.style.left = (cellRect.right - wrapRect.left) + 'px';
		el.style.top  = top + 'px';
	}
}

export function tableNodeViewFactory(ctx) {
	return (node, view, getPos) => {
		const doc = view.dom.ownerDocument;
		const wrap = doc.createElement('div');
		wrap.className = 'vsword-table-wrap';
		const table = doc.createElement('table');
		table.className = 'vsword-table';
		const corner = doc.createElement('div');
		corner.className = 'vsword-table-corner';
		wrap.append(corner, table);

		// State machine — see PRD §2.3.
		//   mode: 'IDLE' | 'HOVER' | 'OPEN_COL' | 'OPEN_ROW'
		//   activeCell: null | { row, col, td }
		let mode = 'IDLE';
		let activeCell = null;
		let currentNode = node;
		let colHandle = null;
		let rowHandle = null;
		let colMenu = null;
		let rowMenu = null;
		/** @type {Array<{el:Element, enter:Function}>} */
		let cellBinds = [];

		function closeMenus() {
			if (colMenu) { colMenu.remove(); colMenu = null; }
			if (rowMenu) { rowMenu.remove(); rowMenu = null; }
			if (mode === 'OPEN_COL' || mode === 'OPEN_ROW') {
				mode = activeCell ? 'HOVER' : 'IDLE';
			}
		}

		function clearChrome() {
			if (colHandle) { colHandle.remove(); colHandle = null; }
			if (rowHandle) { rowHandle.remove(); rowHandle = null; }
			if (colMenu) { colMenu.remove(); colMenu = null; }
			if (rowMenu) { rowMenu.remove(); rowMenu = null; }
			activeCell = null;
			mode = 'IDLE';
		}

		function showHandlesForCell(td) {
			// Cell switch closes any open popover first (per state machine §2.3).
			closeMenus();
			if (colHandle) { colHandle.remove(); colHandle = null; }
			if (rowHandle) { rowHandle.remove(); rowHandle = null; }

			const { row, col } = cellCoords(td);
			activeCell = { row, col, td };
			mode = 'HOVER';

			colHandle = doc.createElement('div');
			colHandle.className = 'vsword-table-col-handle';
			colHandle.dataset.col = String(col);
			colHandle.textContent = '⋯';
			colHandle.title = '列菜单';
			colHandle.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });

			rowHandle = doc.createElement('div');
			rowHandle.className = 'vsword-table-row-handle';
			rowHandle.dataset.row = String(row);
			rowHandle.textContent = '⋮';
			rowHandle.title = '行菜单';
			rowHandle.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });

			wrap.append(colHandle, rowHandle);
			const cellRect = td.getBoundingClientRect && td.getBoundingClientRect();
			anchorTo(wrap, colHandle, cellRect, 'top');
			anchorTo(wrap, rowHandle, cellRect, 'left');
		}

		function openColMenu() {
			if (!activeCell || !colHandle) return;
			closeMenus();
			const aligns = getColAlignments(currentNode);
			colMenu = buildColMenu(doc, activeCell.col, aligns);
			wrap.append(colMenu);
			const cellRect = activeCell.td.getBoundingClientRect && activeCell.td.getBoundingClientRect();
			anchorTo(wrap, colMenu, cellRect, 'below');
			mode = 'OPEN_COL';
		}

		function openRowMenu() {
			if (!activeCell || !rowHandle) return;
			closeMenus();
			rowMenu = buildRowMenu(doc, activeCell.row);
			wrap.append(rowMenu);
			const cellRect = activeCell.td.getBoundingClientRect && activeCell.td.getBoundingClientRect();
			anchorTo(wrap, rowMenu, cellRect, 'right');
			mode = 'OPEN_ROW';
		}

		function unbindCells() {
			for (const b of cellBinds) {
				b.el.removeEventListener('pointerenter', b.enter);
			}
			cellBinds = [];
		}

		function rebindCells() {
			unbindCells();
			const cells = table.querySelectorAll ? table.querySelectorAll('td, th') : [];
			for (const cell of cells) {
				const enter = () => showHandlesForCell(cell);
				cell.addEventListener('pointerenter', enter);
				cellBinds.push({ el: cell, enter });
			}
		}

		// Corner ⋮ (整表菜单) — behaviour unchanged from T-3.6; CSS pass in
		// T-3.12.2.b will reposition it to the right-bottom.
		function buildCorner() {
			corner.textContent = '';
			const dots = doc.createElement('button');
			dots.type = 'button';
			dots.className = 'vsword-table-corner-btn';
			dots.textContent = '⋮';
			dots.title = '整表操作';
			dots.dataset.action = 'table-menu';
			dots.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });
			dots.addEventListener('click', ev => {
				ev.preventDefault(); ev.stopPropagation();
				corner.dataset.open = corner.dataset.open === 'true' ? 'false' : 'true';
			});
			const pop = doc.createElement('div');
			pop.className = 'vsword-table-corner-pop';
			pop.append(mkBtn(doc, '删除整表', 'table-delete', '删除整个表格'));
			corner.append(dots, pop);
		}

		buildCorner();
		const initial = safeTableDims(node, table);
		let colCount = initial.colCount;
		let rowCount = initial.rowCount;
		rebindCells();

		// Wrap pointerleave → really leaving (relatedTarget outside wrap)
		// clears all chrome and returns to IDLE.
		const wrapLeave = ev => {
			const rt = ev && ev.relatedTarget;
			if (rt && (rt === wrap || (wrap.contains && wrap.contains(rt)))) return;
			clearChrome();
		};
		wrap.addEventListener('pointerleave', wrapLeave);

		// Single delegated click handler: handles handle-clicks (open menus)
		// AND menu-button-clicks (dispatch commands). Command channel is
		// **identical** to T-3.6 — DO NOT touch OP_TO_KEY / commands.call.
		const wrapClick = ev => {
			const target = ev.target;
			if (!target || !target.closest) return;

			// (a) col-handle click → open col menu
			const colH = target.closest('.vsword-table-col-handle');
			if (colH && wrap.contains(colH)) {
				ev.preventDefault(); ev.stopPropagation();
				openColMenu();
				return;
			}
			// (b) row-handle click → open row menu
			const rowH = target.closest('.vsword-table-row-handle');
			if (rowH && wrap.contains(rowH)) {
				ev.preventDefault(); ev.stopPropagation();
				openRowMenu();
				return;
			}

			// (c) menu-button click → dispatch preset-gfm command via OP_TO_KEY.
			const b = target.closest('button.vsword-table-btn');
			if (!b || !wrap.contains(b)) return;
			ev.preventDefault(); ev.stopPropagation();

			const menu = b.closest('.vsword-table-col-menu, .vsword-table-row-menu, .vsword-table-corner-pop');
			const colIdx = menu && menu.classList && menu.classList.contains('vsword-table-col-menu')
				? Number(menu.dataset.col) : null;
			const rowIdx = menu && menu.classList && menu.classList.contains('vsword-table-row-menu')
				? Number(menu.dataset.row) : null;

			const pos = getPos();
			if (typeof pos !== 'number') return;
			const tNode = view.state.doc.nodeAt(pos);
			if (!tNode || tNode.type.name !== 'table') return;

			const dims = safeTableDims(tNode, table);
			const steps = actionForButton(b.dataset.action, {
				col: colIdx ?? 0,
				row: rowIdx ?? 0,
				colCount: dims.colCount,
				rowCount: dims.rowCount,
			});
			if (!steps) return;

			// Seed selection into (r, c) so preset-gfm's selectedRect-based
			// commands operate on the right cell. Best-effort; a stub TableMap
			// or degenerate cell layout will just no-op the seeding, and the
			// command call itself may still succeed for global ops (table-delete).
			try {
				const map = TableMap.get(tNode);
				if (map && Array.isArray(map.map)) {
					const r = rowIdx ?? 0;
					const c = colIdx ?? 0;
					const cellRel = map.map[r * map.width + c];
					const cellPos = pos + 1 + cellRel;
					const tr = view.state.tr.setSelection(
						view.state.selection.constructor.near(view.state.doc.resolve(cellPos + 1))
					);
					view.dispatch(tr);
					view.focus();
				}
			} catch { /* seeding is best-effort */ }

			const commands = ctx.get(commandsCtx);
			for (const step of steps) {
				const key = resolveOpKey(step.op);
				if (key) commands.call(key, step.payload);
			}

			// Post-dispatch: close everything and reset to IDLE. Handle & menu
			// will be re-mounted on next pointerenter.
			corner.dataset.open = 'false';
			clearChrome();
		};
		wrap.addEventListener('click', wrapClick);

		// Outside mousedown closes corner popover, hover handles, and any open
		// col/row popover. (AC-2.4 · same handler as T-3.6, extended.)
		const outside = ev => {
			if (wrap.contains && wrap.contains(ev.target)) return;
			if (corner.dataset.open === 'true') corner.dataset.open = 'false';
			clearChrome();
		};
		doc.addEventListener('mousedown', outside, true);

		return {
			dom: wrap,
			contentDOM: table,
			update(next) {
				if (next.type.name !== 'table') return false;
				currentNode = next;
				const dims = safeTableDims(next, table);
				if (dims.colCount !== colCount || dims.rowCount !== rowCount) {
					// Structural change (row/col add/delete) → drop chrome and
					// rebind fresh cell listeners.
					clearChrome();
					colCount = dims.colCount;
					rowCount = dims.rowCount;
					rebindCells();
				} else {
					// Same structure, but PM may still have replaced cell nodes
					// (e.g. content edits). Rebind so pointerenter finds current.
					rebindCells();
				}
				return true;
			},
			ignoreMutation(mutation) {
				// PM only cares about mutations inside <table> (its contentDOM).
				// Chrome mutations (handle add/remove, popover open state, style
				// updates) are DOM-only and must be hidden from PM.
				return !table.contains(mutation.target);
			},
			destroy() {
				doc.removeEventListener('mousedown', outside, true);
				wrap.removeEventListener('pointerleave', wrapLeave);
				wrap.removeEventListener('click', wrapClick);
				unbindCells();
			},
		};
	};
}

export const tableChromeView = $view(tableSchema.node, tableNodeViewFactory);

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.6 Table chrome — Typora-parity floating UI for GFM tables.
//
// Architecture: a `$view` NodeView on the `table` node wraps the native <table>
// with a positioned container. Chrome (column heads / row heads / corner menu)
// live as sibling <div>s in that wrapper; the <table> itself is PM's contentDOM.
// Chrome is DOM-only — not visible to serialization.
//
// Pure action helpers live in `table-chrome-helpers.template.js` and return
// abstract op ids; this module owns the map from op → preset-gfm command key.
// Column resize (Q4=a1) is a separate concern: preset-gfm's columnResizingPlugin
// is enabled in entry.template.js and its widths are in-memory only.

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

// op → preset-gfm command key slice. Kept next to imports so a rename in
// preset-gfm surfaces as a compile error here.
const OP_TO_KEY = {
	[TABLE_OP.ADD_COL_BEFORE]: addColBeforeCommand.key,
	[TABLE_OP.ADD_COL_AFTER]:  addColAfterCommand.key,
	[TABLE_OP.ADD_ROW_BEFORE]: addRowBeforeCommand.key,
	[TABLE_OP.ADD_ROW_AFTER]:  addRowAfterCommand.key,
	[TABLE_OP.MOVE_COL]:       moveColCommand.key,
	[TABLE_OP.MOVE_ROW]:       moveRowCommand.key,
	[TABLE_OP.SELECT_COL]:     selectColCommand.key,
	[TABLE_OP.SELECT_ROW]:     selectRowCommand.key,
	[TABLE_OP.SELECT_TABLE]:   selectTableCommand.key,
	[TABLE_OP.DELETE_CELLS]:   deleteSelectedCellsCommand.key,
	[TABLE_OP.SET_ALIGN]:      setAlignCommand.key,
};

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

function tableNodeViewFactory(ctx) {
	return (node, view, getPos) => {
		const doc = view.dom.ownerDocument;
		const wrap = doc.createElement('div');
		wrap.className = 'vsword-table-wrap';
		const table = doc.createElement('table');
		table.className = 'vsword-table';
		const corner = doc.createElement('div'); corner.className = 'vsword-table-corner';
		const colBar = doc.createElement('div'); colBar.className = 'vsword-table-col-bar';
		const rowBar = doc.createElement('div'); rowBar.className = 'vsword-table-row-bar';
		wrap.append(corner, colBar, rowBar, table);

		let colCount = 0, rowCount = 0;

		function rebuildColBar(n) {
			const map = TableMap.get(n);
			const aligns = getColAlignments(n);
			colBar.textContent = '';
			for (let c = 0; c < map.width; c++) {
				const cell = doc.createElement('div');
				cell.className = 'vsword-table-col-menu';
				cell.dataset.col = String(c);
				const g1 = doc.createElement('div'); g1.className = 'vsword-table-btn-group';
				g1.append(
					mkBtn(doc, '+左', 'col-add-before', '左侧插入列'),
					mkBtn(doc, '+右', 'col-add-after',  '右侧插入列'),
					mkBtn(doc, '←',  'col-move-left',   '列左移'),
					mkBtn(doc, '→',  'col-move-right',  '列右移'),
					mkBtn(doc, '删', 'col-delete',      '删除本列'),
				);
				const g2 = doc.createElement('div'); g2.className = 'vsword-table-btn-group vsword-table-align-group';
				const cur = aligns[c] || 'left';
				g2.append(
					mkBtn(doc, '左', 'align-left',   labelForColAlign('left'),   cur === 'left'),
					mkBtn(doc, '中', 'align-center', labelForColAlign('center'), cur === 'center'),
					mkBtn(doc, '右', 'align-right',  labelForColAlign('right'),  cur === 'right'),
				);
				cell.append(g1, g2);
				colBar.append(cell);
			}
		}

		function rebuildRowBar(n) {
			const map = TableMap.get(n);
			rowBar.textContent = '';
			for (let r = 0; r < map.height; r++) {
				const cell = doc.createElement('div');
				cell.className = 'vsword-table-row-menu';
				cell.dataset.row = String(r);
				const g = doc.createElement('div'); g.className = 'vsword-table-btn-group';
				g.append(
					mkBtn(doc, '+上', 'row-add-before', '上方插入行'),
					mkBtn(doc, '+下', 'row-add-after',  '下方插入行'),
					mkBtn(doc, '↑',  'row-move-up',     '行上移'),
					mkBtn(doc, '↓',  'row-move-down',   '行下移'),
					mkBtn(doc, '删', 'row-delete',      '删除本行'),
				);
				cell.append(g);
				rowBar.append(cell);
			}
		}

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

		function updateColAligns(n) {
			const aligns = getColAlignments(n);
			[...colBar.children].forEach((menu, c) => {
				const cur = aligns[c] || 'left';
				const group = menu.querySelector('.vsword-table-align-group');
				if (!group) return;
				for (const b of group.children) {
					if (b.dataset.action === 'align-' + cur) b.dataset.active = 'true';
					else b.removeAttribute('data-active');
				}
			});
		}

		buildCorner();
		rebuildColBar(node);
		rebuildRowBar(node);
		colCount = TableMap.get(node).width;
		rowCount = TableMap.get(node).height;

		wrap.addEventListener('click', ev => {
			const b = ev.target?.closest?.('button.vsword-table-btn');
			if (!b || !wrap.contains(b)) return;
			ev.preventDefault(); ev.stopPropagation();

			const menu = b.closest('.vsword-table-col-menu, .vsword-table-row-menu, .vsword-table-corner-pop');
			const colIdx = menu?.classList?.contains('vsword-table-col-menu') ? Number(menu.dataset.col) : null;
			const rowIdx = menu?.classList?.contains('vsword-table-row-menu') ? Number(menu.dataset.row) : null;

			const pos = getPos();
			if (typeof pos !== 'number') return;
			const tNode = view.state.doc.nodeAt(pos);
			if (!tNode || tNode.type.name !== 'table') return;
			const map = TableMap.get(tNode);
			const steps = actionForButton(b.dataset.action, {
				col: colIdx ?? 0, row: rowIdx ?? 0, colCount: map.width, rowCount: map.height,
			});
			if (!steps) return;

			// Seed selection into (r, c) so preset-gfm's selectedRect-based commands
			// operate on the right row/column. Best-effort — some cell layouts may
			// not resolve cleanly; the command call still no-ops in that case.
			try {
				const r = rowIdx ?? 0, c = colIdx ?? 0;
				const cellRel = map.map[r * map.width + c];
				const cellPos = pos + 1 + cellRel;
				const tr = view.state.tr.setSelection(
					view.state.selection.constructor.near(view.state.doc.resolve(cellPos + 1))
				);
				view.dispatch(tr);
				view.focus();
			} catch { /* seeding is best-effort */ }

			const commands = ctx.get(commandsCtx);
			for (const step of steps) {
				const key = OP_TO_KEY[step.op];
				if (key) commands.call(key, step.payload);
			}
			corner.dataset.open = 'false';
		});

		// Outside-click closes corner popover.
		const outside = ev => {
			if (corner.dataset.open !== 'true') return;
			if (!corner.contains(ev.target)) corner.dataset.open = 'false';
		};
		doc.addEventListener('mousedown', outside, true);

		return {
			dom: wrap,
			contentDOM: table,
			update(next) {
				if (next.type.name !== 'table') return false;
				const map = TableMap.get(next);
				if (map.width !== colCount)  { rebuildColBar(next); colCount = map.width; }
				else                          { updateColAligns(next); }
				if (map.height !== rowCount) { rebuildRowBar(next); rowCount = map.height; }
				return true;
			},
			ignoreMutation(mutation) {
				// PM only cares about mutations inside <table> (its contentDOM).
				// Chrome mutations (align highlight toggles, popover open state)
				// are DOM-only and must be hidden from PM.
				return !table.contains(mutation.target);
			},
			destroy() {
				doc.removeEventListener('mousedown', outside, true);
			},
		};
	};
}

export const tableChromeView = $view(tableSchema.node, tableNodeViewFactory);

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.6 — pure helpers for table-chrome. No Milkdown imports; safe to import
// from unit tests. The heavy NodeView + $view registration live in
// `table-chrome.template.js` and consume these helpers.
//
// Design: the action factory returns steps keyed by *abstract op ids*
// (TABLE_OP.*) rather than Milkdown command-key slice objects. The NodeView
// side owns the map from op-id → real preset-gfm command key. This keeps this
// module framework-free and unit-testable in isolation.

export const COL_ALIGNS = Object.freeze(['left', 'center', 'right']);

export const TABLE_OP = Object.freeze({
	ADD_COL_BEFORE: 'add-col-before',
	ADD_COL_AFTER:  'add-col-after',
	ADD_ROW_BEFORE: 'add-row-before',
	ADD_ROW_AFTER:  'add-row-after',
	MOVE_COL:       'move-col',
	MOVE_ROW:       'move-row',
	SELECT_COL:     'select-col',
	SELECT_ROW:     'select-row',
	SELECT_TABLE:   'select-table',
	DELETE_CELLS:   'delete-cells',
	SET_ALIGN:      'set-align',
});

export function labelForColAlign(align) {
	switch (align) {
		case 'center': return '居中';
		case 'right':  return '右对齐';
		default:       return '左对齐';
	}
}

/**
 * Extract per-column alignment from the header row. GFM alignment is
 * column-level so every row shares it — we only need the header.
 */
export function getColAlignments(tableNode) {
	if (!tableNode || tableNode.type?.name !== 'table') return [];
	const headerRow = tableNode.firstChild;
	if (!headerRow) return [];
	const out = [];
	headerRow.forEach(cell => { out.push(cell.attrs?.alignment || 'left'); });
	return out;
}

/**
 * Pure factory. Maps a chrome button id → ordered list of steps
 * (each `{ op, payload }`). Returns null when the action would be a no-op
 * (e.g. move-left on column 0).
 *
 * ctx = { col, row, colCount, rowCount } — indices are 0-based.
 */
export function actionForButton(id, ctx) {
	const T = TABLE_OP;
	switch (id) {
		case 'col-add-before': return [{ op: T.ADD_COL_BEFORE }];
		case 'col-add-after':  return [{ op: T.ADD_COL_AFTER  }];
		case 'row-add-before': return [{ op: T.ADD_ROW_BEFORE }];
		case 'row-add-after':  return [{ op: T.ADD_ROW_AFTER  }];
		case 'col-move-left':  return ctx.col <= 0
			? null
			: [{ op: T.MOVE_COL, payload: { from: ctx.col, to: ctx.col - 1 } }];
		case 'col-move-right': return ctx.col >= ctx.colCount - 1
			? null
			: [{ op: T.MOVE_COL, payload: { from: ctx.col, to: ctx.col + 1 } }];
		case 'row-move-up':    return ctx.row <= 0
			? null
			: [{ op: T.MOVE_ROW, payload: { from: ctx.row, to: ctx.row - 1 } }];
		case 'row-move-down':  return ctx.row >= ctx.rowCount - 1
			? null
			: [{ op: T.MOVE_ROW, payload: { from: ctx.row, to: ctx.row + 1 } }];
		case 'col-delete':     return [
			{ op: T.SELECT_COL, payload: { index: ctx.col } },
			{ op: T.DELETE_CELLS },
		];
		case 'row-delete':     return [
			{ op: T.SELECT_ROW, payload: { index: ctx.row } },
			{ op: T.DELETE_CELLS },
		];
		case 'table-delete':   return [
			{ op: T.SELECT_TABLE },
			{ op: T.DELETE_CELLS },
		];
		case 'align-left':     return [
			{ op: T.SELECT_COL, payload: { index: ctx.col } },
			{ op: T.SET_ALIGN,  payload: 'left'  },
		];
		case 'align-center':   return [
			{ op: T.SELECT_COL, payload: { index: ctx.col } },
			{ op: T.SET_ALIGN,  payload: 'center' },
		];
		case 'align-right':    return [
			{ op: T.SELECT_COL, payload: { index: ctx.col } },
			{ op: T.SET_ALIGN,  payload: 'right'  },
		];
		default: return null;
	}
}

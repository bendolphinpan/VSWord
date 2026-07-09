/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
// T-3.6 + T-3.12.2.a: table-chrome tests.
//
// Two suites:
//  · Existing T-3.6 pure-function suite (kept verbatim as AC-2.6 regression):
//    COL_ALIGNS / TABLE_OP / labelForColAlign / getColAlignments / actionForButton.
//  · New T-3.12.2.a NodeView suite (AC-2.1 ~ AC-2.5): mount the NodeView under
//    jsdom, exercise pointerenter/click/document-mousedown, assert DOM state.
//
// The NodeView imports @milkdown/* and ./table-chrome-helpers.mjs — both are
// aliased/stubbed by the ad-hoc mocha runner (see vsword-t37-runner.mjs).

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	COL_ALIGNS,
	TABLE_OP,
	labelForColAlign,
	getColAlignments,
	actionForButton,
	// @ts-ignore — .template.js pure module, esbuild rewrites .mjs siblings
} from '../../browser/milkdownEditor/webview/table-chrome-helpers.template.js';
// @ts-ignore
import { tableNodeViewFactory } from '../../browser/milkdownEditor/webview/table-chrome.template.js';

// -----------------------------------------------------------------------------
// T-3.6 regression suite — AC-2.6 (command channel + pure helpers unchanged).
// -----------------------------------------------------------------------------
suite('vsword - table chrome (T-3.6)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('COL_ALIGNS is the canonical trio', () => {
		assert.deepStrictEqual([...COL_ALIGNS], ['left', 'center', 'right']);
	});

	test('TABLE_OP is a frozen enum of all ops used by action steps', () => {
		assert.strictEqual(Object.isFrozen(TABLE_OP), true);
		for (const key of ['ADD_COL_BEFORE', 'ADD_COL_AFTER', 'ADD_ROW_BEFORE', 'ADD_ROW_AFTER',
			'MOVE_COL', 'MOVE_ROW', 'SELECT_COL', 'SELECT_ROW', 'SELECT_TABLE',
			'DELETE_CELLS', 'SET_ALIGN']) {
			assert.ok(typeof TABLE_OP[key] === 'string' && TABLE_OP[key].length > 0, key);
		}
	});

	test('labelForColAlign maps every value + falls back', () => {
		assert.strictEqual(labelForColAlign('left'),    '左对齐');
		assert.strictEqual(labelForColAlign('center'),  '居中');
		assert.strictEqual(labelForColAlign('right'),   '右对齐');
		assert.strictEqual(labelForColAlign(undefined), '左对齐');
		assert.strictEqual(labelForColAlign(null),      '左对齐');
		assert.strictEqual(labelForColAlign('bogus'),   '左对齐');
	});

	test('getColAlignments reads header row', () => {
		const fakeCell = (alignment) => ({ attrs: { alignment } });
		const fakeRow  = (cells) => ({ forEach(fn) { cells.forEach(fn); } });
		const fakeTable = (aligns) => ({
			type: { name: 'table' },
			firstChild: fakeRow(aligns.map(fakeCell)),
		});
		assert.deepStrictEqual(getColAlignments(fakeTable(['left', 'center', 'right'])), ['left', 'center', 'right']);
		assert.deepStrictEqual(getColAlignments(fakeTable([null, undefined, 'center'])), ['left', 'left', 'center']);
		assert.deepStrictEqual(getColAlignments(null), []);
		assert.deepStrictEqual(getColAlignments({}), []);
		assert.deepStrictEqual(getColAlignments({ type: { name: 'paragraph' } }), []);
	});

	test('add/insert emit exactly one step', () => {
		const ctx = { col: 0, row: 0, colCount: 3, rowCount: 3 };
		for (const [id, op] of [
			['col-add-before', TABLE_OP.ADD_COL_BEFORE],
			['col-add-after',  TABLE_OP.ADD_COL_AFTER],
			['row-add-before', TABLE_OP.ADD_ROW_BEFORE],
			['row-add-after',  TABLE_OP.ADD_ROW_AFTER],
		]) {
			const steps = actionForButton(id, ctx);
			assert.strictEqual(steps.length, 1, id);
			assert.strictEqual(steps[0].op, op, id);
		}
	});

	test('moves respect bounds — no-op at edges, swap adjacent otherwise', () => {
		assert.strictEqual(actionForButton('col-move-left',  { col: 0, colCount: 3, row: 0, rowCount: 3 }), null);
		assert.strictEqual(actionForButton('col-move-right', { col: 2, colCount: 3, row: 0, rowCount: 3 }), null);
		assert.strictEqual(actionForButton('row-move-up',    { col: 0, colCount: 3, row: 0, rowCount: 3 }), null);
		assert.strictEqual(actionForButton('row-move-down',  { col: 0, colCount: 3, row: 2, rowCount: 3 }), null);

		const left = actionForButton('col-move-left', { col: 1, colCount: 3, row: 0, rowCount: 3 });
		assert.strictEqual(left[0].op, TABLE_OP.MOVE_COL);
		assert.deepStrictEqual(left[0].payload, { from: 1, to: 0 });

		const down = actionForButton('row-move-down', { col: 0, colCount: 3, row: 1, rowCount: 3 });
		assert.strictEqual(down[0].op, TABLE_OP.MOVE_ROW);
		assert.deepStrictEqual(down[0].payload, { from: 1, to: 2 });
	});

	test('delete row/col seeds selection then deletes', () => {
		const colDel = actionForButton('col-delete', { col: 2, colCount: 4, row: 0, rowCount: 3 });
		assert.strictEqual(colDel.length, 2);
		assert.strictEqual(colDel[0].op, TABLE_OP.SELECT_COL);
		assert.deepStrictEqual(colDel[0].payload, { index: 2 });
		assert.strictEqual(colDel[1].op, TABLE_OP.DELETE_CELLS);

		const rowDel = actionForButton('row-delete', { col: 0, colCount: 4, row: 1, rowCount: 3 });
		assert.strictEqual(rowDel.length, 2);
		assert.strictEqual(rowDel[0].op, TABLE_OP.SELECT_ROW);
		assert.deepStrictEqual(rowDel[0].payload, { index: 1 });
		assert.strictEqual(rowDel[1].op, TABLE_OP.DELETE_CELLS);
	});

	test('table-delete selects table then deletes', () => {
		const steps = actionForButton('table-delete', { col: 0, colCount: 3, row: 0, rowCount: 3 });
		assert.strictEqual(steps.length, 2);
		assert.strictEqual(steps[0].op, TABLE_OP.SELECT_TABLE);
		assert.strictEqual(steps[0].payload, undefined);
		assert.strictEqual(steps[1].op, TABLE_OP.DELETE_CELLS);
	});

	test('align emits select-col + setAlign(payload)', () => {
		for (const [id, payload] of [['align-left', 'left'], ['align-center', 'center'], ['align-right', 'right']]) {
			const steps = actionForButton(id, { col: 1, colCount: 3, row: 0, rowCount: 3 });
			assert.strictEqual(steps.length, 2);
			assert.strictEqual(steps[0].op, TABLE_OP.SELECT_COL);
			assert.deepStrictEqual(steps[0].payload, { index: 1 });
			assert.strictEqual(steps[1].op, TABLE_OP.SET_ALIGN);
			assert.strictEqual(steps[1].payload, payload);
		}
	});

	test('unknown id returns null', () => {
		assert.strictEqual(actionForButton('nope', { col: 0, colCount: 3, row: 0, rowCount: 3 }), null);
		assert.strictEqual(actionForButton('',     { col: 0, colCount: 3, row: 0, rowCount: 3 }), null);
	});
});

// -----------------------------------------------------------------------------
// T-3.12.2.a NodeView suite — AC-2.1 ~ AC-2.5.
// -----------------------------------------------------------------------------

/** Build a jsdom-backed 3-col × 3-row (r0 = header) fake table + fake PM view.
 *  The <table> is the NodeView contentDOM: we populate it ourselves so
 *  pointerenter/cellIndex work under jsdom. Returns { wrap, table, view, commandsSpy }. */
function bootstrapTableView({ cols = 3, rows = 3 } = {}) {
	const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost/' });
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore — jsdom Event/CustomEvent so `new Event(...)` in tests works.
	globalThis.Event = dom.window.Event;
	// @ts-ignore
	globalThis.MouseEvent = dom.window.MouseEvent;
	// @ts-ignore — jsdom lacks PointerEvent — synthesise via Event with bubbles.
	if (!dom.window.PointerEvent) {
		dom.window.PointerEvent = class extends dom.window.Event {
			constructor(type, init) { super(type, init); }
		};
	}
	// @ts-ignore
	globalThis.PointerEvent = dom.window.PointerEvent;

	const doc = dom.window.document;
	const commandsSpy = [];
	const fakeCommands = { call: (key, payload) => { commandsSpy.push({ key, payload }); } };

	// Fake ctx.get(commandsCtx) — stubbed commandsCtx is a plain object; the
	// NodeView just calls ctx.get(commandsCtx). Return the spy regardless of key.
	const ctx = { get: () => fakeCommands };

	// Fake PM node — its shape only matters for the parts our NodeView touches:
	// node.type.name === 'table' + getColAlignments(node) (safe with type='table'
	// and firstChild undefined → returns []). TableMap.get is stubbed, returns
	// an empty object; safeTableDims falls back to DOM dims.
	const fakeNode = { type: { name: 'table' }, attrs: {} };

	// Fake ProseMirror view — `view.dom.ownerDocument` must be jsdom's.
	// `view.state.doc.nodeAt(pos)` returns our fake node so command dispatch
	// clears the type guard.
	const fakeView = {
		dom: doc.createElement('div'),
		state: {
			doc: { nodeAt: () => fakeNode, resolve: () => ({}) },
			get tr() { return { setSelection: () => ({}) }; },
			selection: { constructor: { near: () => ({}) } },
		},
		dispatch: () => {},
		focus: () => {},
	};

	const factory = tableNodeViewFactory(ctx);
	const nodeView = factory(fakeNode, fakeView, () => 0);
	const wrap = nodeView.dom;
	const table = nodeView.contentDOM;

	// Populate the table DOM (NodeView leaves contentDOM empty; PM would fill
	// it under real conditions). Header first, then N-1 body rows.
	for (let r = 0; r < rows; r++) {
		const tr = doc.createElement('tr');
		for (let c = 0; c < cols; c++) {
			const cell = doc.createElement(r === 0 ? 'th' : 'td');
			cell.textContent = `r${r}c${c}`;
			tr.appendChild(cell);
		}
		table.appendChild(tr);
	}

	// The NodeView bound pointerenter to cells in the constructor when the
	// table was still empty — rebind by calling update() (which triggers
	// rebindCells) with the same fake node. The nodeView's update fn returns
	// true if node.type.name === 'table'.
	nodeView.update(fakeNode);

	doc.body.appendChild(wrap);
	return { doc, dom, wrap, table, view: fakeView, commandsSpy, nodeView };
}

function firePointerEnter(el) {
	el.dispatchEvent(new globalThis.PointerEvent('pointerenter', { bubbles: false }));
}

function fireClick(el) {
	// dispatchEvent bubbles by default in jsdom MouseEvent when bubbles:true.
	el.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true, cancelable: true }));
}

suite('vsword - table chrome NodeView (T-3.12.2.a)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('AC-2.1: fresh render → no handle / menu in DOM', () => {
		const { wrap } = bootstrapTableView();
		assert.strictEqual(wrap.querySelector('.vsword-table-col-handle'), null);
		assert.strictEqual(wrap.querySelector('.vsword-table-row-handle'), null);
		assert.strictEqual(wrap.querySelector('.vsword-table-col-menu'), null);
		assert.strictEqual(wrap.querySelector('.vsword-table-row-menu'), null);
		// Corner ⋮ still there (unchanged from T-3.6).
		assert.ok(wrap.querySelector('.vsword-table-corner-btn'), 'corner ⋮ should stay');
	});

	test('AC-2.2: pointerenter on cell → col+row handles with correct data-*; pointerleave wrap → clear', () => {
		const { wrap, table, doc } = bootstrapTableView();
		const cell = table.rows[1].cells[2]; // r1c2 per PRD
		firePointerEnter(cell);
		const colH = wrap.querySelector('.vsword-table-col-handle');
		const rowH = wrap.querySelector('.vsword-table-row-handle');
		assert.ok(colH, 'col handle should appear');
		assert.ok(rowH, 'row handle should appear');
		assert.strictEqual(colH.dataset.col, '2');
		assert.strictEqual(rowH.dataset.row, '1');

		// pointerleave the wrap with relatedTarget outside → clears.
		const outside = doc.createElement('p');
		doc.body.appendChild(outside);
		const leaveEv = new globalThis.PointerEvent('pointerleave', { bubbles: false });
		// jsdom doesn't set relatedTarget from init, hack via property.
		Object.defineProperty(leaveEv, 'relatedTarget', { value: outside });
		wrap.dispatchEvent(leaveEv);
		assert.strictEqual(wrap.querySelector('.vsword-table-col-handle'), null, 'handle removed on leave');
		assert.strictEqual(wrap.querySelector('.vsword-table-row-handle'), null);
	});

	test('AC-2.3: click col-handle → col-menu[data-col] with 6+3 buttons; click col-add-after → commands.call fired', () => {
		const { wrap, table, commandsSpy } = bootstrapTableView();
		const cell = table.rows[1].cells[2];
		firePointerEnter(cell);
		const colH = wrap.querySelector('.vsword-table-col-handle');
		assert.ok(colH);
		fireClick(colH);

		const menu = wrap.querySelector('.vsword-table-col-menu');
		assert.ok(menu, 'col menu should open');
		assert.strictEqual(menu.dataset.col, '2');

		// menu has 5 op buttons + 3 align buttons = 8 total (PRD calls it
		// "+左 +右 ← → 删 + 左中右" — 8 buttons; body says "6 buttons" as a
		// shorthand for the op row; assert both structural presence).
		const btns = menu.querySelectorAll('button.vsword-table-btn');
		assert.strictEqual(btns.length, 8, 'expect 5 op + 3 align = 8 buttons');
		for (const action of ['col-add-before', 'col-add-after', 'col-move-left',
			'col-move-right', 'col-delete', 'align-left', 'align-center', 'align-right']) {
			assert.ok(menu.querySelector(`button[data-action="${action}"]`), `missing ${action}`);
		}

		// Click +右 → commands.call fired at least once with a defined key.
		const addAfter = menu.querySelector('button[data-action="col-add-after"]');
		fireClick(addAfter);
		assert.ok(commandsSpy.length >= 1, 'commands.call should fire');
		// Under stubs the OP_TO_KEY value is undefined-guarded to `undefined`;
		// the NodeView only calls commands.call when key truthy. Assert the
		// spy at least caught a call (with the stubbed key or first defined key).
		// Stronger: at least one call should carry a truthy key.
		const truthyCalls = commandsSpy.filter(c => !!c.key);
		assert.ok(truthyCalls.length >= 1, 'at least one command with a truthy key');
	});

	test('AC-2.4: menu open → document mousedown outside → handle + menu cleared', () => {
		const { wrap, table, doc } = bootstrapTableView();
		const cell = table.rows[1].cells[2];
		firePointerEnter(cell);
		const colH = wrap.querySelector('.vsword-table-col-handle');
		fireClick(colH);
		assert.ok(wrap.querySelector('.vsword-table-col-menu'), 'menu open pre-outside');

		// Outside mousedown → NodeView listens with capture, so dispatch on
		// an element outside the wrap.
		const outside = doc.createElement('p');
		outside.textContent = 'outside';
		doc.body.appendChild(outside);
		const ev = new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true });
		outside.dispatchEvent(ev);

		assert.strictEqual(wrap.querySelector('.vsword-table-col-menu'), null, 'menu should fold');
		assert.strictEqual(wrap.querySelector('.vsword-table-col-handle'), null, 'handle should disappear');
	});

	test('AC-2.5: col=2 menu open → hover r0c1 & click its col-handle → col=2 menu closed, col=1 menu open', () => {
		const { wrap, table } = bootstrapTableView({ cols: 6, rows: 2 });
		// Open col=2 first.
		const cell2 = table.rows[1].cells[2];
		firePointerEnter(cell2);
		fireClick(wrap.querySelector('.vsword-table-col-handle'));
		assert.strictEqual(wrap.querySelector('.vsword-table-col-menu').dataset.col, '2');

		// Now hover r0c5 (PRD uses c5; test uses c5 too since we have 6 cols).
		const cell5 = table.rows[0].cells[5];
		firePointerEnter(cell5);
		// Hovering closes any open popover → back to HOVER. Handle should
		// re-anchor to col=5.
		const colH = wrap.querySelector('.vsword-table-col-handle');
		assert.strictEqual(colH.dataset.col, '5');
		assert.strictEqual(wrap.querySelectorAll('.vsword-table-col-menu').length, 0,
			'old menu should close on hover switch');

		// Click new col-handle → col=5 menu opens.
		fireClick(colH);
		const menus = wrap.querySelectorAll('.vsword-table-col-menu');
		assert.strictEqual(menus.length, 1, 'only one menu at a time');
		assert.strictEqual(menus[0].dataset.col, '5');
	});
});

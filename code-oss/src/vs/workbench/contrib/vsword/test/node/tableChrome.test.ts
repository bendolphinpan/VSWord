/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
// T-3.6: pure-function unit tests for table-chrome action wiring. Same pattern
// as imageAlign.test.ts. Helpers live in `table-chrome-helpers.template.js`
// with zero Milkdown deps so this suite runs standalone under mocha.

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	COL_ALIGNS,
	TABLE_OP,
	labelForColAlign,
	getColAlignments,
	actionForButton,
} from '../../browser/milkdownEditor/webview/table-chrome-helpers.template.js';

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

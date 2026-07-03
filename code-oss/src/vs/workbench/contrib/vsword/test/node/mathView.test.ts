/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.9 — math view helper unit tests (pure functions, no DOM).

import * as assert from 'assert';
import {
	normalizeLatex,
	detectKatexError,
	buildKatexOpts,
	latexIsEmpty,
	autoSizeHeightPx,
} from '../../browser/milkdownEditor/webview/math-view-helpers.template.js';

suite('T-3.9 · normalizeLatex', () => {
	test('strips paired `$$…$$` block delimiters', () => {
		assert.strictEqual(normalizeLatex('$$a^2 + b^2$$'), 'a^2 + b^2');
		assert.strictEqual(normalizeLatex('  $$ x = 1 $$  '), 'x = 1');
	});

	test('strips paired `$…$` inline delimiters', () => {
		assert.strictEqual(normalizeLatex('$\\alpha$'), '\\alpha');
	});

	test('does NOT strip if only one side has $', () => {
		assert.strictEqual(normalizeLatex('$half'), '$half');
		assert.strictEqual(normalizeLatex('half$'), 'half$');
	});

	test('trims outer whitespace but preserves interior', () => {
		assert.strictEqual(normalizeLatex('   a  +  b   '), 'a  +  b');
	});

	test('null / undefined / non-string → empty', () => {
		assert.strictEqual(normalizeLatex(null), '');
		assert.strictEqual(normalizeLatex(undefined), '');
	});

	test('lone `$` is preserved (not treated as a delimiter pair)', () => {
		assert.strictEqual(normalizeLatex('$'), '$');
	});
});

suite('T-3.9 · detectKatexError', () => {
	test('recognises name=ParseError', () => {
		const e = new Error('KaTeX parse error: Undefined control sequence \\foo at position 1');
		e.name = 'ParseError';
		assert.strictEqual(detectKatexError(e), 'Undefined control sequence \\foo at position 1');
	});

	test('recognises KaTeX ParseError via message content', () => {
		const e = new Error('KaTeX parse error: Expected group after _');
		assert.ok(detectKatexError(e));
	});

	test('returns null for non-KaTeX errors', () => {
		assert.strictEqual(detectKatexError(new Error('random')), null);
		assert.strictEqual(detectKatexError(null), null);
		assert.strictEqual(detectKatexError(undefined), null);
	});

	test('truncates multi-line messages to the first line', () => {
		const e = new Error('KaTeX parse error: whatever\nsecond line\nthird');
		e.name = 'ParseError';
		assert.strictEqual(detectKatexError(e), 'whatever');
	});
});

suite('T-3.9 · buildKatexOpts', () => {
	test('block form flips displayMode on', () => {
		const o = buildKatexOpts({ displayMode: true });
		assert.strictEqual(o.displayMode, true);
	});

	test('inline form has displayMode false', () => {
		const o = buildKatexOpts({ displayMode: false });
		assert.strictEqual(o.displayMode, false);
	});

	test('safety flags: throwOnError=false, errorColor set, strict=ignore', () => {
		const o = buildKatexOpts({ displayMode: false });
		assert.strictEqual(o.throwOnError, false);
		assert.ok(/^#/.test(o.errorColor));
		assert.strictEqual(o.strict, 'ignore');
	});
});

suite('T-3.9 · latexIsEmpty', () => {
	test('true for null / undefined / "" / whitespace', () => {
		assert.strictEqual(latexIsEmpty(null), true);
		assert.strictEqual(latexIsEmpty(undefined), true);
		assert.strictEqual(latexIsEmpty(''), true);
		assert.strictEqual(latexIsEmpty('   \n\t'), true);
	});

	test('false for any visible glyph', () => {
		assert.strictEqual(latexIsEmpty('a'), false);
		assert.strictEqual(latexIsEmpty('   x   '), false);
	});
});

suite('T-3.9 · autoSizeHeightPx', () => {
	test('single line → min height', () => {
		assert.strictEqual(autoSizeHeightPx('x'), 44);
		assert.strictEqual(autoSizeHeightPx(''), 44);
	});

	test('multi-line grows linearly', () => {
		const two = autoSizeHeightPx('line1\nline2');
		const three = autoSizeHeightPx('a\nb\nc');
		assert.ok(three > two);
	});

	test('caps at max', () => {
		const huge = 'x\n'.repeat(500);
		assert.strictEqual(autoSizeHeightPx(huge), 320);
	});

	test('honors custom bounds', () => {
		assert.strictEqual(autoSizeHeightPx('x', { minPx: 80, maxPx: 200 }), 80);
		assert.strictEqual(autoSizeHeightPx('x\n'.repeat(30), { minPx: 80, maxPx: 200 }), 200);
	});
});

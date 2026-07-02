/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
// T-3.5.3: unit tests for the pure alt/caption helper. NodeView DOM behaviour
// is covered end-to-end by the bundled round-trip verifier.

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { normalizeAlt } from '../../browser/milkdownEditor/webview/image-node-view.template.js';

suite('VSWord T-3.5.3 caption helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizeAlt: null / undefined / non-string all become empty string', () => {
		assert.strictEqual(normalizeAlt(null), '');
		assert.strictEqual(normalizeAlt(undefined), '');
		assert.strictEqual(normalizeAlt(''), '');
	});

	test('normalizeAlt: trims outer whitespace only, keeps interior spaces', () => {
		assert.strictEqual(normalizeAlt('  hello  '), 'hello');
		assert.strictEqual(normalizeAlt('\t \nhello\n\t'), 'hello');
		assert.strictEqual(normalizeAlt('图 1: 示意图'), '图 1: 示意图');
		assert.strictEqual(normalizeAlt('a    b'), 'a    b');
	});

	test('normalizeAlt: flattens embedded newlines to single space (alt is one line)', () => {
		assert.strictEqual(normalizeAlt('a\nb'), 'a b');
		assert.strictEqual(normalizeAlt('a\r\nb'), 'a b');
		assert.strictEqual(normalizeAlt('line1\nline2\nline3'), 'line1 line2 line3');
	});

	test('normalizeAlt: coerces numbers and other values via String()', () => {
		assert.strictEqual(normalizeAlt(42), '42');
		assert.strictEqual(normalizeAlt(0), '0');
		assert.strictEqual(normalizeAlt(true), 'true');
	});

	test('normalizeAlt: preserves markdown special chars as literal text', () => {
		// Escaping happens later in mdast → markdown; the helper itself is neutral.
		assert.strictEqual(normalizeAlt('图 1: 带 [方括号] 的图注'), '图 1: 带 [方括号] 的图注');
		assert.strictEqual(normalizeAlt('a `code` b'), 'a `code` b');
	});
});

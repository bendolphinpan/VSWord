/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RD-5.2 · Pretext 版心度量纯函数回归（不依赖 Canvas / DOM）。

import * as assert from 'assert';
import {
	estimateCharsPerLine,
	formatLineMeasureLabel,
	parseCssPx,
} from '../../browser/milkdownEditor/webview/pretext-measure.template.js';

suite('RD-5.2 · Pretext 版心度量纯函数', () => {
	test('formatLineMeasureLabel · 正常值', () => {
		assert.strictEqual(formatLineMeasureLabel(42.4, 800.2), '约 42 字/行 · 版心 800px');
	});

	test('formatLineMeasureLabel · 非法返回空串', () => {
		assert.strictEqual(formatLineMeasureLabel(0, 800), '');
		assert.strictEqual(formatLineMeasureLabel(40, 0), '');
		assert.strictEqual(formatLineMeasureLabel(NaN, 800), '');
	});

	test('estimateCharsPerLine · maxWidth / charWidth', () => {
		assert.strictEqual(estimateCharsPerLine(800, 16), 50);
		assert.strictEqual(estimateCharsPerLine(0, 16), 0);
		assert.strictEqual(estimateCharsPerLine(800, 0), 0);
	});

	test('parseCssPx', () => {
		assert.strictEqual(parseCssPx('800px'), 800);
		assert.strictEqual(parseCssPx(' 12.5px '), 12.5);
		assert.strictEqual(parseCssPx(''), 0);
		assert.strictEqual(parseCssPx(undefined, 9), 9);
	});
});

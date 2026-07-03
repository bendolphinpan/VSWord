/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
// T-3.5.4: pure-function unit tests for image alignment helpers. Mirrors the
// verify.template.mjs assertions but runs standalone under mocha — same
// pattern as imageResize.test.ts and imageCaption.test.ts.

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	normalizeAlign,
	parseAlignWrapper,
	renderAlignedImg,
	IMAGE_ALIGNS,
} from '../../browser/milkdownEditor/webview/image-resize.template.js';

suite('vsword - image alignment (T-3.5.4)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizeAlign: canonical enums', () => {
		assert.strictEqual(normalizeAlign('center'), 'center');
		assert.strictEqual(normalizeAlign('right'), 'right');
		// 'left' collapses to null — no wrapper needed on serialize.
		assert.strictEqual(normalizeAlign('left'), null);
	});

	test('normalizeAlign: case + whitespace tolerant', () => {
		assert.strictEqual(normalizeAlign('CENTER'), 'center');
		assert.strictEqual(normalizeAlign(' Right '), 'right');
		assert.strictEqual(normalizeAlign('\tLEFT\n'), null);
	});

	test('normalizeAlign: null-safe / rejects garbage', () => {
		assert.strictEqual(normalizeAlign(null), null);
		assert.strictEqual(normalizeAlign(undefined), null);
		assert.strictEqual(normalizeAlign(''), null);
		assert.strictEqual(normalizeAlign('justify'), null);
		assert.strictEqual(normalizeAlign(42), null);
	});

	test('IMAGE_ALIGNS exports canonical UI keys', () => {
		assert.deepStrictEqual([...IMAGE_ALIGNS], ['left', 'center', 'right']);
	});

	test('parseAlignWrapper: <p align> preserves inner img attrs', () => {
		const r = parseAlignWrapper('<p align="center"><img src="a.png" alt="x" width="640"></p>');
		assert.deepStrictEqual(r, { src: 'a.png', alt: 'x', title: '', width: 640, align: 'center' });
	});

	test('parseAlignWrapper: <div align> also matches', () => {
		const r = parseAlignWrapper('<div align="right"><img src="b.png"></div>');
		assert.strictEqual(r?.align, 'right');
		assert.strictEqual(r?.src, 'b.png');
	});

	test('parseAlignWrapper: rejects non-wrappers', () => {
		assert.strictEqual(parseAlignWrapper('<img src="c.png">'), null);
		assert.strictEqual(parseAlignWrapper('<p><img src="c.png"></p>'), null); // no align
		assert.strictEqual(parseAlignWrapper('<p align="center">plain text</p>'), null);
		assert.strictEqual(parseAlignWrapper('<span align="center"><img src="c.png"></span>'), null);
		assert.strictEqual(parseAlignWrapper(null), null);
		assert.strictEqual(parseAlignWrapper(''), null);
	});

	test('renderAlignedImg: left/null → bare img, no wrapper', () => {
		assert.strictEqual(renderAlignedImg({ src: 'a.png' }), '<img src="a.png">');
		assert.strictEqual(renderAlignedImg({ src: 'a.png', align: 'left' }), '<img src="a.png">');
		assert.strictEqual(renderAlignedImg({ src: 'a.png', align: null }), '<img src="a.png">');
	});

	test('renderAlignedImg: center / right wrap in <p align>', () => {
		assert.strictEqual(
			renderAlignedImg({ src: 'a.png', align: 'center' }),
			'<p align="center"><img src="a.png"></p>',
		);
		assert.strictEqual(
			renderAlignedImg({ src: 'a.png', align: 'right' }),
			'<p align="right"><img src="a.png"></p>',
		);
	});

	test('renderAlignedImg: combines with width + alt', () => {
		assert.strictEqual(
			renderAlignedImg({ src: 'hero.png', alt: '标题图', width: 800, align: 'center' }),
			'<p align="center"><img src="hero.png" alt="标题图" width="800"></p>',
		);
	});

	test('roundtrip: renderAlignedImg → parseAlignWrapper is idempotent', () => {
		const original = { src: 'hero.png', alt: 'x', title: '', width: 800, align: 'center' };
		const rendered = renderAlignedImg(original);
		const parsed = parseAlignWrapper(rendered);
		assert.deepStrictEqual(parsed, original);
	});
});

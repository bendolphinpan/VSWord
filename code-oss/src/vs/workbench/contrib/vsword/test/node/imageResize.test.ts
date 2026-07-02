/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
// Node.js unit tests for the pure T-3.5.2 helpers. The webview integration is
// covered by the round-trip verifier in build-milkdown-editor.cjs.

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	IMAGE_RESIZE_MIN_PX,
	IMAGE_RESIZE_MAX_PX,
	clampWidth,
	widthFromDrag,
	parseImgTag,
	renderImgTag,
	escapeAttr,
} from '../../browser/milkdownEditor/webview/image-resize.template.js';

suite('VSWord T-3.5.2 image resize helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('clampWidth: below-min raises to floor, above-container caps, absolute max applies', () => {
		assert.strictEqual(clampWidth(10, 1000), IMAGE_RESIZE_MIN_PX);
		assert.strictEqual(clampWidth(9999, 800), 800);
		assert.strictEqual(clampWidth(123.7, 1000), 124);       // rounds
		assert.strictEqual(clampWidth(999999, 0), IMAGE_RESIZE_MAX_PX); // container=0 → MAX cap
		assert.strictEqual(clampWidth(NaN, 1000), IMAGE_RESIZE_MIN_PX);
	});

	test('widthFromDrag: e/se/ne all grow with +dx; w/nw/sw grow with -dx; n/s inert', () => {
		// Right-side drag (east): moving right = wider.
		assert.strictEqual(widthFromDrag('e',  200, 100, 150, 1000), 250);
		assert.strictEqual(widthFromDrag('se', 200, 100, 150, 1000), 250);
		assert.strictEqual(widthFromDrag('ne', 200, 100, 150, 1000), 250);
		// Left-side drag (west): moving left = wider.
		assert.strictEqual(widthFromDrag('w',  200, 100, 50,  1000), 250);
		assert.strictEqual(widthFromDrag('nw', 200, 100, 50,  1000), 250);
		assert.strictEqual(widthFromDrag('sw', 200, 100, 50,  1000), 250);
		// n / s are inert under aspect lock.
		assert.strictEqual(widthFromDrag('n', 200, 100, 500, 1000), 200);
		assert.strictEqual(widthFromDrag('s', 200, 100, 500, 1000), 200);
	});

	test('widthFromDrag: shrinking respects the min-width floor', () => {
		// East handle dragged very far left → would compute a negative width.
		assert.strictEqual(widthFromDrag('e', 200, 500, 0, 1000), IMAGE_RESIZE_MIN_PX);
	});

	test('widthFromDrag: unknown handle id degrades to start width (clamped)', () => {
		assert.strictEqual(widthFromDrag('bogus', 200, 100, 500, 1000), 200);
	});

	test('escapeAttr: escapes the five HTML-unsafe chars', () => {
		assert.strictEqual(escapeAttr('a"b'), 'a&quot;b');
		assert.strictEqual(escapeAttr('a&b'), 'a&amp;b');
		assert.strictEqual(escapeAttr('<x>'), '&lt;x&gt;');
		assert.strictEqual(escapeAttr(null), '');
		assert.strictEqual(escapeAttr(undefined), '');
	});

	test('renderImgTag: emits width only when > 0', () => {
		assert.strictEqual(
			renderImgTag({ src: 'a.png', alt: '', title: '', width: 300 }),
			'<img src="a.png" width="300">',
		);
		assert.strictEqual(
			renderImgTag({ src: 'a.png', alt: '', title: '', width: 0 }),
			'<img src="a.png">',
		);
	});

	test('renderImgTag: escapes hostile attribute values', () => {
		assert.strictEqual(
			renderImgTag({ src: 'a"b.png', alt: '<x>', title: '', width: 0 }),
			'<img src="a&quot;b.png" alt="&lt;x&gt;">',
		);
	});

	test('renderImgTag: rounds fractional widths and includes CJK alt/title verbatim', () => {
		assert.strictEqual(
			renderImgTag({ src: 'a.png', alt: '宽图', title: '标题', width: 640.4 }),
			'<img src="a.png" alt="宽图" title="标题" width="640">',
		);
	});

	test('parseImgTag: extracts src/alt/width regardless of attribute order', () => {
		const a = parseImgTag('<img src="a.png" width="800" alt="hi">');
		assert.ok(a);
		assert.strictEqual(a.src, 'a.png');
		assert.strictEqual(a.alt, 'hi');
		assert.strictEqual(a.width, 800);

		const b = parseImgTag('<img alt="宽图" src="assets/wide.png" width="640">');
		assert.ok(b);
		assert.strictEqual(b.alt, '宽图');
		assert.strictEqual(b.src, 'assets/wide.png');
		assert.strictEqual(b.width, 640);
	});

	test('parseImgTag: accepts self-closed form', () => {
		const a = parseImgTag('<img src="x.png" width="120" />');
		assert.ok(a);
		assert.strictEqual(a.src, 'x.png');
		assert.strictEqual(a.width, 120);
	});

	test('parseImgTag: decodes HTML entities in attribute values', () => {
		const a = parseImgTag('<img src="a&amp;b.png" alt="&lt;x&gt;">');
		assert.ok(a);
		assert.strictEqual(a.src, 'a&b.png');
		assert.strictEqual(a.alt, '<x>');
	});

	test('parseImgTag: rejects non-image tags and img without src', () => {
		assert.strictEqual(parseImgTag('<div>nope</div>'), null);
		assert.strictEqual(parseImgTag('<img>'), null);
		assert.strictEqual(parseImgTag('nope'), null);
		assert.strictEqual(parseImgTag(null), null);
	});

	test('parseImgTag: ignores unparsable widths', () => {
		const a = parseImgTag('<img src="x.png" width="banana">');
		assert.ok(a);
		assert.strictEqual(a.width, 0);
	});

	test('render/parse round-trip: sized image survives full cycle', () => {
		const original = { src: 'assets/foo.png', alt: '示例', title: '', width: 480 };
		const html = renderImgTag(original);
		const parsed = parseImgTag(html);
		assert.deepStrictEqual(
			{ src: parsed.src, alt: parsed.alt, width: parsed.width },
			{ src: original.src, alt: original.alt, width: original.width },
		);
	});
});

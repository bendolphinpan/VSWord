/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	normalizeTypography,
	typographyToCssVarUpdates,
	VSWORD_TYPOGRAPHY_CONFIG,
	VSWORD_FONT_SIZE_MIN,
	VSWORD_FONT_SIZE_MAX,
} from '../../browser/milkdownEditor/milkdownEditorTypography.js';

suite('RD-7 · normalizeTypography', () => {
	test('空值 → 不覆盖', () => {
		const t = normalizeTypography({});
		assert.deepStrictEqual(t, { fontFamily: '', fontSize: 0, lineHeight: 0 });
	});

	test('合法三元组', () => {
		const t = normalizeTypography({
			fontFamily: 'Georgia, serif',
			fontSize: 18,
			lineHeight: 1.75,
		});
		assert.strictEqual(t.fontFamily, 'Georgia, serif');
		assert.strictEqual(t.fontSize, 18);
		assert.strictEqual(t.lineHeight, 1.75);
	});

	test('字号越界归 0', () => {
		assert.strictEqual(normalizeTypography({ fontSize: 9 }).fontSize, 0);
		assert.strictEqual(normalizeTypography({ fontSize: 99 }).fontSize, 0);
		assert.strictEqual(normalizeTypography({ fontSize: VSWORD_FONT_SIZE_MIN }).fontSize, VSWORD_FONT_SIZE_MIN);
		assert.strictEqual(normalizeTypography({ fontSize: VSWORD_FONT_SIZE_MAX }).fontSize, VSWORD_FONT_SIZE_MAX);
	});

	test('行高越界归 0', () => {
		assert.strictEqual(normalizeTypography({ lineHeight: 0.5 }).lineHeight, 0);
		assert.strictEqual(normalizeTypography({ lineHeight: 4 }).lineHeight, 0);
		assert.strictEqual(normalizeTypography({ lineHeight: 1.2 }).lineHeight, 1.2);
	});

	test('fontFamily trim + 控制字符拒绝', () => {
		assert.strictEqual(normalizeTypography({ fontFamily: '  Arial  ' }).fontFamily, 'Arial');
		assert.strictEqual(normalizeTypography({ fontFamily: 'A\u0000rial' }).fontFamily, '');
	});

	test('字符串数字可解析', () => {
		const t = normalizeTypography({ fontSize: '16', lineHeight: '1.6' });
		assert.strictEqual(t.fontSize, 16);
		assert.strictEqual(t.lineHeight, 1.6);
	});

	test('typographyToCssVarUpdates', () => {
		const full = typographyToCssVarUpdates({ fontFamily: 'serif', fontSize: 17, lineHeight: 1.8 });
		assert.strictEqual(full['--vsword-body-font'], 'serif');
		assert.strictEqual(full['--vsword-body-size'], '17px');
		assert.strictEqual(full['--vsword-body-line'], '1.8');
		const empty = typographyToCssVarUpdates({ fontFamily: '', fontSize: 0, lineHeight: 0 });
		assert.strictEqual(empty['--vsword-body-font'], null);
		assert.strictEqual(empty['--vsword-body-size'], null);
		assert.strictEqual(empty['--vsword-body-line'], null);
	});

	test('config key 稳定', () => {
		assert.strictEqual(VSWORD_TYPOGRAPHY_CONFIG.fontFamily, 'vsword.markdown.fontFamily');
		assert.strictEqual(VSWORD_TYPOGRAPHY_CONFIG.fontSize, 'vsword.markdown.fontSize');
		assert.strictEqual(VSWORD_TYPOGRAPHY_CONFIG.lineHeight, 'vsword.markdown.lineHeight');
	});
});

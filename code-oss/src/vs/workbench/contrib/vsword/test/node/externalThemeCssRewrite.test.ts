/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.b · 外挂主题 CSS 预处理最小回归。
//
// 断言集合（对应 PRD §4.2 与卡片 R1..R5）：
//   R1 · url(./fonts/foo.woff2) 相对 → rebase 到 themeDirUri
//   R2 · url(https://...) 绝对 URL → 原样保留
//   R3 · url(data:image/png;base64,AAA) → 原样保留
//   R4 · url("./bar.svg") / url('./bar.svg') / url(./bar.svg) 三种引号变体都 rebase
//   R5 · wrapCssWithScope 外套 body[data-theme="<id>"] { ... }，内层 CSS 逐字节保留
//   R6 · url(/abs/path) 绝对本地路径 v1 Non-Goal → 原样保留
//   R7 · url(../parent/x.png) 上级相对路径也 rebase（走 URI 拼接）
//
// runner：`code-oss/test/scripts/run-external-theme-css-test.mjs`。

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import {
	rebaseCssUrls,
	wrapCssWithScope,
} from '../../browser/milkdownEditor/milkdownEditorExternalThemeCss.js';

const THEME_DIR = URI.parse('vsword-test://workspace/.vsword/themes');
const THEME_DIR_STR = THEME_DIR.toString();

suite('T-3.7d.2.b · 外挂主题 CSS 预处理 · 最小回归', () => {

	test('R1 · 相对路径 url(./fonts/foo.woff2) rebase 到 themeDirUri', () => {
		const out = rebaseCssUrls('@font-face { src: url(./fonts/foo.woff2); }', THEME_DIR);
		assert.ok(out.includes(THEME_DIR_STR), `期望含 themeDirUri 前缀 ${THEME_DIR_STR}，实际=${out}`);
		assert.ok(out.includes('fonts/foo.woff2'), `期望保留相对后缀 fonts/foo.woff2，实际=${out}`);
		// 确认原始 `./` 已被 rebase（前缀 + 直接接后缀，不留 `./`）
		assert.ok(!out.includes('./fonts/foo.woff2'), `不应留 ./ 前缀，实际=${out}`);
	});

	test('R2 · 绝对 URL url(https://cdn/xxx.png) 保持原样', () => {
		const raw = 'body { background: url(https://cdn.example.com/bg.png); }';
		const out = rebaseCssUrls(raw, THEME_DIR);
		assert.strictEqual(out, raw);
	});

	test('R3 · data URL 保持原样', () => {
		const raw = 'body { background: url(data:image/png;base64,AAA); }';
		const out = rebaseCssUrls(raw, THEME_DIR);
		assert.strictEqual(out, raw);
	});

	test('R4 · 三种引号变体都 rebase', () => {
		const doubleQ = rebaseCssUrls('a { background: url("./bar.svg"); }', THEME_DIR);
		assert.ok(doubleQ.includes(THEME_DIR_STR) && doubleQ.includes('bar.svg') && !doubleQ.includes('"./bar.svg"'),
			`双引号变体未 rebase：${doubleQ}`);

		const singleQ = rebaseCssUrls("a { background: url('./bar.svg'); }", THEME_DIR);
		assert.ok(singleQ.includes(THEME_DIR_STR) && singleQ.includes('bar.svg') && !singleQ.includes("'./bar.svg'"),
			`单引号变体未 rebase：${singleQ}`);

		const noQ = rebaseCssUrls('a { background: url(./bar.svg); }', THEME_DIR);
		assert.ok(noQ.includes(THEME_DIR_STR) && noQ.includes('bar.svg') && !noQ.includes('(./bar.svg)'),
			`无引号变体未 rebase：${noQ}`);
	});

	test('R5 · wrapCssWithScope 外套 body[data-theme="<id>"] 且内层无损', () => {
		const raw = 'body { color: red } h1 { font-weight: bold }';
		const out = wrapCssWithScope(raw, 'ext:workspace:whitey');
		assert.ok(
			out.includes('body[data-theme="ext:workspace:whitey"]'),
			`外层 scope 未生成：${out}`,
		);
		assert.ok(out.includes(raw), `内层 CSS 应逐字节保留，实际=${out}`);
	});

	test('R6 · 绝对本地路径 url(/abs/path) 保持原样（v1 Non-Goal）', () => {
		const raw = 'body { background: url(/abs/hero.png); }';
		const out = rebaseCssUrls(raw, THEME_DIR);
		assert.strictEqual(out, raw, 'v1 不处理 / 起头的绝对本地路径');
	});

	test('R7 · 上级相对路径 url(../parent/x.png) 也 rebase', () => {
		const out = rebaseCssUrls('a { background: url(../parent/x.png); }', THEME_DIR);
		assert.ok(out.includes(THEME_DIR_STR), `父级相对路径也应 rebase 到 themeDirUri：${out}`);
		assert.ok(out.includes('../parent/x.png'), `../ 由 URI 层负责规约，本层保留原后缀：${out}`);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.1 · HTML 导出装配单测（`assembleExportHtml` / `sanitizeExportedBodyHtml`）。
// 纯字符串输入 → 纯字符串输出，无 DOM / 无 Milkdown 依赖。

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	assembleExportHtml,
	sanitizeExportedBodyHtml,
} from '../../browser/milkdownEditor/exportHtmlAssemble.js';

suite('T-3.8b.1 · exportHtmlAssemble', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('sanitizeExportedBodyHtml · DOM 过滤', () => {
		test('剥掉 .milkdown-toolbar 容器', () => {
			const input = '<div class="milkdown-toolbar"><button>B</button></div><p>hi</p>';
			assert.strictEqual(sanitizeExportedBodyHtml(input), '<p>hi</p>');
		});

		test('剥掉 .vsword-md-toolbar 与 .vsword-slash-menu', () => {
			const input = '<div class="vsword-md-toolbar">x</div><span class="vsword-slash-menu">y</span><p>ok</p>';
			assert.strictEqual(sanitizeExportedBodyHtml(input), '<p>ok</p>');
		});

		test('去除 contenteditable 属性', () => {
			const input = '<p contenteditable="true">hello</p>';
			assert.strictEqual(sanitizeExportedBodyHtml(input), '<p>hello</p>');
		});

		test('去除 data-dragging / data-selected / data-node-* 瞬态属性', () => {
			const input = '<p data-node-type="paragraph" data-dragging="true" data-selected="false">x</p>';
			const out = sanitizeExportedBodyHtml(input);
			assert.ok(!out.includes('data-node-type'));
			assert.ok(!out.includes('data-dragging'));
			assert.ok(!out.includes('data-selected'));
			assert.ok(out.includes('<p'));
			assert.ok(out.includes('>x</p>'));
		});

		test('剥掉正文里残留的 <script> / <style>', () => {
			const input = '<p>before</p><script>alert(1)</script><style>.x{color:red}</style><p>after</p>';
			assert.strictEqual(sanitizeExportedBodyHtml(input), '<p>before</p><p>after</p>');
		});

		test('保留其它 data-* 属性（如 data-lang）', () => {
			const input = '<pre data-lang="ts"><code>x</code></pre>';
			assert.strictEqual(sanitizeExportedBodyHtml(input), '<pre data-lang="ts"><code>x</code></pre>');
		});

		test('空输入返回空串', () => {
			assert.strictEqual(sanitizeExportedBodyHtml(''), '');
		});
	});

	suite('assembleExportHtml · 契约装配（data-uri 默认模式）', () => {
		const baseInput = {
			bodyInnerHtml: '<h1>Title</h1><p>hello <strong>world</strong></p>',
			themeCss: 'body[data-theme="github"] { --vsword-bg: #ffffff; }',
			prismCss: '.token.keyword { color: #569cd6; }',
			themeId: 'github',
			title: 'sample',
			imageMode: 'data-uri' as const,
		};

		test('输出以 <!doctype html> 开头', () => {
			const { html } = assembleExportHtml(baseInput);
			assert.ok(html.startsWith('<!doctype html>'), 'must start with <!doctype html>');
		});

		test('包含 <meta charset="utf-8">', () => {
			const { html } = assembleExportHtml(baseInput);
			assert.ok(html.includes('<meta charset="utf-8">'));
		});

		test('<style> 段落内嵌主题 CSS + prism CSS', () => {
			const { html } = assembleExportHtml(baseInput);
			assert.ok(html.includes(baseInput.themeCss), 'theme css missing');
			assert.ok(html.includes(baseInput.prismCss), 'prism css missing');
		});

		test('<body data-theme="github"> 属性到位（非 default）', () => {
			const { html } = assembleExportHtml(baseInput);
			assert.ok(html.includes('<body data-theme="github">'), 'body data-theme attribute missing');
		});

		test('default 主题不写 data-theme 属性（body 干净）', () => {
			const { html } = assembleExportHtml({ ...baseInput, themeId: 'default' });
			assert.ok(html.includes('<body>'), 'default theme should produce plain <body>');
			assert.ok(!html.includes('data-theme="default"'));
		});

		test('body innerHTML 出现在 .ProseMirror 容器里', () => {
			const { html } = assembleExportHtml(baseInput);
			assert.ok(html.includes('<div class="ProseMirror">'), 'ProseMirror wrapper missing');
			assert.ok(html.includes('<h1>Title</h1>'), 'body content missing');
			assert.ok(html.includes('<p>hello <strong>world</strong></p>'), 'body content missing');
		});

		test('导出的 HTML 不含 contenteditable / .milkdown-toolbar', () => {
			const dirty = {
				...baseInput,
				bodyInnerHtml:
					'<div class="milkdown-toolbar">TB</div>' +
					'<p contenteditable="true" data-node-type="paragraph">x</p>',
			};
			const { html } = assembleExportHtml(dirty);
			assert.ok(!html.includes('milkdown-toolbar'), 'toolbar leaked');
			assert.ok(!html.includes('contenteditable'), 'contenteditable leaked');
			assert.ok(!html.includes('data-node-type'), 'data-node-* leaked');
		});

		test('无图片资源 map 时 assets 字段缺席', () => {
			const out = assembleExportHtml(baseInput);
			assert.strictEqual(out.assets, undefined);
		});

		test('<title> 用 title 字段（HTML 转义生效）', () => {
			const { html } = assembleExportHtml({ ...baseInput, title: 'a & b <c>' });
			assert.ok(html.includes('<title>a &amp; b &lt;c&gt;</title>'));
		});
	});
});

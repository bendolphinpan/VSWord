/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RD-HTML-1 · HTML 预览文档装配纯函数单测

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildHtmlPreviewDocument,
	injectBaseHref,
	injectNoScriptCsp,
	sandboxForPreview,
	HTML_PREVIEW_SANDBOX_NO_SCRIPTS,
	HTML_PREVIEW_SANDBOX_WITH_SCRIPTS,
} from '../../browser/htmlPreview/htmlPreviewContent.js';

suite('RD-HTML-1 · htmlPreviewContent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('injectBaseHref', () => {
		test('在 head 内注入 base', () => {
			const src = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>hi</body></html>';
			const out = injectBaseHref(src, 'https://example.com/dir/');
			assert.ok(out.includes('<base href="https://example.com/dir/">'));
			assert.ok(out.includes('<meta charset="utf-8">'));
		});

		test('已有 base 不重复注入', () => {
			const src = '<html><head><base href="https://other/"></head><body></body></html>';
			const out = injectBaseHref(src, 'https://example.com/');
			assert.strictEqual((out.match(/<base\b/gi) || []).length, 1);
			assert.ok(out.includes('https://other/'));
			assert.ok(!out.includes('https://example.com/'));
		});

		test('片段包成完整文档并注入 base', () => {
			const out = injectBaseHref('<p>hi</p>', 'vscode-webview://x/');
			assert.ok(out.includes('<base href="vscode-webview://x/">'));
			assert.ok(out.includes('<p>hi</p>'));
			assert.ok(/<!DOCTYPE html>/i.test(out));
		});

		test('空 base 原样返回', () => {
			const src = '<p>x</p>';
			assert.strictEqual(injectBaseHref(src, ''), src);
		});
	});

	suite('injectNoScriptCsp', () => {
		test('无 CSP 时注入 script-src none', () => {
			const src = '<html><head></head><body></body></html>';
			const out = injectNoScriptCsp(src);
			assert.ok(out.includes("script-src 'none'"));
		});

		test('已有 CSP 不覆盖', () => {
			const src = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head></html>';
			assert.strictEqual(injectNoScriptCsp(src), src);
		});
	});

	suite('buildHtmlPreviewDocument', () => {
		test('完整文档 + allowScripts', () => {
			const out = buildHtmlPreviewDocument({
				source: '<!DOCTYPE html><html><head></head><body><h1>A</h1></body></html>',
				baseHref: 'https://base/',
				allowScripts: true,
			});
			assert.ok(out.includes('<base href="https://base/">'));
			assert.ok(out.includes('<h1>A</h1>'));
			assert.ok(!out.includes("script-src 'none'"));
		});

		test('关闭脚本时注入 no-script CSP', () => {
			const out = buildHtmlPreviewDocument({
				source: '<html><head></head><body>x</body></html>',
				baseHref: 'https://base/',
				allowScripts: false,
			});
			assert.ok(out.includes("script-src 'none'"));
		});

		test('空源码得到最小文档', () => {
			const out = buildHtmlPreviewDocument({
				source: '',
				baseHref: 'https://base/',
				allowScripts: true,
			});
			assert.ok(/<html/i.test(out));
			assert.ok(out.includes('<base href="https://base/">'));
		});

		test('纯片段包 body', () => {
			const out = buildHtmlPreviewDocument({
				source: '<div class="card">ok</div>',
				baseHref: 'https://base/',
				allowScripts: true,
			});
			assert.ok(out.includes('<div class="card">ok</div>'));
			assert.ok(out.includes('<base href="https://base/">'));
		});
	});

	suite('sandboxForPreview', () => {
		test('允许脚本', () => {
			assert.strictEqual(sandboxForPreview(true), HTML_PREVIEW_SANDBOX_WITH_SCRIPTS);
			assert.ok(sandboxForPreview(true).includes('allow-scripts'));
		});
		test('禁止脚本', () => {
			assert.strictEqual(sandboxForPreview(false), HTML_PREVIEW_SANDBOX_NO_SCRIPTS);
			assert.ok(!sandboxForPreview(false).includes('allow-scripts'));
		});
	});
});

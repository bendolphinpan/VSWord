/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.1.c · exportContribution 纯函数单测（T-3.8b.1.b 5 用例 + 本卡新增 4 用例）
//
// 只覆盖 host 侧 runHtmlExport 的分支矩阵，不跑完整 VS Code kernel
// （对齐 vswordViewModeActions.test.ts 的注入式 mock 模式）。
//
// deps.requestSnapshot / deps.assemble / deps.reveal 全部走 fake 注入，不依赖
// pendingExports Map（trackExportRequest / resolveExportResponse 走一个独立
// 集成用例，见文末 T-3.8b.1.c#pending-map 段）。

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import {
	resolveExportResponse,
	runHtmlExport,
	RunHtmlExportDeps,
	trackExportRequest,
	VSWORD_EXPORT_HTML_TIMEOUT_MS,
} from '../../browser/milkdownEditor/exportContribution.js';
import { AssembleExportHtmlInput, AssembleExportHtmlOutput } from '../../browser/milkdownEditor/exportHtmlAssemble.js';
import { WebviewExportHtmlResponseMessage } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

interface CallTrace {
	readonly showSaveDialog: ISaveDialogOptions[];
	readonly writes: Array<{ target: URI; body: string; base64?: string }>;
	readonly infos: Array<{ message: string; hasAction: boolean }>;
	readonly warns: string[];
	readonly errors: string[];
	readonly requests: Array<{ imageMode: string; title: string }>;
	readonly reveals: URI[];
	readonly assembleCalls: AssembleExportHtmlInput[];
}

/**
 * 默认的 fake response：webview 侧返回一段最小合法 snapshot。
 * 具体用例可以自己传 `snapshotResponse` 或 `snapshotError` 覆盖。
 */
function makeDeps(opts: {
	readonly activeResource: URI | undefined;
	readonly saveTo: URI | undefined;
	readonly imageMode?: 'data-uri' | 'sibling-folder';
	/** 覆盖 webview snapshot 返回：resolve 分支。 */
	readonly snapshotResponse?: WebviewExportHtmlResponseMessage;
	/** 覆盖 webview snapshot 返回：reject 分支（模拟超时 / 通信失败）。 */
	readonly snapshotError?: Error;
	/** 是否注入 reveal 回调（默认注入，测 Reveal action 显示）。 */
	readonly withReveal?: boolean;
	/** 覆盖 assemble 实现（默认走真实 assembleExportHtml）。 */
	readonly assemble?: (input: AssembleExportHtmlInput) => AssembleExportHtmlOutput;
}): { deps: RunHtmlExportDeps; trace: CallTrace } {
	const trace: CallTrace = {
		showSaveDialog: [], writes: [], infos: [], warns: [], errors: [],
		requests: [], reveals: [], assembleCalls: [],
	};
	const deps: RunHtmlExportDeps = {
		activeResource: opts.activeResource,
		imageMode: opts.imageMode ?? 'data-uri',
		showSaveDialog: async (options) => {
			trace.showSaveDialog.push(options);
			return opts.saveTo;
		},
		writeFile: async (target, buffer: VSBuffer) => {
			trace.writes.push({ target, body: buffer.toString() });
			return undefined;
		},
		requestSnapshot: async (imageMode, title) => {
			trace.requests.push({ imageMode, title });
			if (opts.snapshotError) {
				throw opts.snapshotError;
			}
			return opts.snapshotResponse ?? {
				type: 'export.html.response',
				requestId: 'fake-req',
				bodyInnerHtml: '<p>hello</p>',
				themeCss: 'body { color: black; }',
				prismCss: '',
				themeId: 'default',
			};
		},
		assemble: opts.assemble
			? (input) => { trace.assembleCalls.push(input); return opts.assemble!(input); }
			: undefined,
		reveal: opts.withReveal !== false ? (target) => { trace.reveals.push(target); } : undefined,
		notify: {
			info: (message, actions) => { trace.infos.push({ message, hasAction: !!(actions && actions.length > 0) }); },
			warn: (message) => { trace.warns.push(message); },
			error: (message) => { trace.errors.push(message); },
		},
	};
	return { deps, trace };
}

suite('T-3.8b.1.c · exportContribution.runHtmlExport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('正常流程：md active + SaveAs 确认 + webview response → showSaveDialog+writeFile 各 1 次，target 后缀 .html', async () => {
		const mdUri = URI.file('/tmp/notes/hello.md');
		const targetUri = URI.file('/tmp/notes/hello.html');
		const { deps, trace } = makeDeps({ activeResource: mdUri, saveTo: targetUri });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'wrote');
		if (result.kind === 'wrote') {
			assert.strictEqual(result.target.toString(), targetUri.toString());
			assert.strictEqual(result.assetCount, 0);
		}
		assert.strictEqual(trace.showSaveDialog.length, 1, 'showSaveDialog 应恰好被调用 1 次');
		assert.strictEqual(trace.requests.length, 1, 'requestSnapshot 应恰好被调用 1 次');
		assert.strictEqual(trace.requests[0].imageMode, 'data-uri');
		assert.strictEqual(trace.requests[0].title, 'hello');
		assert.strictEqual(trace.writes.length, 1, 'writeFile 应恰好被调用 1 次');
		assert.ok(trace.writes[0].target.path.endsWith('.html'), '落盘 URI 应以 .html 结尾');
		// assembleExportHtml 输出小写 doctype
		assert.ok(trace.writes[0].body.startsWith('<!doctype html>'), '写入内容应是 HTML');
		assert.ok(trace.writes[0].body.includes('<title>hello</title>'), '写入内容应含 title stem');
		assert.ok(trace.writes[0].body.includes('<p>hello</p>'), '写入内容应含 webview 提供的 bodyInnerHtml');
		assert.ok(trace.writes[0].body.includes('color: black'), '写入内容应含 webview 提供的 themeCss');
		assert.strictEqual(trace.infos.length, 1, 'info notification 应发一次');
		assert.strictEqual(trace.infos[0].hasAction, true, 'info 应带 Reveal action');
		assert.strictEqual(trace.warns.length, 0);
		assert.strictEqual(trace.errors.length, 0);

		// SaveAs 默认 URI 应派生自 md URI（同目录 stem.html）
		const savedOpts = trace.showSaveDialog[0];
		assert.ok(savedOpts.defaultUri, 'defaultUri 应存在');
		assert.ok(savedOpts.defaultUri!.path.endsWith('/hello.html'));
		assert.deepStrictEqual(savedOpts.filters, [{ name: 'HTML', extensions: ['html'] }]);
	});

	test('用户取消：showSaveDialog 返回 undefined → cancelled 分支，writeFile 不被调用，无 notification', async () => {
		const mdUri = URI.file('/tmp/notes/hello.md');
		const { deps, trace } = makeDeps({ activeResource: mdUri, saveTo: undefined });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'cancelled');
		assert.strictEqual(trace.showSaveDialog.length, 1);
		assert.strictEqual(trace.requests.length, 0, '取消时不应向 webview 发 request');
		assert.strictEqual(trace.writes.length, 0, '取消时不应落盘');
		assert.strictEqual(trace.infos.length, 0, '取消时不应弹 info');
		assert.strictEqual(trace.warns.length, 0);
		assert.strictEqual(trace.errors.length, 0);
	});

	test('非 md active editor：no-md 分支 → warn notification，无 SaveAs / 无 writeFile', async () => {
		const txtUri = URI.file('/tmp/random.txt');
		const { deps, trace } = makeDeps({ activeResource: txtUri, saveTo: URI.file('/tmp/x.html') });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'no-md');
		assert.strictEqual(trace.showSaveDialog.length, 0, '非 md 时不应弹 SaveAs');
		assert.strictEqual(trace.requests.length, 0);
		assert.strictEqual(trace.writes.length, 0);
		assert.strictEqual(trace.warns.length, 1, '非 md 应发 warn');
	});

	test('无 active editor：no-md 分支同上', async () => {
		const { deps, trace } = makeDeps({ activeResource: undefined, saveTo: undefined });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'no-md');
		assert.strictEqual(trace.showSaveDialog.length, 0);
		assert.strictEqual(trace.writes.length, 0);
		assert.strictEqual(trace.warns.length, 1);
	});

	test('.markdown 扩展也认作 md 资源', async () => {
		const mdUri = URI.file('/tmp/foo.markdown');
		const targetUri = URI.file('/tmp/foo.html');
		const { deps, trace } = makeDeps({ activeResource: mdUri, saveTo: targetUri });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'wrote');
		assert.strictEqual(trace.writes.length, 1);
		// defaultUri 应把 .markdown 换成 .html
		assert.ok(trace.showSaveDialog[0].defaultUri!.path.endsWith('/foo.html'));
	});

	// -----------------------------------------------------------------------
	// T-3.8b.1.c · 新增：request/response 通路
	// -----------------------------------------------------------------------

	test('webview response 正常路径：deps.assemble 被调，参数来自 response（bodyInnerHtml + themeCss + themeId + title）', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const targetUri = URI.file('/tmp/foo.html');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			saveTo: targetUri,
			imageMode: 'data-uri',
			snapshotResponse: {
				type: 'export.html.response',
				requestId: 'r1',
				bodyInnerHtml: '<h1>title</h1><p>x</p>',
				themeCss: '.foo{color:red}',
				prismCss: '.token{color:blue}',
				themeId: 'nord-dark',
			},
			assemble: (input) => ({ html: `[ASM|${input.title}|${input.themeId}|${input.imageMode}|${input.bodyInnerHtml}]` }),
		});

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'wrote');
		assert.strictEqual(trace.assembleCalls.length, 1, 'assemble 应被调 1 次');
		const call = trace.assembleCalls[0];
		assert.strictEqual(call.bodyInnerHtml, '<h1>title</h1><p>x</p>');
		assert.strictEqual(call.themeCss, '.foo{color:red}');
		assert.strictEqual(call.prismCss, '.token{color:blue}');
		assert.strictEqual(call.themeId, 'nord-dark');
		assert.strictEqual(call.title, 'foo');
		assert.strictEqual(call.imageMode, 'data-uri');
		assert.strictEqual(trace.writes.length, 1);
		assert.strictEqual(trace.writes[0].body, '[ASM|foo|nord-dark|data-uri|<h1>title</h1><p>x</p>]');
	});

	test('webview 超时：requestSnapshot 抛 timed out → error notification + timeout 分支 + 不 writeFile', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const targetUri = URI.file('/tmp/foo.html');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			saveTo: targetUri,
			snapshotError: new Error(`Export as HTML timed out after ${VSWORD_EXPORT_HTML_TIMEOUT_MS}ms`),
		});

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'timeout');
		assert.strictEqual(trace.requests.length, 1);
		assert.strictEqual(trace.writes.length, 0, '超时不应写盘');
		assert.strictEqual(trace.errors.length, 1, '超时应发 error notification');
		assert.ok(/超时|timed out/i.test(trace.errors[0]), 'error 文案应提示超时');
		assert.strictEqual(trace.infos.length, 0);
	});

	test('webview response.error 分支：error notification + error 分支 + 不 writeFile', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const targetUri = URI.file('/tmp/foo.html');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			saveTo: targetUri,
			snapshotResponse: {
				type: 'export.html.response',
				requestId: 'r1',
				error: 'DOM extraction failed',
			},
		});

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'error');
		if (result.kind === 'error') {
			assert.ok(/DOM extraction/.test(result.message));
		}
		assert.strictEqual(trace.writes.length, 0);
		assert.strictEqual(trace.errors.length, 1);
	});

	test('sibling-folder 模式：assets 数组 → 每条 asset 单独 writeFile 到 <stem>_files/', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const targetUri = URI.file('/tmp/foo.html');
		// base64 of "abc" is "YWJj"
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			saveTo: targetUri,
			imageMode: 'sibling-folder',
			snapshotResponse: {
				type: 'export.html.response',
				requestId: 'r1',
				bodyInnerHtml: '<p>x</p>',
				themeCss: '',
				prismCss: '',
				themeId: 'default',
				assets: [
					{ relativePath: 'img/a.png', base64: 'YWJj' },
					{ relativePath: 'img/b.png', base64: 'YWJj' },
				],
			},
		});

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'wrote');
		if (result.kind === 'wrote') {
			assert.strictEqual(result.assetCount, 2);
		}
		// 1 主 HTML + 2 assets = 3 次 writeFile
		assert.strictEqual(trace.writes.length, 3, '主 HTML + 2 assets = 3 次 writeFile');
		assert.ok(trace.writes[0].target.path.endsWith('/foo.html'));
		assert.ok(trace.writes[1].target.path.endsWith('/foo_files/img/a.png'));
		assert.ok(trace.writes[2].target.path.endsWith('/foo_files/img/b.png'));
	});

	// -----------------------------------------------------------------------
	// T-3.8b.1.c · pending-map 集成：trackExportRequest / resolveExportResponse
	// -----------------------------------------------------------------------

	test('trackExportRequest + resolveExportResponse：合规 requestId 派发 → Promise resolve', async () => {
		let capturedId: string | undefined;
		const { requestId, response } = trackExportRequest(id => { capturedId = id; }, 5000);

		assert.strictEqual(typeof requestId, 'string');
		assert.ok(requestId.length > 0);
		assert.strictEqual(capturedId, requestId, 'sendRequest 应拿到与 caller 相同的 requestId');

		resolveExportResponse({
			type: 'export.html.response',
			requestId,
			bodyInnerHtml: '<p>ok</p>',
		});

		const msg = await response;
		assert.strictEqual(msg.requestId, requestId);
		assert.strictEqual(msg.bodyInnerHtml, '<p>ok</p>');
	});

	test('trackExportRequest 超时：无 response → Promise reject with "timed out"', async () => {
		const { response } = trackExportRequest(_id => { /* noop */ }, 10);
		try {
			await response;
			assert.fail('应该 reject');
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.ok(/timed out/i.test(err.message), 'error 文案应含 timed out');
		}
	});
});

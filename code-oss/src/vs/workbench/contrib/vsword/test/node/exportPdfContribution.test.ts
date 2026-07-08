/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.2 · exportPdfContribution 纯函数单测
//
// 覆盖：
//   A) assembleExportHtml pageCss 注入（@page 独立 style 块，未传时零影响）
//   B) runPdfExport 分支矩阵（正常流程 / 无 md active / snapshot 超时 / webview error /
//      print 命令 reject / imageMode 强制 data-uri）
//   C) VSWORD_EXPORT_PDF_PAGE_CSS 契约值（A4 + 20mm margin）

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	AssembleExportHtmlInput,
	AssembleExportHtmlOutput,
	assembleExportHtml,
} from '../../browser/milkdownEditor/exportHtmlAssemble.js';
import {
	RunPdfExportDeps,
	VSWORD_EXPORT_PDF_PAGE_CSS,
	runPdfExport,
} from '../../browser/milkdownEditor/exportPdfContribution.js';
import { WebviewExportHtmlResponseMessage } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

interface CallTrace {
	readonly writes: Array<{ target: URI; body: string }>;
	readonly prints: URI[];
	readonly requests: string[];
	readonly infos: string[];
	readonly warns: string[];
	readonly errors: string[];
	readonly assembleCalls: AssembleExportHtmlInput[];
}

function makeDeps(opts: {
	readonly activeResource: URI | undefined;
	readonly snapshotResponse?: WebviewExportHtmlResponseMessage;
	readonly snapshotError?: Error;
	readonly printError?: Error;
	readonly assemble?: (input: AssembleExportHtmlInput) => AssembleExportHtmlOutput;
	readonly tmpDir?: URI;
}): { deps: RunPdfExportDeps; trace: CallTrace } {
	const trace: CallTrace = {
		writes: [], prints: [], requests: [], infos: [], warns: [], errors: [], assembleCalls: [],
	};
	const deps: RunPdfExportDeps = {
		activeResource: opts.activeResource,
		tmpDir: opts.tmpDir ?? URI.file('/tmp/vsword-test'),
		requestSnapshot: async (title) => {
			trace.requests.push(title);
			if (opts.snapshotError) throw opts.snapshotError;
			return opts.snapshotResponse ?? {
				type: 'export.html.response',
				requestId: 'fake-req',
				bodyInnerHtml: '<p>pdf</p>',
				themeCss: 'body{color:#111}',
				prismCss: '',
				themeId: 'default',
			};
		},
		writeFile: async (target, buffer: VSBuffer) => {
			trace.writes.push({ target, body: buffer.toString() });
			return undefined;
		},
		executePrint: async (target) => {
			if (opts.printError) throw opts.printError;
			trace.prints.push(target);
			return undefined;
		},
		assemble: opts.assemble
			? (input) => { trace.assembleCalls.push(input); return opts.assemble!(input); }
			: undefined,
		notify: {
			info: (m) => { trace.infos.push(m); },
			warn: (m) => { trace.warns.push(m); },
			error: (m) => { trace.errors.push(m); },
		},
	};
	return { deps, trace };
}

// ---------------------------------------------------------------------------
// A · assemble pageCss 注入
// ---------------------------------------------------------------------------

suite('T-3.8b.2 · assembleExportHtml pageCss 注入', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('传入 pageCss → 独立 <style data-vsword-role="page"> 块出现在主 style 之后', () => {
		const out = assembleExportHtml({
			bodyInnerHtml: '<p>x</p>',
			themeCss: '.theme{color:red}',
			prismCss: '',
			themeId: 'default',
			title: 'doc',
			imageMode: 'data-uri',
			pageCss: '@page { size: A4; margin: 20mm; }',
		});
		assert.ok(out.html.includes('<style data-vsword-role="page">'), '应含 role=page 的独立 style 块');
		assert.ok(out.html.includes('@page { size: A4; margin: 20mm; }'), '应含 pageCss 内容');

		// 顺序：主 </style> 早于 role=page 的 <style
		const mainStyleEnd = out.html.indexOf('</style>');
		const pageStyleStart = out.html.indexOf('<style data-vsword-role="page">');
		assert.ok(mainStyleEnd > 0 && pageStyleStart > mainStyleEnd, 'pageCss 应在主 style 之后');
	});

	test('未传 pageCss → 输出中不应含 role=page style 块（HTML 导出零影响）', () => {
		const out = assembleExportHtml({
			bodyInnerHtml: '<p>x</p>',
			themeCss: '',
			prismCss: '',
			themeId: 'default',
			title: 'doc',
			imageMode: 'data-uri',
		});
		assert.ok(!out.html.includes('data-vsword-role="page"'), 'HTML 导出不应含 pageCss 块');
	});

	test('pageCss 为空串 / 仅空白 → 视为未传（不加块）', () => {
		const out = assembleExportHtml({
			bodyInnerHtml: '<p>x</p>',
			themeCss: '',
			prismCss: '',
			themeId: 'default',
			title: 'doc',
			imageMode: 'data-uri',
			pageCss: '   \n  ',
		});
		assert.ok(!out.html.includes('data-vsword-role="page"'), '空白 pageCss 应被视为未传');
	});

	test('VSWORD_EXPORT_PDF_PAGE_CSS 契约：A4 + 20mm margin（PRD §4.2）', () => {
		assert.ok(/A4/.test(VSWORD_EXPORT_PDF_PAGE_CSS), '应指定 A4 尺寸');
		assert.ok(/20mm/.test(VSWORD_EXPORT_PDF_PAGE_CSS), '应指定 20mm 边距');
		assert.ok(/@page/.test(VSWORD_EXPORT_PDF_PAGE_CSS), '应是 @page 规则');
	});
});

// ---------------------------------------------------------------------------
// B · runPdfExport 分支矩阵
// ---------------------------------------------------------------------------

suite('T-3.8b.2 · runPdfExport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('正常流程：md active + snapshot ok + print ok → printed 分支，写 1 个 HTML 且触发 1 次 print', async () => {
		const mdUri = URI.file('/tmp/notes/hello.md');
		const { deps, trace } = makeDeps({ activeResource: mdUri });

		const result = await runPdfExport(deps);

		assert.strictEqual(result.kind, 'printed');
		assert.strictEqual(trace.requests.length, 1, 'requestSnapshot 应被调 1 次');
		assert.strictEqual(trace.requests[0], 'hello', 'title 应是 md 文件 stem');
		assert.strictEqual(trace.writes.length, 1, '临时 HTML 应写 1 次');
		assert.ok(trace.writes[0].target.path.endsWith('.html'), '临时目标以 .html 结尾');
		assert.ok(trace.writes[0].target.path.includes('vsword-export-'), '临时目标含 vsword-export- 前缀');
		assert.ok(/@page \{ size: A4; margin: 20mm; \}/.test(trace.writes[0].body), '写入内容应含 @page A4');
		assert.strictEqual(trace.prints.length, 1, 'executePrint 应被调 1 次');
		assert.strictEqual(trace.prints[0].toString(), trace.writes[0].target.toString(), 'print 目标应是临时 HTML');
		assert.strictEqual(trace.infos.length, 1);
		assert.strictEqual(trace.warns.length, 0);
		assert.strictEqual(trace.errors.length, 0);
	});

	test('.markdown 扩展也认作 md 资源', async () => {
		const mdUri = URI.file('/tmp/foo.markdown');
		const { deps, trace } = makeDeps({ activeResource: mdUri });
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'printed');
		assert.strictEqual(trace.requests[0], 'foo', '.markdown stem 应去扩展名');
	});

	test('非 md active editor：no-md 分支 → warn，不发 request，不写盘，不 print', async () => {
		const txtUri = URI.file('/tmp/random.txt');
		const { deps, trace } = makeDeps({ activeResource: txtUri });
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'no-md');
		assert.strictEqual(trace.requests.length, 0);
		assert.strictEqual(trace.writes.length, 0);
		assert.strictEqual(trace.prints.length, 0);
		assert.strictEqual(trace.warns.length, 1);
	});

	test('无 active editor：no-md 分支', async () => {
		const { deps, trace } = makeDeps({ activeResource: undefined });
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'no-md');
		assert.strictEqual(trace.warns.length, 1);
	});

	test('snapshot 超时：requestSnapshot 抛 timed out → timeout 分支 + error notification + 不写盘不 print', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			snapshotError: new Error('Export as HTML timed out after 30000ms'),
		});
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'timeout');
		assert.strictEqual(trace.writes.length, 0);
		assert.strictEqual(trace.prints.length, 0);
		assert.strictEqual(trace.errors.length, 1);
		assert.ok(/超时|timed out/i.test(trace.errors[0]));
	});

	test('webview response.error 分支：error notification + error 分支 + 不写盘不 print', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			snapshotResponse: {
				type: 'export.html.response',
				requestId: 'r1',
				error: 'DOM extraction failed',
			},
		});
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'error');
		if (result.kind === 'error') {
			assert.ok(/DOM extraction/.test(result.message));
		}
		assert.strictEqual(trace.writes.length, 0);
		assert.strictEqual(trace.prints.length, 0);
		assert.strictEqual(trace.errors.length, 1);
	});

	test('executePrint 抛错（命令未注册 / print 桥不可用）：print-unsupported 分支 + warn + HTML 仍写入临时目录', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			printError: new Error("command 'workbench.action.webview.print' not found"),
		});
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'print-unsupported');
		assert.strictEqual(trace.writes.length, 1, '写盘先于 print，临时 HTML 应已落盘');
		assert.strictEqual(trace.prints.length, 0, 'print 抛错时不记录 prints');
		assert.strictEqual(trace.warns.length, 1, '应发 warn（不 fallback）');
		assert.ok(/PDF export requires webview print support/.test(trace.warns[0]));
		assert.strictEqual(trace.errors.length, 0, '不应发 error');
	});

	test('assemble 参数：imageMode **强制** data-uri（即使 webview 建议其它模式）+ pageCss 注入', async () => {
		const mdUri = URI.file('/tmp/foo.md');
		const { deps, trace } = makeDeps({
			activeResource: mdUri,
			snapshotResponse: {
				type: 'export.html.response',
				requestId: 'r1',
				bodyInnerHtml: '<h1>hi</h1>',
				themeCss: '.t{color:blue}',
				prismCss: '',
				themeId: 'nord',
			},
			assemble: (input) => ({ html: `[ASM|${input.imageMode}|${input.pageCss}|${input.themeId}|${input.title}]` }),
		});
		const result = await runPdfExport(deps);
		assert.strictEqual(result.kind, 'printed');
		assert.strictEqual(trace.assembleCalls.length, 1);
		const call = trace.assembleCalls[0];
		assert.strictEqual(call.imageMode, 'data-uri', 'PDF 硬编码 data-uri');
		assert.strictEqual(call.pageCss, VSWORD_EXPORT_PDF_PAGE_CSS, 'pageCss 应等于契约值');
		assert.strictEqual(call.themeId, 'nord');
		assert.strictEqual(call.title, 'foo');
		assert.strictEqual(trace.writes[0].body, '[ASM|data-uri|@page { size: A4; margin: 20mm; }|nord|foo]');
	});

	test('临时目标路径：基于 deps.tmpDir，不落到 md 同目录', async () => {
		const mdUri = URI.file('/some/deep/path/mydoc.md');
		const customTmp = URI.file('/custom/tmp/root');
		const { deps, trace } = makeDeps({ activeResource: mdUri, tmpDir: customTmp });
		await runPdfExport(deps);
		assert.strictEqual(trace.writes.length, 1);
		assert.ok(trace.writes[0].target.path.startsWith('/custom/tmp/root/'), '临时文件应位于 tmpDir 下');
		assert.ok(!trace.writes[0].target.path.startsWith('/some/deep/path'), '不应落在 md 同目录');
	});
});

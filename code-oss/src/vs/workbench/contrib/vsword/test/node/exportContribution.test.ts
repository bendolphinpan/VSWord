/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.1.b · exportContribution 纯函数单测
//
// 只覆盖 host 侧 runHtmlExport 的三条分支，不跑完整 VS Code kernel
// （对齐 vswordViewModeActions.test.ts 的注入式 mock 模式）。

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { runHtmlExport, RunHtmlExportDeps } from '../../browser/milkdownEditor/exportContribution.js';

interface CallTrace {
	readonly showSaveDialog: ISaveDialogOptions[];
	readonly writes: Array<{ target: URI; body: string }>;
	readonly infos: string[];
	readonly warns: string[];
}

/**
 * 构造一份 mock deps + call-trace。
 * `saveTo` 决定 showSaveDialog 返回值：undefined = 用户取消；URI = 用户确认落盘。
 */
function makeDeps(opts: {
	readonly activeResource: URI | undefined;
	readonly saveTo: URI | undefined;
	readonly imageMode?: 'data-uri' | 'sibling-folder';
}): { deps: RunHtmlExportDeps; trace: CallTrace } {
	const trace: CallTrace = { showSaveDialog: [], writes: [], infos: [], warns: [] };
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
		notify: {
			info: (message) => { trace.infos.push(message); },
			warn: (message) => { trace.warns.push(message); },
		},
	};
	return { deps, trace };
}

suite('T-3.8b.1.b · exportContribution.runHtmlExport', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('正常流程：md active + SaveAs 确认 → showSaveDialog+writeFile 各 1 次，target 后缀 .html', async () => {
		const mdUri = URI.file('/tmp/notes/hello.md');
		const targetUri = URI.file('/tmp/notes/hello.html');
		const { deps, trace } = makeDeps({ activeResource: mdUri, saveTo: targetUri });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'wrote');
		if (result.kind === 'wrote') {
			assert.strictEqual(result.target.toString(), targetUri.toString());
		}
		assert.strictEqual(trace.showSaveDialog.length, 1, 'showSaveDialog 应恰好被调用 1 次');
		assert.strictEqual(trace.writes.length, 1, 'writeFile 应恰好被调用 1 次');
		assert.ok(trace.writes[0].target.path.endsWith('.html'), '落盘 URI 应以 .html 结尾');
		assert.ok(trace.writes[0].body.startsWith('<!DOCTYPE html>'), '写入内容应是 HTML');
		assert.ok(trace.writes[0].body.includes('hello'), '写入内容应含 stem');
		assert.strictEqual(trace.infos.length, 1, 'info notification 应发一次');
		assert.strictEqual(trace.warns.length, 0);

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
		assert.strictEqual(trace.writes.length, 0, '取消时不应落盘');
		assert.strictEqual(trace.infos.length, 0, '取消时不应弹 info');
		assert.strictEqual(trace.warns.length, 0);
	});

	test('非 md active editor：no-md 分支 → warn notification，无 SaveAs / 无 writeFile', async () => {
		const txtUri = URI.file('/tmp/random.txt');
		const { deps, trace } = makeDeps({ activeResource: txtUri, saveTo: URI.file('/tmp/x.html') });

		const result = await runHtmlExport(deps);

		assert.strictEqual(result.kind, 'no-md');
		assert.strictEqual(trace.showSaveDialog.length, 0, '非 md 时不应弹 SaveAs');
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
});

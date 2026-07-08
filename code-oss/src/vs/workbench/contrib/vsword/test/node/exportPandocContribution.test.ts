/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.3 · exportPandocContribution 单测
//
// 三块覆盖：
//   A) ContextKey 契约：VswordPandocAvailableContext 默认 false + RawContextKey key 名对齐 protocol
//   B) PANDOC_AVAILABLE_WHEN 表达式序列化：Action2.precondition 的 when 表达式（面板隐藏契约）
//   C) 常量：命令 id 契约（面板不改名、扩展不改名 → 兼容性保证）

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import {
	PANDOC_AVAILABLE_WHEN,
	PANDOC_DETECTION_IDLE_DELAY_MS,
	VswordExportDocxAction,
	VswordExportEpubAction,
	VswordExportLatexAction,
	VswordPandocAvailableContext,
} from '../../browser/milkdownEditor/exportPandocContribution.js';
import {
	VSWORD_EXPORT_DOCX_ACTION_ID,
	VSWORD_EXPORT_EPUB_ACTION_ID,
	VSWORD_EXPORT_LATEX_ACTION_ID,
	VSWORD_PANDOC_AVAILABLE_CTX_KEY,
} from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// A · ContextKey 契约
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · VswordPandocAvailableContext', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('RawContextKey.key 与 protocol 常量对齐', () => {
		assert.strictEqual(VswordPandocAvailableContext.key, VSWORD_PANDOC_AVAILABLE_CTX_KEY);
		assert.strictEqual(VswordPandocAvailableContext.key, 'vsword.pandocAvailable');
	});

	test('bindTo 使用默认值 = false —— 通过 fake IContextKeyService 记录 createKey 参数', () => {
		let seenKey: string | undefined;
		let seenDefault: unknown = 'not-called';
		const fakeService = {
			createKey: (k: string, d: unknown) => {
				seenKey = k;
				seenDefault = d;
				return { set: () => { }, reset: () => { }, get: () => undefined };
			},
		} as unknown as Parameters<typeof VswordPandocAvailableContext.bindTo>[0];
		VswordPandocAvailableContext.bindTo(fakeService);
		assert.strictEqual(seenKey, 'vsword.pandocAvailable');
		assert.strictEqual(seenDefault, false, 'bindTo 应把 false 作为默认值传给 createKey');
	});
});

// ---------------------------------------------------------------------------
// B · precondition 表达式
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · PANDOC_AVAILABLE_WHEN 表达式', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('等价于 ContextKeyExpr.equals(<KEY>, true)（optimizer 可能把 == true 化简为裸 key，用 serialize 对齐即可）', () => {
		const reference = ContextKeyExpr.equals(VSWORD_PANDOC_AVAILABLE_CTX_KEY, true);
		assert.ok(reference, 'reference 应能构造');
		assert.strictEqual(PANDOC_AVAILABLE_WHEN.serialize(), reference!.serialize());
	});

	test('serialize 结果包含 key 名 vsword.pandocAvailable', () => {
		const serialized = PANDOC_AVAILABLE_WHEN.serialize();
		assert.ok(serialized.includes('vsword.pandocAvailable'), `serialize should mention key, got: ${serialized}`);
	});

	test('对 fake context（key=false）求值 → false（命令面板隐藏）；key=true → true（暴露）', () => {
		const contextFalse = { getValue: (k: string) => k === VSWORD_PANDOC_AVAILABLE_CTX_KEY ? false : undefined } as any;
		const contextTrue = { getValue: (k: string) => k === VSWORD_PANDOC_AVAILABLE_CTX_KEY ? true : undefined } as any;
		assert.strictEqual(PANDOC_AVAILABLE_WHEN.evaluate(contextFalse), false);
		assert.strictEqual(PANDOC_AVAILABLE_WHEN.evaluate(contextTrue), true);
	});
});

// ---------------------------------------------------------------------------
// C · Action2 契约 —— id / precondition 稳定性
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · Action2 契约', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('三个命令 id 与 protocol 常量对齐（面板兼容性）', () => {
		assert.strictEqual(VswordExportDocxAction.ID, VSWORD_EXPORT_DOCX_ACTION_ID);
		assert.strictEqual(VswordExportEpubAction.ID, VSWORD_EXPORT_EPUB_ACTION_ID);
		assert.strictEqual(VswordExportLatexAction.ID, VSWORD_EXPORT_LATEX_ACTION_ID);
	});

	test('三个命令 id 字符串精确值（防误改）', () => {
		assert.strictEqual(VSWORD_EXPORT_DOCX_ACTION_ID, 'vsword.export.docx');
		assert.strictEqual(VSWORD_EXPORT_EPUB_ACTION_ID, 'vsword.export.epub');
		assert.strictEqual(VSWORD_EXPORT_LATEX_ACTION_ID, 'vsword.export.latex');
	});

	test('三个 Action2 都携带 precondition = PANDOC_AVAILABLE_WHEN', () => {
		// 读 Action2 内部的 desc（Action2.constructor 存在 this.desc）
		const actions: Array<InstanceType<typeof VswordExportDocxAction>> = [
			new VswordExportDocxAction(),
			new VswordExportEpubAction(),
			new VswordExportLatexAction(),
		];
		for (const a of actions) {
			const desc = (a as unknown as { desc?: { precondition?: { serialize(): string } } }).desc;
			assert.ok(desc, 'Action2 desc 存在');
			assert.ok(desc!.precondition, `${a.constructor.name} 应带 precondition`);
			assert.strictEqual(
				desc!.precondition!.serialize(),
				PANDOC_AVAILABLE_WHEN.serialize(),
				`${a.constructor.name} precondition 应等价 PANDOC_AVAILABLE_WHEN`,
			);
		}
	});

	test('idle delay 常量非负且 ≤ 2s（首启体验窗口）', () => {
		assert.ok(PANDOC_DETECTION_IDLE_DELAY_MS >= 0);
		assert.ok(PANDOC_DETECTION_IDLE_DELAY_MS <= 2000);
	});
});

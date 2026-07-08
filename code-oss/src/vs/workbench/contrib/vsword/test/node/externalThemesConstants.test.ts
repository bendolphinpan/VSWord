/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.a · 外挂主题「协议 + 常量」层最小回归。
//
// 5 条断言：
//   B1 VSWORD_EXTERNAL_THEMES_DIRNAME === '.vsword/themes'（字符串锁死，防漂移）
//   B2 isExternalThemeId：正例（ext:workspace:foo / ext:user:x）
//   B3 isExternalThemeId：反例（内置 id / 空串 / 无 ext 前缀）
//   B4 makeExternalThemeId 生成规则符合 `ext:${source}:${slug}` 字节形状
//   B5 HostThemeCssPayloadMessage.type 字面量 `themeCssPayload` 可赋值到 HostMessage 联合
//      （type-only import + 常量赋值 —— 编译期检查；协议若被误删/改名会直接编译不过）
//
// 只读断言，不动运行时。任何未来子卡若移动了目录 / 改了 id 前缀 / 收窄了协议，此测试直接绷断。
//
// runner：`code-oss/test/scripts/run-external-themes-test.mjs`（与 run-theme-audit-test.mjs 同构）。

import * as assert from 'assert';
import {
	VSWORD_EXTERNAL_THEMES_DIRNAME,
	isExternalThemeId,
	makeExternalThemeId,
} from '../../browser/milkdownEditor/milkdownEditorExternalThemes.js';

// type-only：只用作编译期形状校验（B5），运行时被 esbuild 擦除。
import type { HostToWebviewMessage } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

suite('T-3.7d.2.a · 外挂主题协议 / 常量层 · 最小回归', () => {

	test('B1 · VSWORD_EXTERNAL_THEMES_DIRNAME 字符串锁死为 .vsword/themes', () => {
		assert.strictEqual(
			VSWORD_EXTERNAL_THEMES_DIRNAME,
			'.vsword/themes',
			'目录名不允许漂移 —— PRD §4.2 已锁死；若确需迁位置请先改 PRD 再改测试',
		);
	});

	test('B2 · isExternalThemeId 正例：ext:* 前缀返回 true', () => {
		assert.strictEqual(isExternalThemeId('ext:workspace:foo'), true);
		assert.strictEqual(isExternalThemeId('ext:user:my-theme'), true);
		assert.strictEqual(isExternalThemeId('ext:workspace:'), true, '仅前缀检查，不校验后段格式（那是 discovery 层的活）');
	});

	test('B3 · isExternalThemeId 反例：内置 id / 空串 / 无前缀返回 false', () => {
		assert.strictEqual(isExternalThemeId('github'), false);
		assert.strictEqual(isExternalThemeId('academic'), false);
		assert.strictEqual(isExternalThemeId('default'), false);
		assert.strictEqual(isExternalThemeId(''), false);
		assert.strictEqual(isExternalThemeId('extended'), false, 'ext 是前缀而非子串 —— extended 不匹配');
	});

	test('B4 · makeExternalThemeId 生成 `ext:${source}:${slug}` 字节形状', () => {
		assert.strictEqual(makeExternalThemeId('workspace', 'my-theme'), 'ext:workspace:my-theme');
		assert.strictEqual(makeExternalThemeId('user', 'x'), 'ext:user:x');
		// 与 isExternalThemeId 逻辑闭环 —— 生成的 id 一定被识别为外挂 id。
		const id = makeExternalThemeId('workspace', 'roundtrip');
		assert.strictEqual(isExternalThemeId(id), true);
	});

	test('B5 · HostThemeCssPayloadMessage 已并入 HostToWebviewMessage 联合类型', () => {
		// 编译期断言：字面量 { type: 'themeCssPayload', themeId, cssText } 必须能赋值到 HostToWebviewMessage。
		// 若协议漏了这个分支，下面这行会报 TS2322；若字段被改名，会报 TS2353。
		const msg: HostToWebviewMessage = {
			type: 'themeCssPayload',
			themeId: 'ext:workspace:foo',
			cssText: 'body { color: red; }',
		};
		assert.strictEqual(msg.type, 'themeCssPayload');
		// 运行期兜底：narrowing 后字段仍在 —— 走一次 discriminated union 分支缩窄避免死代码消除。
		if (msg.type === 'themeCssPayload') {
			assert.strictEqual(msg.themeId, 'ext:workspace:foo');
			assert.strictEqual(msg.cssText, 'body { color: red; }');
		} else {
			assert.fail('msg.type discriminator 未按预期缩窄到 themeCssPayload 分支');
		}
	});
});

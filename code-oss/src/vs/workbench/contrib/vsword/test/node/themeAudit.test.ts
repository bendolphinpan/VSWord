/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.1 · 内置 4 主题最小回归清单（audit 文档 §6）。
//
// 3 条断言（对应 audit §6 表格）：
//   A1 VSWORD_MILKDOWN_THEME_IDS（TS 源）与 webview/themes.template.js 白名单 逐字节相同
//   A2 getThemesCss() 输出中，每个非 'default' id 都存在 body[data-theme="<id>"] 选择器
//   A3 HostThemeChangedMessage.theme 类型是 string（宽签名，为 T-3.7d.2 ext:* 让路）—— type-only import + assign
//
// runner: code-oss/test/scripts/run-theme-audit-test.mjs
// 只读断言，不动主题实现。任何一方偷偷加/删 id、加 CSS 忘写 id、把 theme 收窄回联合类型都会直接失败。

import * as assert from 'assert';
import {
	VSWORD_MILKDOWN_THEME_IDS,
	VSWORD_MILKDOWN_DEFAULT_THEME,
	getThemesCss,
	isValidTheme,
} from '../../browser/milkdownEditor/milkdownEditorThemes.js';

// webview 侧 JS 镜像 —— builder alias 会把 './themes.mjs' 解析到 './themes.template.js'，
// 这里测试直接引 .template.js（.js 后缀走 esbuild 的 js loader）。
import {
	VSWORD_MILKDOWN_THEME_IDS as WEBVIEW_THEME_IDS,
	VSWORD_MILKDOWN_DEFAULT_THEME as WEBVIEW_DEFAULT_THEME,
	isValidTheme as webviewIsValidTheme,
} from '../../browser/milkdownEditor/webview/themes.template.js';

// A3 依赖：type-only import HostThemeChangedMessage，编译期检查 `theme` 是 string 宽签名。
import type { HostThemeChangedMessage } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

suite('T-3.7d.1 · 内置主题 audit · 最小回归', () => {

	test('A1 · TS 源 VSWORD_MILKDOWN_THEME_IDS 与 webview/themes.template.js 白名单逐字节相同', () => {
		const tsIds = [...VSWORD_MILKDOWN_THEME_IDS];
		const jsIds = [...(WEBVIEW_THEME_IDS as readonly string[])];
		assert.strictEqual(
			jsIds.length,
			tsIds.length,
			`TS ids (${tsIds.length}) vs webview ids (${jsIds.length}) 长度不一致；双源必须逐字节相同`,
		);
		for (let i = 0; i < tsIds.length; i++) {
			assert.strictEqual(
				jsIds[i], tsIds[i],
				`双源第 ${i} 位差异：TS='${tsIds[i]}' vs JS='${jsIds[i]}'`,
			);
		}
		// 默认 id 也要一致（防止一方漂移到别的 id）。
		assert.strictEqual(WEBVIEW_DEFAULT_THEME, VSWORD_MILKDOWN_DEFAULT_THEME);
		// 双源 isValidTheme 契约一致：都接受白名单里的 id，都拒 unknown。
		for (const id of tsIds) {
			assert.strictEqual(isValidTheme(id), true, `TS isValidTheme('${id}') 应为 true`);
			assert.strictEqual(webviewIsValidTheme(id), true, `webview isValidTheme('${id}') 应为 true`);
		}
		assert.strictEqual(isValidTheme('__nope__'), false);
		assert.strictEqual(webviewIsValidTheme('__nope__'), false);
	});

	test('A2 · getThemesCss() 每个非 default id 都存在 body[data-theme="<id>"] 选择器', () => {
		const css = getThemesCss();
		const nonDefault = (VSWORD_MILKDOWN_THEME_IDS as readonly string[]).filter(id => id !== 'default');
		assert.ok(nonDefault.length >= 4, `预期至少 4 个非-default id，实得 ${nonDefault.length}`);
		for (const id of nonDefault) {
			// 允许双引号或单引号的属性写法；这里 CSS blob 用双引号，正则宽松一点。
			// 注意：`body[data-theme="<id>"] {` —— 闭合 `]` 必须写进正则，选择器右侧允许空白后接 `{`。
			const re = new RegExp(`body\\[data-theme\\s*=\\s*["']${id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}["']\\s*\\]\\s*\\{`);
			assert.ok(
				re.test(css),
				`CSS 缺少 body[data-theme="${id}"] { … } 选择器；getThemesCss 与 id 白名单脱节`,
			);
		}
		// 反向：CSS 里不应该出现白名单外的 body[data-theme="<x>"] 选择器（防止残留脏 id）。
		const selectorRe = /body\[data-theme\s*=\s*["']([^"']+)["']\s*\]\s*\{/g;
		const seen = new Set<string>();
		let m: RegExpExecArray | null;
		while ((m = selectorRe.exec(css)) !== null) { seen.add(m[1]); }
		const whitelist = new Set<string>(VSWORD_MILKDOWN_THEME_IDS as readonly string[]);
		for (const id of seen) {
			assert.ok(whitelist.has(id) || id === 'default',
				`CSS 里出现白名单外 body[data-theme="${id}"]，audit 白名单未覆盖`);
		}
	});

	test('A3 · HostThemeChangedMessage.theme 类型是 string（宽签名，为 T-3.7d.2 ext:* id 让路）', () => {
		// 编译期断言：任何 string 都能赋值给 theme 字段；如果协议被收窄回联合类型，此赋值会立刻编译失败。
		const arbitrary: string = 'ext:workspace:whitey';
		const msg: HostThemeChangedMessage = { type: 'themeChanged', theme: arbitrary };
		assert.strictEqual(msg.type, 'themeChanged');
		assert.strictEqual(msg.theme, arbitrary);
		// 再补一次“内置 id 也能赋”的运行期形状检查（确保没有被误改成别的分支）。
		const msg2: HostThemeChangedMessage = { type: 'themeChanged', theme: 'github', isDark: false };
		assert.strictEqual(msg2.theme, 'github');
		assert.strictEqual(msg2.isDark, false);
	});
});

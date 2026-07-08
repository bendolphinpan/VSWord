/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.3 · Milkdown 主题状态栏 · 最小回归（E1-E5 + resolveThemeDisplayName 分支）。
//
// 5 条主断言（PRD DoD）：
//   E1 Milkdown editor active → entry 存在，text 含 `$(paintbrush)` + `Theme:` + displayName
//   E2 activeEditor 切到非 Milkdown → buildThemeStatusEntry 返回 undefined（caller 触发 dispose）
//   E3 storage lastTheme 变 → 再次调用 buildThemeStatusEntry 后 text 更新到新 displayName
//   E4 tooltip 含当前主题 displayName + 前缀 "Change Markdown theme"
//   E5 entry.command === 'vsword.selectMarkdownTheme'
//
// 走纯函数路径，不实例化 Contribution class —— 避免把 workbench service 树拉进 mocha bundle
// （拉一次要多 200+ 依赖，测试跑不动）。E1-E5 与运行时行为的关系已在 Contribution 里明面装配。
//
// 另外 resolveThemeDisplayName 5 条分支各自单测，覆盖 followWorkbench 与 external 分支路由。

import * as assert from 'assert';
import {
	buildThemeStatusEntry,
	resolveThemeDisplayName,
	VSWORD_MILKDOWN_SELECT_THEME_COMMAND_ID,
	VSWORD_MILKDOWN_THEME_STATUS_ENTRY_ID,
	type ThemeStatusEntryInput,
} from '../../browser/milkdownEditor/milkdownEditorThemeStatusModel.js';
import {
	__resetExternalThemesForTests,
	setExternalThemes,
} from '../../browser/milkdownEditor/milkdownEditorExternalThemeRegistry.js';

// --------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------

function baseLabels(): ThemeStatusEntryInput['labels'] {
	return {
		defaultLabel: 'Default (follow Code OSS)',
		entryName: 'VSWord Markdown Theme',
		text: (name) => `$(paintbrush) Theme: ${name}`,
		ariaLabel: (name) => `Markdown theme: ${name}`,
		tooltip: (name) => `Change Markdown theme (currently: ${name})`,
	};
}

function baseInput(overrides: Partial<ThemeStatusEntryInput> = {}): ThemeStatusEntryInput {
	return {
		isMilkdownActive: true,
		storedThemeId: 'github',
		followWorkbench: false,
		configLight: 'github',
		configDark: 'night',
		workbenchIsDark: false,
		labels: baseLabels(),
		...overrides,
	};
}

suite('T-3.7d.3 · Milkdown 主题状态栏 · E1-E5', () => {

	setup(() => __resetExternalThemesForTests());

	test('E1 · Milkdown editor active → entry 存在，text 含 $(paintbrush) 与 Theme: + displayName', () => {
		const entry = buildThemeStatusEntry(baseInput({ storedThemeId: 'github' }));
		assert.ok(entry, 'Milkdown active 时应返回 entry');
		assert.ok(entry.text.includes('$(paintbrush)'), 'text 应含 $(paintbrush)');
		assert.ok(entry.text.includes('Theme:'), 'text 应含 "Theme:"');
		assert.ok(entry.text.includes('github'), 'text 应含 displayName "github"');
		assert.strictEqual(VSWORD_MILKDOWN_THEME_STATUS_ENTRY_ID, 'vsword.milkdown.theme', 'entry id 常量锁死');
	});

	test('E2 · activeEditor 切到非 Milkdown → buildThemeStatusEntry 返回 undefined', () => {
		const entry = buildThemeStatusEntry(baseInput({ isMilkdownActive: false }));
		assert.strictEqual(entry, undefined, '非 Milkdown 时应返回 undefined 让 caller dispose accessor');
	});

	test('E3 · storage lastTheme 变 → 再算一次拿到新 displayName', () => {
		const before = buildThemeStatusEntry(baseInput({ storedThemeId: 'github' }));
		const after = buildThemeStatusEntry(baseInput({ storedThemeId: 'night' }));
		assert.ok(before?.text.includes('github'));
		assert.ok(after?.text.includes('night'));
		assert.ok(!after?.text.includes('github'), '换主题后旧 id 不应残留');
	});

	test('E4 · tooltip 含当前 displayName + "Change Markdown theme" 前缀', () => {
		const entry = buildThemeStatusEntry(baseInput({ storedThemeId: 'solarized-light' }));
		assert.ok(entry);
		const tooltip = String(entry.tooltip);
		assert.ok(tooltip.toLowerCase().includes('change markdown theme'));
		assert.ok(tooltip.includes('solarized-light'), 'tooltip 应含 displayName');
	});

	test('E5 · entry.command === "vsword.selectMarkdownTheme"', () => {
		const entry = buildThemeStatusEntry(baseInput());
		assert.ok(entry);
		assert.strictEqual(entry.command, 'vsword.selectMarkdownTheme');
		assert.strictEqual(VSWORD_MILKDOWN_SELECT_THEME_COMMAND_ID, 'vsword.selectMarkdownTheme', '命令 id 常量锁死');
	});

	test('E6 · 外挂主题 displayName 走 registry 反查（补充：ext:workspace:foo）', () => {
		setExternalThemes([{
			id: 'ext:workspace:foo',
			displayName: 'Foo Theme',
			source: 'workspace',
			uri: {} as any,
		}]);
		const entry = buildThemeStatusEntry(baseInput({ storedThemeId: 'ext:workspace:foo' }));
		assert.ok(entry);
		assert.ok(entry.text.includes('Foo Theme'), 'text 应用外挂 displayName 而非 id');
	});

	test('E7 · 外挂主题未注册 registry → id 兜底进入 text（不崩）', () => {
		const entry = buildThemeStatusEntry(baseInput({ storedThemeId: 'ext:user:ghost' }));
		assert.ok(entry);
		assert.ok(entry.text.includes('ext:user:ghost'), '未命中时 text 应含 id 兜底');
	});
});

suite('T-3.7d.3 · resolveThemeDisplayName · 纯函数分支', () => {

	setup(() => __resetExternalThemesForTests());

	test('followWorkbench=false + stored=newsprint → id=newsprint', () => {
		const r = resolveThemeDisplayName({
			storedThemeId: 'newsprint',
			followWorkbench: false,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: true,
			defaultLabel: 'Default',
		});
		assert.strictEqual(r.id, 'newsprint');
		assert.strictEqual(r.displayName, 'newsprint');
	});

	test('followWorkbench=true + dark → configDark', () => {
		const r = resolveThemeDisplayName({
			storedThemeId: 'github',
			followWorkbench: true,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: true,
			defaultLabel: 'Default',
		});
		assert.strictEqual(r.id, 'night');
	});

	test('followWorkbench=true + light → configLight', () => {
		const r = resolveThemeDisplayName({
			storedThemeId: 'night',
			followWorkbench: true,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: false,
			defaultLabel: 'Default',
		});
		assert.strictEqual(r.id, 'github');
	});

	test('stored=default → displayName=defaultLabel', () => {
		const r = resolveThemeDisplayName({
			storedThemeId: 'default',
			followWorkbench: false,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: false,
			defaultLabel: 'DEFAULT-LABEL',
		});
		assert.strictEqual(r.id, 'default');
		assert.strictEqual(r.displayName, 'DEFAULT-LABEL');
	});

	test('stored 无效（非内置、非 ext:*）→ 兜底 default', () => {
		const r = resolveThemeDisplayName({
			storedThemeId: 'bogus-x',
			followWorkbench: false,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: false,
			defaultLabel: 'Default',
		});
		assert.strictEqual(r.id, 'default');
	});

	test('stored=ext:user:foo（registry 未注册）→ id 保留，displayName=id', () => {
		const r = resolveThemeDisplayName({
			storedThemeId: 'ext:user:foo',
			followWorkbench: false,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: false,
			defaultLabel: 'Default',
		});
		assert.strictEqual(r.id, 'ext:user:foo');
		assert.strictEqual(r.displayName, 'ext:user:foo');
	});

	test('stored=ext:user:foo（registry 已注册）→ displayName 走 registry', () => {
		setExternalThemes([{
			id: 'ext:user:foo',
			displayName: 'Custom Foo',
			source: 'user',
			uri: {} as any,
		}]);
		const r = resolveThemeDisplayName({
			storedThemeId: 'ext:user:foo',
			followWorkbench: false,
			configLight: 'github',
			configDark: 'night',
			workbenchIsDark: false,
			defaultLabel: 'Default',
		});
		assert.strictEqual(r.displayName, 'Custom Foo');
	});
});

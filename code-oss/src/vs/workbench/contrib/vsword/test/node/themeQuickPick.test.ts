/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.3 · Select Markdown Theme quick-pick 分组化最小回归。
//
// 5 条断言（PRD DoD Q1-Q5）：
//   Q1 只内置：items 数=5，无 separator
//   Q2 workspace 外挂：5 内置 + 1 separator + N workspace items，separator 位置正确
//   Q3 user 外挂：workspace separator 之后再来 user separator + user items
//   Q4 workspace 与内置 id 冲突（`github` vs `ext:workspace:github`）：两个都在 list，不去重
//   Q5 外挂 item description === 'From workspace' / 'From user'
//
// 所有测试直接调纯函数 buildThemeQuickPickItems，不 mock IQuickInputService；
// ExternalTheme 的 URI 字段由 mocha fake 出（as any）绕过 URI 依赖，函数内只读 source + displayName + id。

import * as assert from 'assert';
import { buildThemeQuickPickItems } from '../../browser/milkdownEditor/milkdownEditorThemeQuickPick.js';
import type { ExternalTheme } from '../../browser/milkdownEditor/milkdownEditorExternalThemes.js';
import type {
	IQuickPickItem,
	IQuickPickSeparator,
} from '../../../../../platform/quickinput/common/quickInput.js';

const BUILTIN_IDS = ['default', 'github', 'newsprint', 'night', 'solarized-light'] as const;

function fakeExternal(source: 'workspace' | 'user', slug: string, displayName?: string): ExternalTheme {
	return {
		id: `ext:${source}:${slug}`,
		displayName: displayName ?? slug,
		source,
		uri: {} as any, // buildThemeQuickPickItems 从不读 uri，安全 stub。
	};
}

function isSep(entry: IQuickPickItem | IQuickPickSeparator): entry is IQuickPickSeparator {
	return (entry as IQuickPickSeparator).type === 'separator';
}

suite('T-3.7d.3 · Select Markdown Theme quick-pick 分组 · Q1-Q5 最小回归', () => {

	test('Q1 · 只内置：items 数=5，无 separator', () => {
		const items = buildThemeQuickPickItems({
			builtinIds: BUILTIN_IDS,
			external: [],
		});
		assert.strictEqual(items.length, 5, 'items 数应等于 builtinIds 长度');
		assert.strictEqual(items.filter(isSep).length, 0, '无外挂时不应出现任何 separator');
		// items 顺序应严格按 builtinIds
		for (let i = 0; i < BUILTIN_IDS.length; i++) {
			const it = items[i] as IQuickPickItem;
			assert.strictEqual(it.id, BUILTIN_IDS[i], `第 ${i} 项 id 应为 ${BUILTIN_IDS[i]}`);
		}
	});

	test('Q2 · 有 workspace 外挂：5 内置 + 1 separator + N workspace items', () => {
		const external: ExternalTheme[] = [
			fakeExternal('workspace', 'my-theme', 'My Theme'),
			fakeExternal('workspace', 'draft-a', 'Draft A'),
		];
		const items = buildThemeQuickPickItems({
			builtinIds: BUILTIN_IDS,
			external,
		});
		// 总长度：5 + 1 sep + 2 items = 8
		assert.strictEqual(items.length, 8);
		// separator 出现且只出现一次
		const sepIndices = items.map((e, i) => isSep(e) ? i : -1).filter(i => i >= 0);
		assert.deepStrictEqual(sepIndices, [5], 'workspace separator 应恰在内置块之后（index 5）');
		// separator 后的两条是 workspace item
		const first = items[6] as IQuickPickItem;
		const second = items[7] as IQuickPickItem;
		assert.strictEqual(first.id, 'ext:workspace:my-theme');
		assert.strictEqual(first.label, 'My Theme');
		assert.strictEqual(second.id, 'ext:workspace:draft-a');
	});

	test('Q3 · 有 user 外挂：workspace separator 之后再来 user separator + user items', () => {
		const external: ExternalTheme[] = [
			fakeExternal('workspace', 'wa', 'WS A'),
			fakeExternal('user', 'ua', 'User A'),
			fakeExternal('user', 'ub', 'User B'),
		];
		const items = buildThemeQuickPickItems({
			builtinIds: BUILTIN_IDS,
			external,
		});
		// 5 内置 + 1 sep + 1 ws item + 1 sep + 2 user items = 10
		assert.strictEqual(items.length, 10);
		const sepIndices = items.map((e, i) => isSep(e) ? i : -1).filter(i => i >= 0);
		assert.deepStrictEqual(sepIndices, [5, 7], 'workspace separator=5, user separator=7');
		// user 块顺序
		const u0 = items[8] as IQuickPickItem;
		const u1 = items[9] as IQuickPickItem;
		assert.strictEqual(u0.id, 'ext:user:ua');
		assert.strictEqual(u1.id, 'ext:user:ub');
	});

	test('Q4 · workspace `ext:workspace:github` 与内置 `github` 冲突时两者都在，不去重', () => {
		const external: ExternalTheme[] = [
			fakeExternal('workspace', 'github', 'GitHub Override'),
		];
		const items = buildThemeQuickPickItems({
			builtinIds: BUILTIN_IDS,
			external,
		});
		// 内置 github 仍在
		const builtinGithub = items.find(e => !isSep(e) && (e as IQuickPickItem).id === 'github') as IQuickPickItem | undefined;
		assert.ok(builtinGithub, '内置 github item 应保留（不被 workspace 覆盖去掉）');
		// 外挂 ext:workspace:github 也在
		const wsGithub = items.find(e => !isSep(e) && (e as IQuickPickItem).id === 'ext:workspace:github') as IQuickPickItem | undefined;
		assert.ok(wsGithub, '外挂 ext:workspace:github item 应存在');
		assert.strictEqual(wsGithub.label, 'GitHub Override', '外挂 label 走 displayName');
		// 两条 id 相互独立，separator 中间隔开
		assert.notStrictEqual(builtinGithub.id, wsGithub.id);
	});

	test('Q5 · 外挂 item description 为 `From workspace` / `From user`（默认 labels）', () => {
		const items = buildThemeQuickPickItems({
			builtinIds: BUILTIN_IDS,
			external: [
				fakeExternal('workspace', 'w1'),
				fakeExternal('user', 'u1'),
			],
		});
		const wsItem = items.find(e => !isSep(e) && (e as IQuickPickItem).id === 'ext:workspace:w1') as IQuickPickItem;
		const userItem = items.find(e => !isSep(e) && (e as IQuickPickItem).id === 'ext:user:u1') as IQuickPickItem;
		assert.strictEqual(wsItem.description, 'From workspace');
		assert.strictEqual(userItem.description, 'From user');
	});

	test('Q6 · currentThemeId 命中时给该项 description 追加 (current) 且 picked=true（补充回归）', () => {
		const items = buildThemeQuickPickItems({
			builtinIds: BUILTIN_IDS,
			external: [fakeExternal('user', 'u1', 'User One')],
			currentThemeId: 'ext:user:u1',
		});
		const userItem = items.find(e => !isSep(e) && (e as IQuickPickItem).id === 'ext:user:u1') as IQuickPickItem;
		assert.ok(userItem.description?.includes('(current)'), 'description 应含 (current) 后缀');
		assert.strictEqual(userItem.picked, true);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.3 · 外挂主题「模块级 registry」—— v1 权宜方案。
//
// PRD §4.3.3 明确 v1 不强制抽 IVswordMarkdownThemeService。为了让 3 个消费者
// （SelectMarkdownThemeAction / VswordMilkdownThemeStatus / Contribution.readEffectiveTheme）
// 共享同一份 externalThemes 状态而不引入 DI service，暂用模块级 singleton：
//
//   - Contribution 每次 refresh 结束调 setExternalThemes(...) 覆盖缓存 + fire onDidChange 事件；
//   - Action 打开 quick-pick 时读 getExternalThemes()；
//   - StatusEntry 订阅 onDidChangeExternalThemes 更新 displayName。
//
// 后续 v2 抽 service 时，本模块可以整个删掉，消费者改依赖注入即可；registry 不写入任何持久状态，
// 也不 own IStorageService / IFileService，是真正意义上的 volatile view。
//
// 单测里可以直接调 setExternalThemes 塞 fixture、订阅 onDidChangeExternalThemes 验事件。

import { Emitter, Event } from '../../../../../base/common/event.js';
import type { ExternalTheme } from './milkdownEditorExternalThemes.js';

let _externalThemes: readonly ExternalTheme[] = [];
const _onDidChange = new Emitter<void>();

/** 读取当前 discovery 缓存。返回不可变数组视图。 */
export function getExternalThemes(): readonly ExternalTheme[] {
	return _externalThemes;
}

/** Contribution / 单测调用：覆盖缓存并广播事件。参数会被浅拷贝以避免外部继续 mutate。 */
export function setExternalThemes(themes: readonly ExternalTheme[]): void {
	_externalThemes = themes.slice();
	_onDidChange.fire();
}

/**
 * 事件订阅入口。任何时间点消费者可 register listener；listener 只收到"发生变化"这一位信号，
 * 具体值请再调 getExternalThemes()。这样避免 listener 需要 diff 处理数组。
 */
export const onDidChangeExternalThemes: Event<void> = _onDidChange.event;

/**
 * 从 id 反查 displayName —— 状态栏展示用。
 *
 * 匹配顺序：
 *  1. 外挂 id（`ext:*`）→ 走 external 缓存反查；查不到时返回 id 本身兜底。
 *  2. `default` → 返回 caller 传入的 fallbackDefaultLabel（i18n 由 caller 完成）。
 *  3. 其他（内置 5 id） → 直接返回 id（内置无独立 displayName，label 就是 id）。
 */
export function displayNameForThemeId(id: string, fallbackDefaultLabel: string): string {
	if (id === 'default') return fallbackDefaultLabel;
	if (id.startsWith('ext:')) {
		const hit = _externalThemes.find(t => t.id === id);
		return hit ? hit.displayName : id;
	}
	return id;
}

/**
 * 测试专用 · 重置内部状态。
 *
 * 生产代码禁调；仅供单测 setUp/tearDown 清桶用，避免 mocha 用例间通过模块级状态串味。
 */
export function __resetExternalThemesForTests(): void {
	_externalThemes = [];
}

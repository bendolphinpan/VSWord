/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.a · Typora `.css` 外挂主题 —— 纯类型 / 常量层。
//
// 本文件严格禁写运行时逻辑（无 fs、无 watcher、无 discover），只承担三件事：
//   1. 用户放主题的目录常量（`VSWORD_EXTERNAL_THEMES_DIRNAME`），字节锁死，防未来漂移。
//   2. 一条 `ExternalTheme` 记录结构（discover 出来的主题描述），供 b 子卡的 discovery 实现直接 import。
//   3. `ext:*` 主题 id 的两条纯函数 helper（`isExternalThemeId` / `makeExternalThemeId`），
//      供 c 子卡的 `broadcastTheme` 分支判断 + b 子卡的 discovery 生成 id 使用。
//
// 对应 PRD：`docs/requirements/T-3.7d-theme-compat.md` §4.2 + §7.2。
// 对应 audit：`docs/requirements/T-3.7d.1-builtin-themes-audit.md` §5。

import type { URI } from '../../../../../base/common/uri.js';

/**
 * T-3.7d.2 · 用户放 Typora `.css` 主题的目录名（相对 workspace 根 / OS user config 根）。
 *
 * 值锁死为 `.vsword/themes`，PRD §4.2 已定；单测 `externalThemesConstants.test.ts` 会字节校验。
 * 未来若需要迁位置，务必在 PRD 里改一次，测试会立刻绷断提醒同步。
 */
export const VSWORD_EXTERNAL_THEMES_DIRNAME = '.vsword/themes';

/**
 * T-3.7d.2 · 一条已发现的外挂主题记录。
 *
 * 字段语义：
 *  - `id`：形如 `ext:workspace:my-theme` / `ext:user:my-theme`；由 `makeExternalThemeId` 生成。
 *  - `displayName`：UI 侧显示名（默认取文件名去 `.css` 后缀，保持大小写）。
 *  - `source`：来自 workspace 目录还是 user 目录，决定 UI 分组与优先级。
 *  - `uri`：具体 `.css` 文件的 URI（虚拟文件系统 aware）；b 子卡实现读取时用它。
 *
 * discovery 层（b 子卡）产出 `ExternalTheme[]`，broadcast 层（c 子卡）消费。
 */
export interface ExternalTheme {
	readonly id: string;
	readonly displayName: string;
	readonly source: 'workspace' | 'user';
	readonly uri: URI;
}

/**
 * T-3.7d.2 · 判断某个主题 id 是否为外挂主题（`ext:` 前缀）。
 *
 * 纯函数、无副作用；空串 / 内置 id（`github` / `academic` / ...）返回 false。
 * 用于 `readEffectiveTheme` / `broadcastTheme` 分支路由：内置走 CSS attribute，外挂走 `themeCssPayload`。
 */
export function isExternalThemeId(id: string): boolean {
	return id.startsWith('ext:');
}

/**
 * T-3.7d.2 · 生成一个外挂主题 id。
 *
 * 形如 `ext:workspace:my-theme` / `ext:user:my-theme`。
 * `slug` 由 caller 保证已小写并去 `.css` 后缀（b 子卡的 discovery 层负责规范化）。
 */
export function makeExternalThemeId(source: 'workspace' | 'user', slug: string): string {
	return `ext:${source}:${slug}`;
}

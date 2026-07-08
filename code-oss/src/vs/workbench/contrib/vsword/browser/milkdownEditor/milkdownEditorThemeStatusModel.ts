/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.3 · Milkdown 主题状态栏 item —— 纯逻辑层。
//
// 目的：把「当前应显示哪个 displayName + 状态栏 entry 的形状」这段纯逻辑从
// Contribution class 剥离出来，让 E1-E5 单测直接调纯函数，避免把 IEditorService /
// IStatusbarService / MilkdownEditorInput 等 workbench 重依赖拉进 mocha bundle。
//
// Contribution 端职责只剩 wiring：
//   1. 订阅 5 个事件源（editor/config/storage/theme/registry）
//   2. 每次触发 → 收集入参 → 调 buildThemeStatusEntry → 拿到 IStatusbarEntry|undefined
//   3. undefined → clear MutableDisposable；否则 addEntry / update
//
// 本文件不 import 任何 workbench 层符号；只依赖 `IStatusbarEntry` 类型（type-only 允许 —— 走的是 statusbar
// 类型声明，不带运行时副作用）。

import type { IStatusbarEntry } from '../../../../services/statusbar/browser/statusbar.js';
import { VSWORD_MILKDOWN_DEFAULT_THEME, isValidTheme } from './milkdownEditorThemes.js';
import { isExternalThemeId } from './milkdownEditorExternalThemes.js';
import { displayNameForThemeId } from './milkdownEditorExternalThemeRegistry.js';

/** T-3.7d.3 · 纯函数入参：storage / config / theme 直读值 + active editor 判定结果 + i18n 字符串。 */
export interface ThemeStatusEntryInput {
	/** 是否 Milkdown editor 激活。false → 返回 undefined 表示应 clear。 */
	readonly isMilkdownActive: boolean;
	/** storage 直读 `vsword.milkdown.lastTheme`；未设置传 undefined。 */
	readonly storedThemeId: string | undefined;
	/** config `vsword.theme.followWorkbench`。 */
	readonly followWorkbench: boolean;
	/** config `vsword.theme.light`。 */
	readonly configLight: string;
	/** config `vsword.theme.dark`。 */
	readonly configDark: string;
	/** 当前 workbench 主题是否 dark（ColorScheme.DARK 或 HIGH_CONTRAST_DARK）。 */
	readonly workbenchIsDark: boolean;
	/** i18n 字符串（caller 传 localize 产物）。 */
	readonly labels: {
		readonly defaultLabel: string;             // 'Default (follow Code OSS)'
		readonly entryName: string;                // 'VSWord Markdown Theme'
		readonly text: (displayName: string) => string;     // '$(paintbrush) Theme: {0}'
		readonly ariaLabel: (displayName: string) => string; // 'Markdown theme: {0}'
		readonly tooltip: (displayName: string) => string;   // 'Change Markdown theme (currently: {0})'
	};
}

/** T-3.7d.3 · Select 命令 id —— 单测 E5 会硬校验。 */
export const VSWORD_MILKDOWN_SELECT_THEME_COMMAND_ID = 'vsword.selectMarkdownTheme';

/** T-3.7d.3 · 状态栏 entry 位置 id —— 单测 E2 校验 dispose 走的就是这个 id。 */
export const VSWORD_MILKDOWN_THEME_STATUS_ENTRY_ID = 'vsword.milkdown.theme';

/**
 * T-3.7d.3 · 从入参 + registry 反查决出「当前生效 id + displayName」。
 *
 * 分支（与 Contribution.readEffectiveTheme 保持 v1 对齐，见 PRD §4.3.3）：
 *   - followWorkbench=true → 取 workbenchIsDark ? configDark : configLight（跳过 stored）
 *   - 否则：stored 是内置合法 id 或 ext:* 前缀 → 用 stored；不合法 → 兜底 'default'
 *
 * displayName 反查规则（见 displayNameForThemeId）：
 *   - 'default' → labels.defaultLabel
 *   - ext:* → registry 命中 → theme.displayName；未命中 → id 兜底
 *   - 其他（内置 4 个 slug）→ 直接返回 id
 */
export function resolveThemeDisplayName(input: {
	readonly storedThemeId: string | undefined;
	readonly followWorkbench: boolean;
	readonly configLight: string;
	readonly configDark: string;
	readonly workbenchIsDark: boolean;
	readonly defaultLabel: string;
}): { readonly id: string; readonly displayName: string } {
	let id: string;
	if (input.followWorkbench) {
		id = input.workbenchIsDark ? input.configDark : input.configLight;
	} else {
		const stored = input.storedThemeId;
		if (typeof stored === 'string' && (isValidTheme(stored) || isExternalThemeId(stored))) {
			id = stored;
		} else {
			id = VSWORD_MILKDOWN_DEFAULT_THEME;
		}
	}
	const displayName = displayNameForThemeId(id, input.defaultLabel);
	return { id, displayName };
}

/**
 * T-3.7d.3 · 状态栏 entry 构造（PRD §4.3.2 硬性字段全在此处装配）。
 *
 * - `isMilkdownActive=false` → 返回 undefined，caller 应 dispose accessor（E2）
 * - 否则返回 IStatusbarEntry：text 含 `$(paintbrush)` + `Theme:` + displayName（E1），
 *   tooltip 含当前 displayName（E4），command === VSWORD_MILKDOWN_SELECT_THEME_COMMAND_ID（E5）
 */
export function buildThemeStatusEntry(input: ThemeStatusEntryInput): IStatusbarEntry | undefined {
	if (!input.isMilkdownActive) {
		return undefined;
	}
	const { displayName } = resolveThemeDisplayName({
		storedThemeId: input.storedThemeId,
		followWorkbench: input.followWorkbench,
		configLight: input.configLight,
		configDark: input.configDark,
		workbenchIsDark: input.workbenchIsDark,
		defaultLabel: input.labels.defaultLabel,
	});
	return {
		name: input.labels.entryName,
		text: input.labels.text(displayName),
		ariaLabel: input.labels.ariaLabel(displayName),
		tooltip: input.labels.tooltip(displayName),
		command: VSWORD_MILKDOWN_SELECT_THEME_COMMAND_ID,
	};
}

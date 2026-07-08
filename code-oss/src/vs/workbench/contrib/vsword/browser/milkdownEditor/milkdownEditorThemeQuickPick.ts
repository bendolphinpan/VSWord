/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.3 · Select Markdown Theme 命令的 quick-pick 项目构造（纯函数层）。
//
// 独立成模块的两个理由：
//  1. 单测友好 —— 只测数组形状，不需要 mock IQuickInputService。
//  2. 未来若把 Registrations 拆包（例如迁到 IVswordMarkdownThemeService · v2），本模块可原地保留。
//
// 布局遵循 PRD `docs/requirements/T-3.7d-theme-compat.md` §4.3.1：
//   [内置 default / github / newsprint / night / solarized-light]
//   ── separator "外挂主题 · Workspace" ── （仅当 workspace 外挂 > 0）
//   [workspace 外挂 items（按发现顺序，displayName 作 label）]
//   ── separator "外挂主题 · User" ── （仅当 user 外挂 > 0）
//   [user 外挂 items]
//
// PRD §4.3.1 明确：workspace 与内置同 slug（例如 ext:workspace:github vs 内置 github）**不去重**，
// 两个都列出、用户自己按分组挑；避免 workspace .css 意外覆盖了内置写死渲染路径的怪相。

import type {
	IQuickPickItem,
	IQuickPickSeparator,
} from '../../../../../platform/quickinput/common/quickInput.js';
import type { ExternalTheme } from './milkdownEditorExternalThemes.js';

/** T-3.7d.3 · quick-pick item 输入。 */
export interface ThemeQuickPickInput {
	/** 内置 5 主题 id（`VSWORD_MILKDOWN_THEME_IDS` 展开传入 —— 本层不硬编码 5 个字面量）。 */
	readonly builtinIds: readonly string[];
	/** discovery 结果；空数组表示无外挂主题，此时不产出任何 separator。 */
	readonly external: readonly ExternalTheme[];
	/**
	 * 可选 · 当前生效的主题 id。若命中某项则给该项 `description` 加 `(current)` 后缀，
	 * 并把该项的 `picked` 设为 true 便于 quick-pick 默认高亮。
	 *
	 * NOTE：外挂 item 本身有 `description = From workspace/user`（PRD 硬性要求），
	 * `(current)` 追加在原 description 后；内置 item 平时无 description，命中时展示 `(current)`。
	 */
	readonly currentThemeId?: string;
	/**
	 * 可选 · 供 localize 层注入的字符串（i18n key 由 caller 完成）。缺省用英文兜底。
	 * 单测里可以传 undefined 直接吃默认；产线走 Action 时传 localize 的产物。
	 */
	readonly labels?: {
		defaultLabel?: string;                // 'Default (follow Code OSS)'
		workspaceSeparator?: string;          // 'External themes · Workspace'
		userSeparator?: string;               // 'External themes · User'
		fromWorkspaceDescription?: string;    // 'From workspace'
		fromUserDescription?: string;         // 'From user'
		currentSuffix?: string;               // '(current)' — 追加到 description
	};
}

/** T-3.7d.3 · buildThemeQuickPickItems 输出的联合类型（quick-pick items 参数直接兼容）。 */
export type ThemeQuickPickEntry = IQuickPickItem | IQuickPickSeparator;

const DEFAULT_LABELS = {
	defaultLabel: 'Default (follow Code OSS)',
	workspaceSeparator: 'External themes · Workspace',
	userSeparator: 'External themes · User',
	fromWorkspaceDescription: 'From workspace',
	fromUserDescription: 'From user',
	currentSuffix: '(current)',
} as const;

/**
 * T-3.7d.3 · 生成 quick-pick items。
 *
 * 单测友好保证（PRD DoD Q1-Q5）：
 *  - 只内置：无 separator，长度 === builtinIds.length
 *  - 有 workspace 外挂：正好 1 条 workspace separator，出现在内置块之后、workspace item 块之前
 *  - 有 user 外挂：正好 1 条 user separator，出现在 workspace 块（若有）之后、user item 块之前
 *  - id 冲突不去重 —— 内置 `github` 和 `ext:workspace:github` 同时出现
 *  - 外挂 item 的 `description` 精确等于 `From workspace` / `From user`（未传 labels 时的默认值）
 */
export function buildThemeQuickPickItems(input: ThemeQuickPickInput): ThemeQuickPickEntry[] {
	const labels = { ...DEFAULT_LABELS, ...(input.labels ?? {}) };
	const current = input.currentThemeId;
	const items: ThemeQuickPickEntry[] = [];

	// ---- 内置块 --------------------------------------------------------
	for (const id of input.builtinIds) {
		const label = id === 'default' ? labels.defaultLabel : id;
		const isCurrent = current === id;
		const item: IQuickPickItem = {
			id,
			label,
			// 命中当前时给一个 description（内置项平时不带 description）。
			description: isCurrent ? labels.currentSuffix : undefined,
			picked: isCurrent || undefined,
		};
		items.push(item);
	}

	// ---- 外挂分组 -----------------------------------------------------
	// PRD 明确按 source 分组渲染 —— 保留发现顺序（discovery 层已 workspace-then-user 排序）。
	const workspaceThemes = input.external.filter(t => t.source === 'workspace');
	const userThemes = input.external.filter(t => t.source === 'user');

	if (workspaceThemes.length > 0) {
		items.push({ type: 'separator', label: labels.workspaceSeparator });
		for (const t of workspaceThemes) {
			const isCurrent = current === t.id;
			const description = isCurrent
				? `${labels.fromWorkspaceDescription} · ${labels.currentSuffix}`
				: labels.fromWorkspaceDescription;
			items.push({
				id: t.id,
				label: t.displayName,
				description,
				picked: isCurrent || undefined,
			});
		}
	}

	if (userThemes.length > 0) {
		items.push({ type: 'separator', label: labels.userSeparator });
		for (const t of userThemes) {
			const isCurrent = current === t.id;
			const description = isCurrent
				? `${labels.fromUserDescription} · ${labels.currentSuffix}`
				: labels.fromUserDescription;
			items.push({
				id: t.id,
				label: t.displayName,
				description,
				picked: isCurrent || undefined,
			});
		}
	}

	return items;
}

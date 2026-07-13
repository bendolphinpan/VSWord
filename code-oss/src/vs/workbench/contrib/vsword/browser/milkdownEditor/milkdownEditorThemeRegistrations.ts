/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { localize, localize2 } from '../../../../../nls.js';
import {
	VSWORD_MILKDOWN_THEME_IDS,
	VSWORD_MILKDOWN_THEME_STORAGE_KEY,
	VSWORD_THEME_CONFIG,
	isValidTheme,
} from './milkdownEditorThemes.js';
import {
	VSWORD_IMAGE_STRATEGIES,
	VSWORD_IMAGE_STRATEGY_CONFIG,
	VSWORD_IMAGE_STRATEGY_DEFAULT,
} from './imageStorageStrategy.js';
import {
	VSWORD_EXPORT_IMAGE_MODE_CONFIG,
	VSWORD_EXPORT_IMAGE_MODES,
	VSWORD_EXPORT_IMAGE_MODE_DEFAULT,
	VSWORD_EXPORT_OUTPUT_DIR_CONFIG,
} from './milkdownEditorProtocol.js';
import {
	VSWORD_TYPOGRAPHY_CONFIG,
	VSWORD_FONT_SIZE_MIN,
	VSWORD_FONT_SIZE_MAX,
	VSWORD_LINE_HEIGHT_MIN,
	VSWORD_LINE_HEIGHT_MAX,
} from './milkdownEditorTypography.js';
import { buildThemeQuickPickItems } from './milkdownEditorThemeQuickPick.js';
import { getExternalThemes } from './milkdownEditorExternalThemeRegistry.js';
import { isExternalThemeId } from './milkdownEditorExternalThemes.js';

/**
 * T-3.3.1: register the Settings schema for the three theme-related keys.
 *  - followWorkbench (boolean)
 *  - light   (enum of theme ids, minus 'default')
 *  - dark    (enum of theme ids, minus 'default')
 * The contribution reads these + IStorageService lastTheme via readEffectiveTheme().
 */
const selectableThemes = (VSWORD_MILKDOWN_THEME_IDS as readonly string[]).filter(id => id !== 'default');

Registry.as<IConfigurationRegistry>(ConfigExtensions.Configuration).registerConfiguration({
	id: 'vsword.markdown',
	order: 210,
	title: localize('vsword.markdown.title', 'VSWord Markdown'),
	type: 'object',
	properties: {
		[VSWORD_IMAGE_STRATEGY_CONFIG]: {
			type: 'string',
			enum: [...VSWORD_IMAGE_STRATEGIES],
			enumDescriptions: [
				localize('vsword.markdown.imageStorage.assetsShared', 'Save into a shared `assets/` folder next to the Markdown file (default). Multiple .md files under the same folder share the folder.'),
				localize('vsword.markdown.imageStorage.assetsPerFile', 'Save into a per-file `<name>.assets/` folder next to the Markdown file (Typora-compatible layout).'),
				localize('vsword.markdown.imageStorage.sameFolder', 'Save directly into the same folder as the Markdown file (flat).'),
			],
			default: VSWORD_IMAGE_STRATEGY_DEFAULT,
			description: localize('vsword.markdown.imageStorage.desc', 'Where pasted/dropped images get written on disk. All strategies produce relative paths inside the Markdown — external URLs pasted from browsers are left as-is (not downloaded).'),
		},
		// T-3.8b.1 · HTML 导出：图片打包策略。
		[VSWORD_EXPORT_IMAGE_MODE_CONFIG]: {
			type: 'string',
			enum: [...VSWORD_EXPORT_IMAGE_MODES],
			enumDescriptions: [
				localize('vsword.export.imageMode.dataUri', '将图片以 base64 data URI 内嵌到单个 HTML 文件里（默认，单文件便携分享）。'),
				localize('vsword.export.imageMode.siblingFolder', '导出为 `<name>.html` + `<name>_files/` 双件（图片外置，兼容 Typora 布局）。'),
			],
			default: VSWORD_EXPORT_IMAGE_MODE_DEFAULT,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize('vsword.export.imageMode.desc', 'VSWord Markdown 导出 HTML 时的图片打包策略。`data-uri` 单文件内嵌；`sibling-folder` 拆成同名 `<name>_files/` 目录。'),
		},
		// T-3.8b.1 · HTML 导出：默认输出目录（本卡未接 UI，预留 schema）。
		[VSWORD_EXPORT_OUTPUT_DIR_CONFIG]: {
			type: 'string',
			default: '',
			markdownDescription: localize('vsword.export.outputDir.desc', 'VSWord 导出 HTML 的默认目录（绝对路径）。为空时打开 SaveAs 对话框，默认落到当前 Markdown 文件同目录。'),
		},
		// RD-7 · 用户字体三元组（决策 L-1）：仅覆盖正文 font/size/line，不碰主题色。
		[VSWORD_TYPOGRAPHY_CONFIG.fontFamily]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'vsword.markdown.fontFamily.desc',
				'VSWord Markdown 正文字体（CSS `font-family`）。留空则使用当前主题默认字体。示例：`"Georgia, \\"PingFang SC\\", serif"`。',
			),
		},
		[VSWORD_TYPOGRAPHY_CONFIG.fontSize]: {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: VSWORD_FONT_SIZE_MAX,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'vsword.markdown.fontSize.desc',
				'VSWord Markdown 正文字号（px）。`0` = 跟随主题；有效范围 {0}–{1}。',
				String(VSWORD_FONT_SIZE_MIN),
				String(VSWORD_FONT_SIZE_MAX),
			),
		},
		[VSWORD_TYPOGRAPHY_CONFIG.lineHeight]: {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: VSWORD_LINE_HEIGHT_MAX,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: localize(
				'vsword.markdown.lineHeight.desc',
				'VSWord Markdown 正文行高（无单位倍数，如 `1.7`）。`0` = 跟随主题；有效范围 {0}–{1}。',
				String(VSWORD_LINE_HEIGHT_MIN),
				String(VSWORD_LINE_HEIGHT_MAX),
			),
		},
	},
});

Registry.as<IConfigurationRegistry>(ConfigExtensions.Configuration).registerConfiguration({
	id: 'vsword.theme',
	order: 200,
	title: localize('vsword.theme.title', 'VSWord Markdown Theme'),
	type: 'object',
	properties: {
		[VSWORD_THEME_CONFIG.followWorkbench]: {
			type: 'boolean',
			default: false,
			description: localize('vsword.theme.followWorkbench.desc', 'When enabled, VSWord automatically picks the light or dark Markdown theme based on the current Code OSS workbench color theme kind.'),
		},
		[VSWORD_THEME_CONFIG.light]: {
			type: 'string',
			enum: selectableThemes,
			default: 'github',
			description: localize('vsword.theme.light.desc', 'Markdown theme applied when followWorkbench is on and the workbench is in a light color scheme.'),
		},
		[VSWORD_THEME_CONFIG.dark]: {
			type: 'string',
			enum: selectableThemes,
			default: 'night',
			description: localize('vsword.theme.dark.desc', 'Markdown theme applied when followWorkbench is on and the workbench is in a dark color scheme.'),
		},
	},
});

/**
 * Command: `VSWord: Select Markdown Theme`. Simply writes IStorageService —
 * the contribution's `onDidChangeConfiguration` / broadcast path is not needed
 * because the storage service also fires change events, and the contribution
 * subscribes to config only. So we broadcast via storage.onDidChangeValue on
 * the contribution side (registered there).
 */
class SelectMarkdownThemeAction extends Action2 {
	static readonly ID = 'vsword.selectMarkdownTheme';
	constructor() {
		super({
			id: SelectMarkdownThemeAction.ID,
			title: localize2('vsword.selectMarkdownTheme', 'VSWord: Select Markdown Theme'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const storage = accessor.get(IStorageService);
		const current = storage.get(VSWORD_MILKDOWN_THEME_STORAGE_KEY, StorageScope.APPLICATION, 'default');
		// T-3.7d.3 · quick-pick 分组化：内置 + separator + workspace/user 外挂。
		// items 构造走纯函数 buildThemeQuickPickItems（单测独立回归）。
		const items = buildThemeQuickPickItems({
			builtinIds: VSWORD_MILKDOWN_THEME_IDS,
			external: getExternalThemes(),
			currentThemeId: current,
			labels: {
				defaultLabel: localize('vsword.theme.default', 'Default (follow Code OSS)'),
				workspaceSeparator: localize('vsword.theme.externalWorkspaceGroup', 'External themes · Workspace'),
				userSeparator: localize('vsword.theme.externalUserGroup', 'External themes · User'),
				fromWorkspaceDescription: localize('vsword.theme.fromWorkspace', 'From workspace'),
				fromUserDescription: localize('vsword.theme.fromUser', 'From user'),
				currentSuffix: localize('vsword.theme.currentSuffix', '(current)'),
			},
		});
		const picked = await quickInput.pick(items as QuickPickInput<IQuickPickItem>[], {
			placeHolder: localize('vsword.theme.pickPlaceholder', 'Select Markdown theme'),
		});
		if (!picked || typeof picked.id !== 'string') return;
		// 内置 id 走原有校验；外挂 id（ext:*）单独放行 —— readEffectiveTheme 会再校验一次是否命中缓存。
		if (isExternalThemeId(picked.id) || isValidTheme(picked.id)) {
			storage.store(VSWORD_MILKDOWN_THEME_STORAGE_KEY, picked.id, StorageScope.APPLICATION, StorageTarget.USER);
		}
	}
}
registerAction2(SelectMarkdownThemeAction);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.3 · Milkdown 主题状态栏 Contribution —— wiring 层。
//
// 只负责 4 件事：
//   1. 判定当前 activeEditor 是否 MilkdownEditorInput
//   2. 从 5 个 service 收集 raw 值
//   3. 调用纯函数 buildThemeStatusEntry 生成 entry
//   4. addEntry / update / dispose
//
// 具体判定逻辑、i18n 装配、字段形状全部在 milkdownEditorThemeStatusModel.ts。
// 事件订阅源与 PRD §4.3.2 一一对应：
//   - IEditorService.onDidActiveEditorChange       ← 硬性
//   - IStorageService.onDidChangeValue (lastTheme) ← 硬性
//   - IConfigurationService.onDidChangeConfiguration (vsword.theme.*) ← 硬性
//   - IThemeService.onDidColorThemeChange          ← 硬性
//   - registry.onDidChangeExternalThemes           ← 硬性（外挂 discovery 完成时刷 displayName）

import { localize } from '../../../../../nls.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { isDark } from '../../../../../platform/theme/common/theme.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import {
	IStatusbarEntryAccessor,
	IStatusbarService,
	StatusbarAlignment,
} from '../../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import {
	VSWORD_MILKDOWN_THEME_STORAGE_KEY,
	VSWORD_THEME_CONFIG,
} from './milkdownEditorThemes.js';
import { onDidChangeExternalThemes } from './milkdownEditorExternalThemeRegistry.js';
import {
	VSWORD_MILKDOWN_THEME_STATUS_ENTRY_ID,
	buildThemeStatusEntry,
} from './milkdownEditorThemeStatusModel.js';

/**
 * T-3.7d.3 · Milkdown 主题状态栏 Contribution。
 * 仅在 activeEditor 是 MilkdownEditorInput 时挂载 entry；切走则 dispose accessor。
 */
export class VswordMilkdownThemeStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.vsword.milkdownThemeStatus';

	private readonly _entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._register(this._editorService.onDidActiveEditorChange(() => this._refresh()));

		// storage 直改 lastTheme：只在同 scope + 同 key 时刷新（VSCode API 已在此处帮我们过滤）
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, VSWORD_MILKDOWN_THEME_STORAGE_KEY, this._store)(() => this._refresh()));

		// config vsword.theme.* 变
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(VSWORD_THEME_CONFIG.followWorkbench) ||
				e.affectsConfiguration(VSWORD_THEME_CONFIG.light) ||
				e.affectsConfiguration(VSWORD_THEME_CONFIG.dark)
			) {
				this._refresh();
			}
		}));

		// workbench 主题切换（followWorkbench 分支下 displayName 变化）
		this._register(this._themeService.onDidColorThemeChange(() => this._refresh()));

		// 外挂主题 registry 变（discovery 完成）
		this._register(onDidChangeExternalThemes(() => this._refresh()));

		this._refresh();
	}

	private _refresh(): void {
		const entry = buildThemeStatusEntry({
			isMilkdownActive: this._editorService.activeEditor instanceof MilkdownEditorInput,
			storedThemeId: this._storageService.get(VSWORD_MILKDOWN_THEME_STORAGE_KEY, StorageScope.APPLICATION),
			followWorkbench: this._configurationService.getValue<boolean>(VSWORD_THEME_CONFIG.followWorkbench) ?? false,
			configLight: this._configurationService.getValue<string>(VSWORD_THEME_CONFIG.light) ?? 'github',
			configDark: this._configurationService.getValue<string>(VSWORD_THEME_CONFIG.dark) ?? 'night',
			workbenchIsDark: isDark(this._themeService.getColorTheme().type),
			labels: {
				defaultLabel: localize('vsword.theme.default', 'Default (follow Code OSS)'),
				entryName: localize('vsword.milkdown.themeEntry.name', 'VSWord Markdown Theme'),
				text: (name) => localize(
					{ key: 'vsword.milkdown.themeEntry.text', comment: ['{0} is the current Markdown theme display name'] },
					'$(paintbrush) Theme: {0}',
					name,
				),
				ariaLabel: (name) => localize(
					{ key: 'vsword.milkdown.themeEntry.aria', comment: ['{0} is the current Markdown theme display name'] },
					'Markdown theme: {0}',
					name,
				),
				tooltip: (name) => localize(
					{ key: 'vsword.milkdown.themeEntry.tooltip', comment: ['{0} is the current Markdown theme display name'] },
					'Change Markdown theme (currently: {0})',
					name,
				),
			},
		});

		if (!entry) {
			this._entry.clear();
			return;
		}
		if (this._entry.value) {
			this._entry.value.update(entry);
		} else {
			this._entry.value = this._statusbarService.addEntry(entry, VSWORD_MILKDOWN_THEME_STATUS_ENTRY_ID, StatusbarAlignment.RIGHT, 101);
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
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
		const items = (VSWORD_MILKDOWN_THEME_IDS as readonly string[]).map(id => ({
			id,
			label: id === 'default'
				? localize('vsword.theme.default', 'Default (follow Code OSS)')
				: id,
		}));
		const picked = await quickInput.pick(items, {
			placeHolder: localize('vsword.theme.pickPlaceholder', 'Select Markdown theme'),
		});
		if (!picked || !isValidTheme(picked.id)) return;
		storage.store(VSWORD_MILKDOWN_THEME_STORAGE_KEY, picked.id, StorageScope.APPLICATION, StorageTarget.USER);
	}
}
registerAction2(SelectMarkdownThemeAction);

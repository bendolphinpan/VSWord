/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ThemeSettingDefaults } from '../../../services/themes/common/workbenchThemeService.js';

/**
 * VSWord writer-mode defaults for Markdown and plaintext editing.
 *
 * Registered as default configuration overrides so the user can still change
 * them in their settings.json — we only shift the *default* baseline so that
 * opening a `.md` file feels like a writing tool out of the box.
 *
 * 整窗主题必须用当前内置 id（`Light 2026` = ThemeSettingDefaults.COLOR_THEME_LIGHT）：
 * 旧值 `Default Light Modern` 已迁移为 `Light Modern`，无法命中 ThemeService 的
 * 浅色 initial color map，桌面端会先按 DARK 起色 → 白/黑/白 整窗闪。
 */
const VSWORD_MARKDOWN_DEFAULTS = {
	// Soft-wrap long paragraphs at the viewport edge — writers don't want
	// horizontal scrolling.
	'editor.wordWrap': 'on',
	// Hide the minimap; it's noise for prose.
	'editor.minimap.enabled': false,
	// Hide line numbers; writers think in paragraphs, not lines.
	'editor.lineNumbers': 'off',
	// Hide folding controls and indent guides — they're code affordances.
	'editor.folding': false,
	'editor.guides.indentation': false,
	// Disable inline code suggestions / quick suggestions while typing prose.
	'editor.quickSuggestions': { other: 'off', comments: 'off', strings: 'off' },
	'editor.suggestOnTriggerCharacters': false,
	// No active-line highlight — keep the page clean.
	'editor.renderLineHighlight': 'none',
	// Slightly taller line height for readability.
	'editor.lineHeight': 1.6,
	// Larger default font size for prose.
	'editor.fontSize': 15,
};

const VSWORD_PLAINTEXT_DEFAULTS = {
	'editor.wordWrap': 'on',
	'editor.minimap.enabled': false,
	'editor.lineNumbers': 'off',
	'editor.folding': false,
	'editor.guides.indentation': false,
	'editor.renderLineHighlight': 'none',
	'editor.lineHeight': 1.6,
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerDefaultConfigurations([
		{
			overrides: {
				'[markdown]': VSWORD_MARKDOWN_DEFAULTS,
				'[plaintext]': VSWORD_PLAINTEXT_DEFAULTS,
				// Workbench-wide writer affordances.
				'breadcrumbs.enabled': false,
				// 浅色壳默认：必须等于 ThemeSettingDefaults.COLOR_THEME_LIGHT，
				// 才能在 ThemeService 构造时走 COLOR_THEME_LIGHT_INITIAL_COLORS（首帧防深色闪）。
				'workbench.colorTheme': ThemeSettingDefaults.COLOR_THEME_LIGHT,
				// Auto-reveal the Outline (Markdown headings tree) when the user
				// opens a doc — Markdown's natural navigator.
				'outline.collapseItems': 'alwaysExpand',
				// Window title: drop ${activeEditorShort} from the default template
				// so the OS title bar shows workspace + app only — the editor tab
				// already shows the filename. Avoids the duplicate-title perception
				// where the filename reads twice (tab + title bar).
				'window.title': '${dirty}${rootName}${separator}${appName}',
			}
		}
	]);

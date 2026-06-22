/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';

/**
 * VSWord writer-mode defaults for Markdown and plaintext editing.
 *
 * Registered as default configuration overrides so the user can still change
 * them in their settings.json — we only shift the *default* baseline so that
 * opening a `.md` file feels like a writing tool out of the box.
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
	// Wider gutter rendering off — render breadcrumb-free document.
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
				// Workbench-wide writer affordances. These are mild defaults —
				// hide breadcrumbs and reduce activity bar visual clutter so a
				// fresh launch reads as a writing app, not an IDE.
				'breadcrumbs.enabled': false,
				'workbench.editor.showTabs': 'single',
				'workbench.editor.tabSizing': 'fit',
			}
		}
	]);

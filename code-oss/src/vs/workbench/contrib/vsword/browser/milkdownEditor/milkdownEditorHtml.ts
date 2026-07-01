/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../../webview/common/webview.js';

interface MilkdownEditorHtmlOptions {
	readonly fileName: string;
	readonly resourceUri: string;
	readonly scriptUri: string;
	readonly cspSource?: string;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"]/g, ch => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
	}[ch] ?? ch));
}

export function getMilkdownEditorHtml(options: MilkdownEditorHtmlOptions): string {
	const fileName = escapeHtml(options.fileName);
	const resourceUri = escapeHtml(options.resourceUri);
	const scriptUri = escapeHtml(options.scriptUri);
	const cspSource = escapeHtml(options.cspSource ?? webviewGenericCspSource);

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${fileName}</title>
	<style>
		:root {
			color-scheme: light dark;
			--vsword-bg: var(--vscode-editor-background, #1e1e1e);
			--vsword-fg: var(--vscode-editor-foreground, #d4d4d4);
			--vsword-muted: var(--vscode-descriptionForeground, #8b949e);
			--vsword-border: var(--vscode-panel-border, #3c3c3c);
			--vsword-accent: var(--vscode-focusBorder, #007fd4);
			--vsword-error: var(--vscode-errorForeground, #f85149);
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			background: var(--vsword-bg);
			color: var(--vsword-fg);
			font-family: var(--vscode-font-family, system-ui, sans-serif);
		}
		.vsword-md-shell { min-height: 100vh; display: flex; flex-direction: column; }
		.vsword-md-toolbar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 7px 12px;
			border-bottom: 1px solid var(--vsword-border);
			font-size: 12px;
			background: color-mix(in srgb, var(--vsword-bg) 94%, var(--vsword-fg));
		}
		.vsword-md-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.vsword-md-resource { color: var(--vsword-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
		.vsword-md-status { color: var(--vsword-muted); }
		.vsword-md-status[data-kind="dirty"] { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
		.vsword-md-status[data-kind="error"] { color: var(--vsword-error); }
		.vsword-md-button {
			border: 1px solid var(--vsword-border);
			background: transparent;
			color: var(--vsword-fg);
			border-radius: 4px;
			padding: 3px 8px;
			font: inherit;
			cursor: pointer;
		}
		.vsword-md-button:hover { border-color: var(--vsword-accent); }
		#milkdown-root {
			flex: 1;
			min-height: 0;
			overflow: auto;
			padding: 42px max(24px, calc((100vw - 860px) / 2));
		}
		#milkdown-root .milkdown { min-height: calc(100vh - 110px); }
		#milkdown-root .ProseMirror {
			outline: none;
			font-family: var(--vscode-editor-font-family, ui-serif, Georgia, serif);
			font-size: 17px;
			line-height: 1.75;
			max-width: 860px;
			margin: 0 auto;
		}
		#milkdown-root .ProseMirror p { margin: 0.75em 0; }
		#milkdown-root .ProseMirror h1, #milkdown-root .ProseMirror h2, #milkdown-root .ProseMirror h3 { line-height: 1.25; }
		#milkdown-root .ProseMirror code { font-family: var(--vscode-editor-font-family, monospace); background: color-mix(in srgb, var(--vsword-bg) 82%, var(--vsword-fg)); padding: 0 0.25em; border-radius: 3px; }
		#milkdown-root .ProseMirror table { border-collapse: collapse; width: 100%; }
		#milkdown-root .ProseMirror th, #milkdown-root .ProseMirror td { border: 1px solid var(--vsword-border); padding: 4px 8px; }
		#milkdown-root .milkdown-empty {
			color: var(--vsword-muted);
			font-size: 13px;
		}
	</style>
</head>
<body>
	<div class="vsword-md-shell">
		<header class="vsword-md-toolbar">
			<span class="vsword-md-title">${fileName}</span>
			<span class="vsword-md-resource" title="${resourceUri}">${resourceUri}</span>
			<span id="milkdown-status" class="vsword-md-status">Loading…</span>
			<button id="milkdown-save" class="vsword-md-button" type="button">Save</button>
			<button id="milkdown-open-text" class="vsword-md-button" type="button">Open as Text</button>
		</header>
		<main id="milkdown-root" aria-label="Markdown WYSIWYG editor"><div class="milkdown-empty">Loading Milkdown…</div></main>
	</div>
	<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

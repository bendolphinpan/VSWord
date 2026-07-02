/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../../webview/common/webview.js';
import { getThemesCss } from './milkdownEditorThemes.js';

interface MilkdownEditorHtmlOptions {
	readonly fileName: string;
	readonly resourceUri: string;
	readonly scriptUri: string;
	readonly katexCssUri: string;
	/** T-3.5.1: webview URI of the .md file's parent dir; used as `<base href>` so
	 * relative image srcs written by the uploader (e.g. `assets/foo.png`) resolve
	 * against `localResourceRoots`. Existing script/CSS URIs are absolute so this
	 * only affects relative-path assets like inserted images. */
	readonly documentBaseUri: string;
	readonly cspSource?: string;
	readonly initialTheme?: string;
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
	const katexCssUri = escapeHtml(options.katexCssUri);
	const documentBaseUri = escapeHtml(options.documentBaseUri);
	const cspSource = escapeHtml(options.cspSource ?? webviewGenericCspSource);

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<base href="${documentBaseUri}">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${fileName}</title>
	<link rel="stylesheet" href="${katexCssUri}">
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
		/* T-3.3.2: three-mode segmented switcher (right of Save, flex-safe). */
		.vsword-md-mode-switch {
			display: inline-flex;
			border: 1px solid var(--vsword-border);
			border-radius: 4px;
			overflow: hidden;
			flex-shrink: 0;
			min-width: 0;
		}
		.vsword-md-mode-btn {
			border: 0;
			background: transparent;
			color: var(--vsword-fg);
			font: inherit;
			padding: 3px 10px;
			cursor: pointer;
			white-space: nowrap;
			border-left: 1px solid var(--vsword-border);
		}
		.vsword-md-mode-btn:first-child { border-left: 0; }
		.vsword-md-mode-btn:hover { background: color-mix(in srgb, var(--vsword-fg) 8%, transparent); }
		.vsword-md-mode-btn[aria-pressed="true"] {
			background: var(--vsword-accent);
			color: var(--vscode-button-foreground, #fff);
		}
		#milkdown-root {
			flex: 1;
			min-height: 0;
			overflow: auto;
			padding-top: 42px;
			padding-bottom: 42px;
		}
		/* T-3.3.2: source-mode textarea shares padding & max-width with the WYSIWYG surface. */
		#milkdown-source {
			display: none;
			flex: 1;
			min-height: 0;
			width: 100%;
			resize: none;
			border: 0;
			outline: none;
			background: var(--vsword-bg);
			color: var(--vsword-fg);
			font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Menlo, monospace);
			font-size: 14px;
			line-height: 1.55;
			padding-top: 42px;
			padding-bottom: 42px;
			tab-size: 4;
		}
		.vsword-md-shell[data-mode="source"] #milkdown-root { display: none; }
		.vsword-md-shell[data-mode="source"] #milkdown-source { display: block; }
		/* Reading mode (Q2=a+c): keep layout, dim non-active paragraphs + typewriter re-centering. */
		.vsword-md-shell[data-mode="reading"] #milkdown-root .ProseMirror { caret-color: transparent; }
		.vsword-md-shell[data-mode="reading"] .vsword-slash-menu { display: none !important; }
		.vsword-md-shell[data-mode="reading"] #milkdown-root .ProseMirror > * { transition: opacity 180ms ease; opacity: 0.35; }
		.vsword-md-shell[data-mode="reading"] #milkdown-root .ProseMirror > .vsword-focus-active { opacity: 1; }
		/* Edit-context visual feedback (Q2=b): left bar + tinted background on the block containing the cursor. */
		#milkdown-root .ProseMirror .vsword-edit-context {
			position: relative;
			background: color-mix(in srgb, var(--vsword-accent) 6%, transparent);
			border-radius: 4px;
			transition: background 120ms ease;
		}
		#milkdown-root .ProseMirror .vsword-edit-context::before {
			content: "";
			position: absolute;
			left: -12px;
			top: 4px;
			bottom: 4px;
			width: 3px;
			border-radius: 2px;
			background: var(--vsword-accent);
		}
		/* HTML block dual-view: raw-source pane when the cursor is inside, rendered otherwise. */
		#milkdown-root .ProseMirror .vsword-html-block {
			border: 1px solid var(--vsword-border);
			border-radius: 4px;
			padding: 8px 12px;
			margin: 0.75em 0;
			background: color-mix(in srgb, var(--vsword-bg) 92%, var(--vsword-fg));
		}
		#milkdown-root .ProseMirror .vsword-html-block[data-view="source"] {
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 14px;
			white-space: pre-wrap;
			color: var(--vscode-editor-foreground);
		}
		#milkdown-root .ProseMirror .vsword-html-block[data-view="rendered"] * { pointer-events: none; }
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
		#milkdown-root .ProseMirror pre {
			background: color-mix(in srgb, var(--vsword-bg) 88%, var(--vsword-fg));
			border: 1px solid var(--vsword-border);
			border-radius: 6px;
			padding: 12px 16px;
			overflow-x: auto;
			font-family: var(--vscode-editor-font-family, ui-monospace, "Cascadia Code", Menlo, monospace);
			font-size: 14px;
			line-height: 1.55;
		}
		#milkdown-root .ProseMirror pre code { background: transparent; padding: 0; border-radius: 0; }
		/* T-3.3.5 Prism token colors — map to VS Code semantic token vars so we track editor theme. */
		#milkdown-root .ProseMirror .token.comment,
		#milkdown-root .ProseMirror .token.prolog,
		#milkdown-root .ProseMirror .token.doctype,
		#milkdown-root .ProseMirror .token.cdata { color: var(--vscode-editor-comment-foreground, #6a9955); font-style: italic; }
		#milkdown-root .ProseMirror .token.punctuation { color: var(--vscode-editor-foreground, #d4d4d4); }
		#milkdown-root .ProseMirror .token.property,
		#milkdown-root .ProseMirror .token.tag,
		#milkdown-root .ProseMirror .token.boolean,
		#milkdown-root .ProseMirror .token.number,
		#milkdown-root .ProseMirror .token.constant,
		#milkdown-root .ProseMirror .token.symbol,
		#milkdown-root .ProseMirror .token.deleted { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
		#milkdown-root .ProseMirror .token.selector,
		#milkdown-root .ProseMirror .token.attr-name,
		#milkdown-root .ProseMirror .token.string,
		#milkdown-root .ProseMirror .token.char,
		#milkdown-root .ProseMirror .token.builtin,
		#milkdown-root .ProseMirror .token.inserted { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
		#milkdown-root .ProseMirror .token.operator,
		#milkdown-root .ProseMirror .token.entity,
		#milkdown-root .ProseMirror .token.url,
		#milkdown-root .ProseMirror .token.variable { color: var(--vscode-symbolIcon-variableForeground, #9cdcfe); }
		#milkdown-root .ProseMirror .token.atrule,
		#milkdown-root .ProseMirror .token.attr-value,
		#milkdown-root .ProseMirror .token.keyword { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); font-weight: 600; }
		#milkdown-root .ProseMirror .token.function,
		#milkdown-root .ProseMirror .token.class-name { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
		#milkdown-root .ProseMirror .token.regex,
		#milkdown-root .ProseMirror .token.important { color: var(--vscode-symbolIcon-eventForeground, #d16969); }
		#milkdown-root .ProseMirror .token.important,
		#milkdown-root .ProseMirror .token.bold { font-weight: 700; }
		#milkdown-root .ProseMirror .token.italic { font-style: italic; }
		/* T-3.3.4 KaTeX math nodes — inline stays inline, block gets a centered strip. */
		#milkdown-root .ProseMirror span[data-type="math_inline"] { padding: 0 0.15em; }
		#milkdown-root .ProseMirror div[data-type="math_block"] {
			display: block;
			text-align: center;
			margin: 1em 0;
			padding: 0.5em 0;
			overflow-x: auto;
		}
		#milkdown-root .ProseMirror .katex-display { margin: 0; }
		/* T-3.3.3 Slash menu — floating grouped command palette (Q2=b). */
		.vsword-slash-menu {
			position: absolute;
			z-index: 1000;
			min-width: 220px;
			max-height: 320px;
			overflow-y: auto;
			padding: 4px 0;
			background: var(--vscode-menu-background, var(--vsword-bg));
			color: var(--vscode-menu-foreground, var(--vsword-fg));
			border: 1px solid var(--vscode-menu-border, var(--vsword-border));
			border-radius: 6px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}
		.vsword-slash-menu[hidden], .vsword-slash-menu[data-hidden="true"] { display: none; }
		.vsword-slash-group {
			padding: 6px 12px 2px;
			font-size: 10px;
			font-weight: 600;
			letter-spacing: 0.08em;
			color: var(--vscode-descriptionForeground, #888);
			text-transform: uppercase;
		}
		.vsword-slash-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			padding: 6px 12px;
			cursor: pointer;
		}
		.vsword-slash-item.active,
		.vsword-slash-item:hover { background: var(--vscode-menu-selectionBackground, rgba(120, 120, 120, 0.24)); color: var(--vscode-menu-selectionForeground, inherit); }
		.vsword-slash-label { flex: 1 1 auto; }
		.vsword-slash-hint { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; color: var(--vscode-descriptionForeground, #888); opacity: 0.85; }
		.vsword-slash-empty { padding: 8px 12px; color: var(--vscode-descriptionForeground, #888); font-style: italic; }
		#milkdown-root .ProseMirror table { border-collapse: collapse; width: 100%; }
		#milkdown-root .ProseMirror th, #milkdown-root .ProseMirror td { border: 1px solid var(--vsword-border); padding: 4px 8px; }
		#milkdown-root .milkdown-empty {
			color: var(--vsword-muted);
			font-size: 13px;
		}
		/* T-3.5.2: image resize NodeView. Chrome only when the wrap is hovered
		 * or selected — Q7=a. Handles are 8 tiny squares at the wrapper corners
		 * and edge midpoints; n/s ones are inert under aspect lock but shown
		 * for visual completeness. */
		.vsword-img-wrap {
			position: relative;
			display: inline-block;
			max-width: 100%;
			line-height: 0;
		}
		.vsword-img-wrap img { max-width: 100%; display: block; }
		.vsword-img-wrap[data-resizing="true"] { user-select: none; }
		.vsword-img-wrap[data-selected="true"] { outline: 1px solid var(--vsword-accent); outline-offset: 2px; }
		.vsword-img-handle {
			position: absolute;
			width: 8px;
			height: 8px;
			background: var(--vsword-accent);
			border: 1px solid var(--vsword-bg);
			opacity: 0;
			pointer-events: none;
			transition: opacity 80ms ease;
		}
		.vsword-img-wrap:hover .vsword-img-handle,
		.vsword-img-wrap[data-selected="true"] .vsword-img-handle,
		.vsword-img-wrap[data-resizing="true"] .vsword-img-handle {
			opacity: 1;
			pointer-events: auto;
		}
		.vsword-img-handle[data-handle="nw"] { top: -4px;    left: -4px;    cursor: nwse-resize; }
		.vsword-img-handle[data-handle="n"]  { top: -4px;    left: 50%;     transform: translateX(-50%); cursor: ns-resize; }
		.vsword-img-handle[data-handle="ne"] { top: -4px;    right: -4px;   cursor: nesw-resize; }
		.vsword-img-handle[data-handle="e"]  { top: 50%;     right: -4px;   transform: translateY(-50%); cursor: ew-resize; }
		.vsword-img-handle[data-handle="se"] { bottom: -4px; right: -4px;   cursor: nwse-resize; }
		.vsword-img-handle[data-handle="s"]  { bottom: -4px; left: 50%;     transform: translateX(-50%); cursor: ns-resize; }
		.vsword-img-handle[data-handle="sw"] { bottom: -4px; left: -4px;    cursor: nesw-resize; }
		.vsword-img-handle[data-handle="w"]  { top: 50%;     left: -4px;    transform: translateY(-50%); cursor: ew-resize; }
		/* T-3.5.3: caption (alt-as-caption) + inline "改文字" editor.
		 * The caption itself is ALWAYS visible whenever alt is non-empty
		 * (Q2=a) — that's the reader view. The edit button and popover only
		 * surface on hover / selection, same rules as resize handles. */
		.vsword-img-caption {
			display: none;
			text-align: center;
			font-size: 0.9em;
			line-height: 1.4;
			color: var(--vsword-muted);
			margin-top: 4px;
			padding: 0 8px;
			word-break: break-word;
			white-space: normal;
		}
		.vsword-img-wrap[data-has-caption="true"] .vsword-img-caption { display: block; }
		.vsword-img-edit-alt {
			position: absolute;
			right: 0;
			bottom: -22px;
			padding: 1px 8px;
			font: inherit;
			font-size: 11px;
			line-height: 16px;
			color: var(--vsword-bg);
			background: var(--vsword-accent);
			border: none;
			border-radius: 3px;
			cursor: pointer;
			opacity: 0;
			pointer-events: none;
			transition: opacity 80ms ease;
		}
		.vsword-img-wrap:hover .vsword-img-edit-alt,
		.vsword-img-wrap[data-selected="true"] .vsword-img-edit-alt {
			opacity: 1;
			pointer-events: auto;
		}
		.vsword-img-alt-popover {
			position: absolute;
			left: 50%;
			top: calc(100% + 4px);
			transform: translateX(-50%);
			display: flex;
			gap: 4px;
			padding: 4px 6px;
			background: var(--vsword-bg);
			border: 1px solid var(--vsword-border);
			border-radius: 4px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.15);
			z-index: 20;
			white-space: nowrap;
		}
		.vsword-img-alt-input {
			min-width: 200px;
			padding: 2px 6px;
			font: inherit;
			font-size: 13px;
			color: var(--vsword-fg);
			background: var(--vsword-bg);
			border: 1px solid var(--vsword-border);
			border-radius: 3px;
			outline: none;
		}
		.vsword-img-alt-input:focus { border-color: var(--vsword-accent); }
		.vsword-img-alt-save {
			padding: 2px 10px;
			font: inherit;
			font-size: 12px;
			color: var(--vsword-bg);
			background: var(--vsword-accent);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		}
		${getThemesCss()}
	</style>
</head>
<body data-theme="${escapeHtml(options.initialTheme ?? 'default')}">
	<div class="vsword-md-shell" data-mode="realtime">
		<header class="vsword-md-toolbar">
			<span class="vsword-md-title">${fileName}</span>
			<span class="vsword-md-resource" title="${resourceUri}">${resourceUri}</span>
			<span id="milkdown-status" class="vsword-md-status">Loading…</span>
			<button id="milkdown-save" class="vsword-md-button" type="button">Save</button>
			<div id="milkdown-mode-switch" class="vsword-md-mode-switch" role="group" aria-label="Editor mode">
				<button class="vsword-md-mode-btn" data-mode="realtime" type="button" aria-pressed="true">实时渲染</button>
				<button class="vsword-md-mode-btn" data-mode="reading" type="button" aria-pressed="false">阅读模式</button>
				<button class="vsword-md-mode-btn" data-mode="source" type="button" aria-pressed="false">源码模式</button>
			</div>
		</header>
		<main id="milkdown-root" aria-label="Markdown WYSIWYG editor"><div class="milkdown-empty">Loading Milkdown…</div></main>
		<textarea id="milkdown-source" spellcheck="false" aria-label="Markdown source editor"></textarea>
	</div>
	<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

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
		/* Reading mode: hide caret + slash menu, otherwise keeps layout. */
		.vsword-md-shell[data-mode="reading"] #milkdown-root .ProseMirror { caret-color: transparent; }
		.vsword-md-shell[data-mode="reading"] .vsword-slash-menu { display: none !important; }
		/* T-3.10 Q1=a: focus dimming — active when EITHER reading mode or explicit focus toggle. */
		.vsword-md-shell[data-mode="reading"] #milkdown-root .ProseMirror > *,
		.vsword-md-shell[data-focus="on"] #milkdown-root .ProseMirror > * {
			transition: opacity 180ms ease;
			opacity: 0.35;
		}
		.vsword-md-shell[data-mode="reading"] #milkdown-root .ProseMirror > .vsword-focus-active,
		.vsword-md-shell[data-focus="on"] #milkdown-root .ProseMirror > .vsword-focus-active {
			opacity: 1;
		}
		/* T-3.10: toggle buttons live to the right of the mode switch and share styling. */
		.vsword-md-toggle-group {
			display: inline-flex;
			margin-left: 6px;
			border: 1px solid var(--vsword-border);
			border-radius: 4px;
			overflow: hidden;
			flex-shrink: 0;
		}
		.vsword-md-toggle-btn {
			border: 0;
			background: transparent;
			color: var(--vsword-fg);
			font: inherit;
			padding: 3px 10px;
			cursor: pointer;
			white-space: nowrap;
			border-left: 1px solid var(--vsword-border);
		}
		.vsword-md-toggle-btn:first-child { border-left: 0; }
		.vsword-md-toggle-btn:hover:not([disabled]) { background: color-mix(in srgb, var(--vsword-fg) 8%, transparent); }
		.vsword-md-toggle-btn[aria-pressed="true"] {
			background: var(--vsword-accent);
			color: var(--vscode-button-foreground, #fff);
		}
		.vsword-md-toggle-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
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
		/* T-3.5.4: align. wrap defaults inline-block so it flows with prose;
		 * center/right promote it to block so margin-auto can position the
		 * image. Left is treated as the default = no positioning. */
		.vsword-img-wrap[data-align="center"] {
			display: block;
			margin-inline: auto;
			text-align: center;
		}
		.vsword-img-wrap[data-align="right"] {
			display: block;
			margin-inline-start: auto;
			margin-inline-end: 0;
			text-align: right;
		}
		.vsword-img-wrap[data-align="left"] {
			/* Inherits inline-block flow; no override so it stays with text. */
		}
		.vsword-img-align-bar {
			position: absolute;
			left: 0;
			bottom: -22px;
			display: inline-flex;
			gap: 2px;
			opacity: 0;
			pointer-events: none;
			transition: opacity 80ms ease;
			z-index: 3;
		}
		.vsword-img-wrap:hover .vsword-img-align-bar,
		.vsword-img-wrap[data-selected="true"] .vsword-img-align-bar {
			opacity: 1;
			pointer-events: auto;
		}
		.vsword-img-align-btn {
			padding: 1px 8px;
			font: inherit;
			font-size: 11px;
			line-height: 16px;
			color: var(--vsword-fg);
			background: var(--vsword-bg);
			border: 1px solid var(--vsword-border);
			border-radius: 3px;
			cursor: pointer;
		}
		.vsword-img-align-btn:hover { border-color: var(--vsword-accent); }
		.vsword-img-align-btn[data-active="true"] {
			color: var(--vsword-bg);
			background: var(--vsword-accent);
			border-color: var(--vsword-accent);
		}

		/* ---- T-3.6 Table chrome ------------------------------------------------
		   The `.vsword-table-wrap` is a $view NodeView wrapping the native <table>
		   with sibling chrome containers (corner / col-bar / row-bar). Chrome is
		   hidden by default and revealed on hover or when the caret is inside the
		   table. Layout uses grid: the wrap sits inline-block so col-bar can be
		   absolutely positioned above the table and row-bar to its left. Column
		   resize is a separate concern (columnResizingPlugin) — this only styles
		   the resize handle so it's discoverable.  */
		.vsword-table-wrap {
			position: relative;
			display: inline-block;
			max-width: 100%;
			margin: 12px 0;
			padding: 24px 0 0 32px;      /* Reserve space for row-bar + col-bar. */
		}
		.vsword-table {
			border-collapse: collapse;
			table-layout: fixed;
		}
		.vsword-table td, .vsword-table th {
			border: 1px solid var(--vsword-border, #d0d0d0);
			padding: 4px 8px;
			vertical-align: top;
			position: relative;
		}
		.vsword-table th { background: var(--vsword-muted-bg, rgba(0,0,0,0.04)); font-weight: 600; }
		.vsword-table td[data-alignment="center"], .vsword-table th[data-alignment="center"] { text-align: center; }
		.vsword-table td[data-alignment="right"],  .vsword-table th[data-alignment="right"]  { text-align: right;  }

		.vsword-table-corner,
		.vsword-table-col-bar,
		.vsword-table-row-bar {
			position: absolute;
			opacity: 0;
			pointer-events: none;
			transition: opacity 120ms ease;
		}
		.vsword-table-wrap:hover .vsword-table-corner,
		.vsword-table-wrap:hover .vsword-table-col-bar,
		.vsword-table-wrap:hover .vsword-table-row-bar,
		.vsword-table-wrap:focus-within .vsword-table-corner,
		.vsword-table-wrap:focus-within .vsword-table-col-bar,
		.vsword-table-wrap:focus-within .vsword-table-row-bar {
			opacity: 1;
			pointer-events: auto;
		}

		.vsword-table-corner {
			top: 0; left: 0;
			width: 28px; height: 20px;
			display: flex; align-items: center; justify-content: center;
		}
		.vsword-table-corner-btn {
			all: unset;
			width: 20px; height: 18px;
			display: inline-flex; align-items: center; justify-content: center;
			font: inherit; font-size: 14px; line-height: 1;
			color: var(--vsword-fg, #333);
			background: var(--vsword-bg, #fff);
			border: 1px solid var(--vsword-border, #ccc);
			border-radius: 3px;
			cursor: pointer;
		}
		.vsword-table-corner-btn:hover { border-color: var(--vsword-accent, #007acc); }
		.vsword-table-corner-pop {
			display: none;
			position: absolute;
			top: 22px; left: 0;
			padding: 4px;
			background: var(--vsword-bg, #fff);
			border: 1px solid var(--vsword-border, #ccc);
			border-radius: 4px;
			box-shadow: 0 2px 6px rgba(0,0,0,0.15);
			z-index: 3;
		}
		.vsword-table-corner[data-open="true"] .vsword-table-corner-pop { display: flex; }

		.vsword-table-col-bar {
			top: 0; left: 32px; right: 0;
			height: 20px;
			display: grid;
			grid-auto-flow: column;
			grid-auto-columns: 1fr;
			gap: 0;
		}
		.vsword-table-row-bar {
			top: 24px; left: 0;
			width: 28px; bottom: 0;
			display: grid;
			grid-auto-flow: row;
			grid-auto-rows: 1fr;
			gap: 0;
		}
		.vsword-table-col-menu,
		.vsword-table-row-menu {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 2px;
		}
		.vsword-table-col-menu {
			flex-direction: column;
		}
		.vsword-table-btn-group {
			display: inline-flex;
			gap: 1px;
			background: var(--vsword-bg, #fff);
			border: 1px solid var(--vsword-border, #ccc);
			border-radius: 3px;
			padding: 1px;
		}
		.vsword-table-col-menu .vsword-table-btn-group {
			/* Col bar sits above the header row; group is small + horizontal. */
		}
		.vsword-table-align-group {
			margin-top: 2px;
		}
		.vsword-table-btn {
			all: unset;
			min-width: 20px;
			padding: 1px 5px;
			font: inherit; font-size: 11px; line-height: 1.3;
			color: var(--vsword-fg, #333);
			background: transparent;
			border-radius: 2px;
			cursor: pointer;
			text-align: center;
		}
		.vsword-table-btn:hover { background: var(--vsword-muted-bg, rgba(0,0,0,0.06)); }
		.vsword-table-btn[data-active="true"] {
			color: var(--vsword-bg, #fff);
			background: var(--vsword-accent, #007acc);
		}

		/* Column-resize handle from preset-gfm's columnResizingPlugin.
		   Draw a subtle vertical bar on the right edge; brighten on hover/drag. */
		.vsword-table .column-resize-handle {
			position: absolute;
			right: -2px;
			top: 0;
			bottom: 0;
			width: 4px;
			background: transparent;
			cursor: col-resize;
			z-index: 2;
		}
		.vsword-table-wrap:hover .vsword-table .column-resize-handle:hover,
		.vsword-table .column-resize-handle.dragging {
			background: var(--vsword-accent, #007acc);
			opacity: 0.6;
		}
		.ProseMirror.resize-cursor { cursor: col-resize; }

		/* ---- T-3.7 Code block chrome ------------------------------------------------ */
		.vsword-code-wrap {
			position: relative;
			margin: 12px 0;
		}
		.vsword-code-wrap .vsword-code-pre {
			margin: 0;
			padding: 12px 16px;
			background: var(--vsword-code-bg, #1e1e1e);
			color: var(--vsword-code-fg, #d4d4d4);
			border-radius: 4px;
			overflow-x: auto;
			font-family: var(--vsword-code-font, 'Cascadia Code', 'Consolas', monospace);
			font-size: 13px;
			line-height: 1.5;
			white-space: pre;
			tab-size: 4;
		}
		.vsword-code-wrap .vsword-code-pre code {
			background: transparent;
			padding: 0;
			font-family: inherit;
			font-size: inherit;
			color: inherit;
			white-space: inherit;
		}
		.vsword-code-chrome {
			position: absolute;
			top: 6px;
			right: 6px;
			display: none;
			gap: 4px;
			z-index: 4;
		}
		.vsword-code-wrap:hover > .vsword-code-chrome,
		.vsword-code-chrome:focus-within {
			display: flex;
		}
		.vsword-code-lang-btn,
		.vsword-code-copy-btn {
			font-size: 11px;
			padding: 2px 8px;
			background: rgba(255,255,255,0.08);
			color: var(--vsword-code-fg, #d4d4d4);
			border: 1px solid rgba(255,255,255,0.15);
			border-radius: 3px;
			cursor: pointer;
			font-family: inherit;
			line-height: 1.4;
			user-select: none;
		}
		.vsword-code-lang-btn:hover,
		.vsword-code-copy-btn:hover {
			background: rgba(255,255,255,0.15);
			border-color: rgba(255,255,255,0.3);
		}
		.vsword-code-copy-btn[data-state="ok"] {
			background: rgba(80,180,80,0.25);
			border-color: rgba(80,180,80,0.5);
		}
		.vsword-code-copy-btn[data-state="error"] {
			background: rgba(220,80,80,0.25);
			border-color: rgba(220,80,80,0.5);
		}
		.vsword-code-lang-pop {
			position: absolute;
			top: 100%;
			right: 0;
			margin-top: 4px;
			width: 220px;
			max-height: 300px;
			display: flex;
			flex-direction: column;
			background: var(--vsword-bg, #1e1e1e);
			color: var(--vsword-fg, #d4d4d4);
			border: 1px solid rgba(255,255,255,0.2);
			border-radius: 4px;
			box-shadow: 0 4px 16px rgba(0,0,0,0.4);
			z-index: 20;
		}
		.vsword-code-lang-input {
			flex: 0 0 auto;
			margin: 4px;
			padding: 4px 8px;
			background: rgba(255,255,255,0.05);
			color: inherit;
			border: 1px solid rgba(255,255,255,0.15);
			border-radius: 3px;
			font-family: inherit;
			font-size: 12px;
			outline: none;
		}
		.vsword-code-lang-input:focus {
			border-color: var(--vsword-accent, #4090f0);
		}
		.vsword-code-lang-list {
			flex: 1 1 auto;
			overflow-y: auto;
			padding: 2px 0;
		}
		.vsword-code-lang-item {
			padding: 4px 12px;
			font-size: 12px;
			cursor: pointer;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.vsword-code-lang-item:hover,
		.vsword-code-lang-item[data-highlight="true"] {
			background: rgba(255,255,255,0.1);
		}
		.vsword-code-lang-item[data-current="true"] {
			font-weight: 600;
			color: var(--vsword-accent, #4090f0);
		}

		/* Prism token colors — VS Code dark defaults. */
		.vsword-code-pre .token.comment,
		.vsword-code-pre .token.prolog,
		.vsword-code-pre .token.doctype,
		.vsword-code-pre .token.cdata { color: #6a9955; font-style: italic; }
		.vsword-code-pre .token.punctuation { color: #d4d4d4; }
		.vsword-code-pre .token.property,
		.vsword-code-pre .token.tag,
		.vsword-code-pre .token.boolean,
		.vsword-code-pre .token.number,
		.vsword-code-pre .token.constant,
		.vsword-code-pre .token.symbol,
		.vsword-code-pre .token.deleted { color: #b5cea8; }
		.vsword-code-pre .token.selector,
		.vsword-code-pre .token.attr-name,
		.vsword-code-pre .token.string,
		.vsword-code-pre .token.char,
		.vsword-code-pre .token.builtin,
		.vsword-code-pre .token.inserted { color: #ce9178; }
		.vsword-code-pre .token.operator,
		.vsword-code-pre .token.entity,
		.vsword-code-pre .token.url,
		.vsword-code-pre .token.variable { color: #d4d4d4; }
		.vsword-code-pre .token.atrule,
		.vsword-code-pre .token.attr-value,
		.vsword-code-pre .token.function,
		.vsword-code-pre .token.class-name { color: #dcdcaa; }
		.vsword-code-pre .token.keyword { color: #569cd6; }
		.vsword-code-pre .token.regex,
		.vsword-code-pre .token.important { color: #d16969; }
		.vsword-code-pre .token.bold { font-weight: bold; }
		.vsword-code-pre .token.italic { font-style: italic; }

		/* ==== T-3.8: block hover handle ==== */
		.vsword-block-handle {
			position: absolute;
			z-index: 20;
			width: 20px;
			height: 22px;
			padding: 0;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: transparent;
			border: 0;
			border-radius: 4px;
			color: var(--vscode-descriptionForeground, #888);
			font-size: 13px;
			line-height: 1;
			cursor: grab;
			opacity: 0;
			transition: opacity 0.12s ease, background 0.12s ease;
			user-select: none;
		}
		.vsword-block-handle:hover { background: var(--vscode-toolbar-hoverBackground, rgba(120,120,120,0.15)); opacity: 1; }
		.vsword-block-handle:active { cursor: grabbing; }
		.vsword-block-handle[data-show="true"], #milkdown-root:hover .vsword-block-handle { opacity: 0.7; }
		.vsword-block-handle > span { display: inline-block; letter-spacing: -2px; }

		.vsword-block-menu {
			position: absolute;
			z-index: 40;
			min-width: 220px;
			padding: 6px 0;
			background: var(--vscode-menu-background, #252526);
			color: var(--vscode-menu-foreground, #cccccc);
			border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, #454545));
			border-radius: 6px;
			box-shadow: 0 6px 20px rgba(0,0,0,0.35);
			font-size: 13px;
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
		}
		.vsword-block-menu-title {
			padding: 4px 12px 6px;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground, #888);
		}
		.vsword-block-menu-group { display: flex; flex-direction: column; }
		.vsword-block-menu-group-label {
			padding: 4px 12px 2px;
			font-size: 10px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground, #888);
			opacity: 0.75;
		}
		.vsword-block-menu-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 4px 12px;
			cursor: pointer;
			gap: 12px;
		}
		.vsword-block-menu-row.is-active,
		.vsword-block-menu-row:hover:not(.is-disabled) {
			background: var(--vscode-menu-selectionBackground, rgba(120,120,120,0.24));
			color: var(--vscode-menu-selectionForeground, inherit);
		}
		.vsword-block-menu-row.is-disabled { opacity: 0.4; cursor: default; }
		.vsword-block-menu-label { flex: 1 1 auto; }
		.vsword-block-menu-shortcut {
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #888);
			opacity: 0.85;
		}
		.vsword-block-menu-divider {
			height: 1px;
			margin: 4px 0;
			background: var(--vscode-menu-separatorBackground, rgba(120,120,120,0.25));
		}
		/* Reading mode: no handles, no menus. */
		.vsword-md-shell[data-mode="reading"] .vsword-block-handle,
		.vsword-md-shell[data-mode="reading"] .vsword-block-menu { display: none !important; }

		/* ==== T-3.9: math NodeView edit chrome ==== */
		.vsword-math-block {
			display: block;
			margin: 1em 0;
			border-radius: 6px;
			transition: background 0.12s ease;
		}
		.vsword-math-block:hover:not(.is-editing) { background: var(--vscode-editor-hoverHighlightBackground, rgba(120,120,120,0.06)); }
		.vsword-math-block.is-editing { background: var(--vscode-editor-background, transparent); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc); }
		.vsword-math-block.has-error:not(.is-editing) { box-shadow: 0 0 0 1px #cc0000; }
		.vsword-math-block.is-selected { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 2px; }
		.vsword-math-preview {
			display: block;
			text-align: center;
			padding: 0.5em 0;
			overflow-x: auto;
			cursor: text;
		}
		.vsword-math-editor {
			display: block;
			padding: 6px 8px 8px;
			border-top: 1px dashed var(--vscode-widget-border, rgba(120,120,120,0.3));
		}
		.vsword-math-source {
			display: block;
			width: 100%;
			min-height: 44px;
			padding: 6px 8px;
			background: var(--vscode-input-background, #1e1e1e);
			color: var(--vscode-input-foreground, #cccccc);
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: 4px;
			font-family: var(--vscode-editor-font-family, ui-monospace, "SF Mono", Consolas, monospace);
			font-size: var(--vscode-editor-font-size, 13px);
			line-height: 1.5;
			resize: vertical;
			outline: none;
		}
		.vsword-math-source:focus { border-color: var(--vscode-focusBorder, #007acc); }
		.vsword-math-error {
			margin-top: 4px;
			padding: 4px 8px;
			background: rgba(204, 0, 0, 0.08);
			color: #cc4040;
			font-size: 12px;
			font-family: var(--vscode-editor-font-family, monospace);
			border-radius: 3px;
			white-space: pre-wrap;
		}
		.vsword-math-placeholder {
			color: var(--vscode-descriptionForeground, #888);
			font-style: italic;
			font-size: 13px;
		}

		.vsword-math-inline {
			display: inline;
			border-radius: 3px;
			padding: 0 2px;
			cursor: text;
			transition: background 0.12s ease;
		}
		.vsword-math-inline:hover:not(.is-editing) { background: var(--vscode-editor-hoverHighlightBackground, rgba(120,120,120,0.06)); }
		.vsword-math-inline.is-editing { background: var(--vscode-input-background, #1e1e1e); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc); }
		.vsword-math-inline.has-error:not(.is-editing) { box-shadow: 0 0 0 1px #cc0000; }
		.vsword-math-inline.is-selected { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 1px; }
		.vsword-math-inline-preview { display: inline; }
		.vsword-math-inline-source {
			display: inline-block;
			min-width: 4ch;
			padding: 0 4px;
			background: transparent;
			color: var(--vscode-input-foreground, #cccccc);
			border: 0;
			outline: none;
			font-family: var(--vscode-editor-font-family, ui-monospace, "SF Mono", Consolas, monospace);
			font-size: inherit;
			line-height: inherit;
		}
		.vsword-md-shell[data-mode="reading"] .vsword-math-editor,
		.vsword-md-shell[data-mode="reading"] .vsword-math-inline-source { display: none !important; }
		.vsword-md-shell[data-mode="reading"] .vsword-math-block,
		.vsword-md-shell[data-mode="reading"] .vsword-math-inline { cursor: default; box-shadow: none; }

		/* T-3.11.1 · wiki-link inline atoms */
		.vsword-wikilink {
			color: var(--vscode-textLink-foreground, #7267ef);
			text-decoration: none;
			border-bottom: 1px dashed currentColor;
			padding: 0 1px;
			border-radius: 2px;
			cursor: pointer;
			transition: background-color 90ms ease, color 90ms ease;
		}
		.vsword-wikilink:hover { background: var(--vscode-textLink-activeForeground, #7267ef22); text-decoration: none; }
		.vsword-wikilink.vsword-wikilink-pending { color: var(--vscode-descriptionForeground, #888); border-bottom-style: dotted; }
		.vsword-wikilink.vsword-wikilink-missing { color: #cc0000; border-bottom-color: #cc0000; }
		.vsword-wikilink.vsword-wikilink-missing::after {
			content: " ✎";
			font-size: 0.85em;
			opacity: 0.7;
		}
		.vsword-wikilink.vsword-wikilink-ambiguous { color: #b58900; border-bottom-color: #b58900; }
		.vsword-wikilink.vsword-wikilink-ambiguous::after {
			content: " ⚠";
			font-size: 0.85em;
			margin-left: 1px;
		}
		.vsword-wikilink.vsword-wikilink-selected { outline: 1px solid var(--vscode-focusBorder, #007acc); outline-offset: 1px; }
		.vsword-md-shell[data-mode="reading"] .vsword-wikilink { cursor: pointer; }

		/* T-3.11.2 · autocomplete popover */
		.vsword-wikilink-popover {
			position: fixed;
			z-index: 10000;
			min-width: 220px;
			max-width: 420px;
			max-height: 300px;
			overflow-y: auto;
			background: var(--vscode-editorSuggestWidget-background, #252526);
			color: var(--vscode-editorSuggestWidget-foreground, #cccccc);
			border: 1px solid var(--vscode-editorSuggestWidget-border, #454545);
			border-radius: 4px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
			font-size: 13px;
			padding: 2px 0;
		}
		.vsword-wikilink-popover-row {
			display: flex;
			align-items: baseline;
			gap: 8px;
			padding: 4px 10px;
			cursor: pointer;
			white-space: nowrap;
		}
		.vsword-wikilink-popover-row:hover {
			background: var(--vscode-editorSuggestWidget-focusHighlightForeground, #04395e33);
		}
		.vsword-wikilink-popover-row.is-selected {
			background: var(--vscode-editorSuggestWidget-selectedBackground, #062f4a);
			color: var(--vscode-editorSuggestWidget-selectedForeground, #ffffff);
		}
		.vsword-wikilink-popover-name {
			flex: 0 0 auto;
			font-weight: 500;
		}
		.vsword-wikilink-popover-path {
			flex: 1 1 auto;
			overflow: hidden;
			text-overflow: ellipsis;
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #999);
		}
		.vsword-wikilink-popover-empty {
			padding: 8px 10px;
			color: var(--vscode-descriptionForeground, #999);
			font-style: italic;
		}

		/* T-3.11.3 · hover preview popover */
		.vsword-wikilink-preview {
			position: fixed;
			z-index: 10000;
			min-width: 260px;
			max-width: 440px;
			background: var(--vscode-editorHoverWidget-background, #252526);
			color: var(--vscode-editorHoverWidget-foreground, #cccccc);
			border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
			border-radius: 4px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
			font-size: 13px;
			padding: 8px 12px;
			line-height: 1.45;
			pointer-events: auto;
		}
		.vsword-wikilink-preview-title {
			font-weight: 600;
			margin-bottom: 4px;
			word-break: break-word;
		}
		.vsword-wikilink-preview-body {
			white-space: pre-wrap;
			word-break: break-word;
			max-height: 220px;
			overflow: hidden;
			color: var(--vscode-descriptionForeground, #a0a0a0);
		}
		.vsword-wikilink-preview-body.is-loading { font-style: italic; opacity: 0.7; }
		.vsword-wikilink-preview-body.is-missing { color: var(--vscode-errorForeground, #f48771); font-style: italic; }
		.vsword-wikilink-preview-body.is-error   { color: var(--vscode-errorForeground, #f48771); font-style: italic; }
		.vsword-wikilink-preview-path {
			margin-top: 6px;
			font-size: 11px;
			font-family: var(--vscode-editor-font-family, monospace);
			color: var(--vscode-descriptionForeground, #808080);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
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
			<div id="milkdown-toggle-group" class="vsword-md-toggle-group" role="group" aria-label="View toggles">
				<button class="vsword-md-toggle-btn" data-toggle="focus" type="button" aria-pressed="false" title="专注模式 (Ctrl+Shift+F)">☀ Focus</button>
				<button class="vsword-md-toggle-btn" data-toggle="typewriter" type="button" aria-pressed="false" title="打字机模式 (Ctrl+Shift+T)">⌨ Typewriter</button>
			</div>
		</header>
		<main id="milkdown-root" aria-label="Markdown WYSIWYG editor"><div class="milkdown-empty">Loading Milkdown…</div></main>
		<textarea id="milkdown-source" spellcheck="false" aria-label="Markdown source editor"></textarea>
	</div>
	<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

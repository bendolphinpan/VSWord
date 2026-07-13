/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../../webview/common/webview.js';
import {
	getThemesCss,
	VSWORD_MILKDOWN_DEFAULT_THEME,
	VSWORD_PAPER_THEME_COLORS,
} from './milkdownEditorThemes.js';

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
	/**
	 * 首帧防闪：与**文档主题**一致的绝对色（非 workbench editor 色）。
	 * 在 vscode 注入 --vscode-* 之前画 html/body 背景；首帧后由内联脚本卸掉，
	 * 避免 !important 卡住后续主题切换。
	 */
	readonly bootBackground?: string;
	readonly bootForeground?: string;
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
	// 绝对色兜底：产品默认 paper 浅色，**不用** workbench 深色 editor 色
	const bootBg = escapeHtml(options.bootBackground || VSWORD_PAPER_THEME_COLORS.bg);
	const bootFg = escapeHtml(options.bootForeground || VSWORD_PAPER_THEME_COLORS.fg);
	const initialTheme = escapeHtml(options.initialTheme ?? VSWORD_MILKDOWN_DEFAULT_THEME);

	return `<!doctype html>
<html lang="en" style="background:${bootBg};color:${bootFg}">
<head>
	<meta charset="UTF-8">
	<base href="${documentBaseUri}">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${fileName}</title>
	<!-- 首帧阻塞样式：必须在 katex 等外链 CSS 之前，避免白屏闪一下 -->
	<style id="vsword-boot-paint">
		html, body {
			margin: 0 !important;
			height: 100% !important;
			background: ${bootBg} !important;
			color: ${bootFg} !important;
		}
		.vsword-md-shell, #milkdown-root, .milkdown-empty {
			background: ${bootBg} !important;
			color: ${bootFg} !important;
		}
	</style>
	<link rel="stylesheet" href="${katexCssUri}">
	<style>
		:root {
			color-scheme: light dark;
			--vsword-bg: var(--vscode-editor-background, ${bootBg});
			--vsword-fg: var(--vscode-editor-foreground, ${bootFg});
			--vsword-muted: var(--vscode-descriptionForeground, #8b949e);
			--vsword-border: var(--vscode-panel-border, #3c3c3c);
			--vsword-accent: var(--vscode-focusBorder, #007fd4);
			--vsword-error: var(--vscode-errorForeground, #f85149);
		}
		* { box-sizing: border-box; }
		html, body {
			margin: 0;
			height: 100%;
			overflow: hidden; /* 只让 #milkdown-root 滚，避免双滚动条/底部灰横条 */
			background: var(--vsword-bg);
			color: var(--vsword-fg);
			font-family: var(--vscode-font-family, system-ui, sans-serif);
		}
		/* 彻底掐死横向滚动条（底部「灰胶囊」主因之一） */
		html, body, .vsword-md-shell, #milkdown-root, #milkdown-root .milkdown, #milkdown-root .ProseMirror {
			scrollbar-width: thin;
		}
		.vsword-md-shell {
			height: 100%;
			min-height: 0;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			overflow-x: hidden !important;
		}
		/* T-3.13.5: 顶部工具栏 sticky（纯色 · 视觉延后 · PRD §5a 决策 c）——
		 * 保证 mode-switch/substyle-group 始终置顶可见，不随文档滚走。
		 * 用纯色（color-mix bg 94% + fg）而非毛玻璃 —— 毛玻璃延后到最后 UI 布局阶段。
		 * z-index 100：高于 mode/substyle re-attach 时可能的短暂布局层，低于 slash-menu (1000)/find-widget 弹层。
		 * 前提：父链 body / .vsword-md-shell 均无 overflow: hidden|auto —— 已核对，OK。 */
		.vsword-md-toolbar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 7px 12px;
			border-bottom: 1px solid var(--vsword-border);
			font-size: 12px;
			background: color-mix(in srgb, var(--vsword-bg) 94%, var(--vsword-fg));
			position: sticky;
			top: 0;
			z-index: 100;
		}
		.vsword-md-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.vsword-md-resource { color: var(--vsword-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
		.vsword-md-status { color: var(--vsword-muted); }
		.vsword-md-status[data-kind="dirty"] { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
		.vsword-md-status[data-kind="error"] { color: var(--vsword-error); }
		/* RD-1.4 · 大文档按需加载显著提示（功能条 · 视觉延后只保可读） */
		#vsword-large-doc-banner {
			display: none;
			flex-shrink: 0;
			align-items: center;
			gap: 10px;
			padding: 6px 12px;
			font-size: 12px;
			line-height: 1.4;
			color: var(--vsword-fg);
			background: color-mix(in srgb, var(--vsword-accent) 12%, var(--vsword-bg));
			border-bottom: 1px solid var(--vsword-border);
		}
		#vsword-large-doc-banner[data-visible="true"] {
			display: flex;
		}
		#vsword-large-doc-banner .vsword-large-doc-msg {
			flex: 1;
			min-width: 0;
		}
		#vsword-large-doc-banner .vsword-md-button {
			flex-shrink: 0;
		}
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
			overflow-x: hidden !important;
			overflow-y: auto;
			/* typewriter 末行滚到 2/3：底部可滚空白 */
			padding-top: 42px;
			padding-bottom: min(45vh, 360px);
			/* 彻底禁用横向 scrollbar；纵向仅 hover 时淡显 */
			scrollbar-width: thin;
			scrollbar-color: transparent transparent;
		}
		#milkdown-root:hover {
			scrollbar-color: rgba(128, 128, 128, 0.35) transparent;
		}
		#milkdown-root::-webkit-scrollbar {
			width: 6px;
			height: 0 !important;
		}
		#milkdown-root::-webkit-scrollbar:horizontal,
		#milkdown-root::-webkit-scrollbar-corner {
			display: none !important;
			width: 0 !important;
			height: 0 !important;
		}
		#milkdown-root::-webkit-scrollbar-thumb {
			background: transparent;
			border-radius: 3px;
		}
		#milkdown-root:hover::-webkit-scrollbar-thumb:vertical {
			background: rgba(128, 128, 128, 0.35);
		}
		#milkdown-root .milkdown {
			min-height: 0;
			width: 100%;
			max-width: 100%;
			overflow-x: hidden;
		}
		#milkdown-root .ProseMirror {
			min-height: 0;
			outline: none;
			/* 预留左侧 edit-context 指示条空间，避免 left 负偏移撑出横向条 */
			padding-left: 16px;
			padding-right: 12px;
			overflow-x: hidden;
			overflow-wrap: anywhere;
			word-break: break-word;
		}
		#milkdown-root .ProseMirror-focused {
			caret-color: var(--vsword-fg, currentColor);
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
		/* T-3.10 + T-3.13.2: focus dimming — 只在 substyle=focus 时激活, 与 mode 解耦.
		   reading × normal / focus / typewriter 三档现在各自独立:
		     - reading × normal: 无 dim
		     - reading × focus:  走本条 dim 规则 (与 realtime × focus 一致)
		     - reading × typewriter: 无 dim + typewriter re-scroll (由 focus-mode plugin 处理) */
		.vsword-md-shell[data-substyle="focus"] #milkdown-root .ProseMirror > * {
			transition: opacity 180ms ease;
			opacity: 0.35;
		}
		.vsword-md-shell[data-substyle="focus"] #milkdown-root .ProseMirror > .vsword-focus-active {
			opacity: 1;
		}
		/* T-3.12.3.b: substyle radiogroup (normal | focus | typewriter, 三选一互斥) 复用一级 mode-switch 视觉规则. */
		.vsword-md-substyle-group {
			display: inline-flex;
			margin-left: 6px;
			border: 1px solid var(--vsword-border);
			border-radius: 4px;
			overflow: hidden;
			flex-shrink: 0;
		}
		.vsword-md-substyle-btn {
			border: 0;
			background: transparent;
			color: var(--vsword-fg);
			font: inherit;
			padding: 3px 10px;
			cursor: pointer;
			white-space: nowrap;
			border-left: 1px solid var(--vsword-border);
		}
		.vsword-md-substyle-btn:first-child { border-left: 0; }
		.vsword-md-substyle-btn:hover { background: color-mix(in srgb, var(--vsword-fg) 8%, transparent); }
		.vsword-md-substyle-btn[aria-pressed="true"] {
			background: var(--vsword-accent);
			color: var(--vscode-button-foreground, #fff);
		}
		/* Edit-context visual feedback (Q2=b): left bar + tinted background on the block containing the cursor.
		   指示条落在 padding-left 内（left:0），禁止负偏移 —— 负 left 是底部灰横条主因之一。 */
		#milkdown-root .ProseMirror .vsword-edit-context {
			position: relative;
			background: color-mix(in srgb, var(--vsword-accent) 6%, transparent);
			border-radius: 4px;
			transition: background 120ms ease;
		}
		#milkdown-root .ProseMirror .vsword-edit-context::before {
			content: "";
			position: absolute;
			left: -12px; /* 相对 block；外层 ProseMirror 已 padding-left:16px，不会溢出 root */
			top: 4px;
			bottom: 4px;
			width: 3px;
			border-radius: 2px;
			background: var(--vsword-accent);
			pointer-events: none;
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
		#milkdown-root .ProseMirror {
			outline: none;
			font-family: var(--vscode-editor-font-family, ui-serif, Georgia, serif);
			font-size: 17px;
			line-height: 1.75;
			max-width: 860px;
			margin: 0 auto;
			overflow-wrap: anywhere;
			word-break: break-word;
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
		/* T-3.3.3 Slash menu
		   外层 .vsword-slash-menu 定宽 + overflow:hidden；
		   内层 .vsword-slash-scroll 滚动但 **完全隐藏原生滚动条宽度**，
		   高亮 background 才能左右贴边全宽。滚轮/触控板仍可用。 */
		.vsword-slash-menu {
			position: absolute;
			z-index: 1000;
			min-width: 240px;
			max-width: min(360px, 80vw);
			padding: 0;
			overflow: hidden;
			background: var(--vscode-menu-background, var(--vsword-bg));
			color: var(--vscode-menu-foreground, var(--vsword-fg));
			border: 1px solid var(--vscode-menu-border, var(--vsword-border));
			border-radius: 6px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}
		.vsword-slash-scroll {
			max-height: 320px;
			overflow-x: hidden;
			overflow-y: auto;
			padding: 4px 0;
			/* 彻底去掉滚动条占位（Windows classic scrollbar 会挤出右侧白条） */
			scrollbar-width: none; /* Firefox */
			-ms-overflow-style: none; /* legacy Edge */
		}
		.vsword-slash-scroll::-webkit-scrollbar {
			width: 0 !important;
			height: 0 !important;
			display: none !important;
			background: transparent !important;
		}
		/* 悬停时用左侧细边提示可滚（不占内容宽）；真正滚动靠滚轮 */
		.vsword-slash-menu:hover .vsword-slash-scroll {
			box-shadow: inset -2px 0 0 0 rgba(128, 128, 128, 0.35);
		}
		.vsword-slash-menu[hidden],
		.vsword-slash-menu[data-hidden="true"] {
			display: none !important;
			visibility: hidden !important;
			pointer-events: none !important;
		}
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
			width: 100%;
			box-sizing: border-box;
			padding: 6px 12px;
			margin: 0;
			cursor: pointer;
		}
		.vsword-slash-item.active,
		.vsword-slash-item:hover {
			background: var(--vscode-menu-selectionBackground, rgba(120, 120, 120, 0.28));
			color: var(--vscode-menu-selectionForeground, inherit);
		}
		.vsword-slash-label { flex: 1 1 auto; min-width: 0; }
		.vsword-slash-hint {
			flex: 0 0 auto;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #888);
			opacity: 0.85;
		}
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
		   The '.vsword-table-wrap' is a $view NodeView wrapping the native <table>
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

		/* T-3.12.2.b · Table chrome (hover-gated Notion/Typora style).
		 * Old .vsword-table-col-bar / -row-bar removed — JS no longer creates them.
		 * handle / menu are mounted into DOM by NodeView only on pointerenter, so no
		 * CSS opacity gate needed. Corner stays in DOM and is always visible. */

		/* Whole-table corner button — moved to the outside bottom-right. */
		.vsword-table-corner {
			position: absolute;
			right: -24px;
			bottom: -24px;
			width: 28px; height: 20px;
			display: flex; align-items: center; justify-content: center;
			z-index: 3;
		}
		.vsword-table-corner-btn {
			all: unset;
			width: 20px; height: 18px;
			display: inline-flex; align-items: center; justify-content: center;
			font: inherit; font-size: 14px; line-height: 1;
			color: #666;
			background: #fff;
			border: 1px solid #ccc;
			border-radius: 3px;
			cursor: pointer;
		}
		.vsword-table-corner-btn:hover { border-color: #007acc; }
		.vsword-table-corner-pop {
			display: none;
			position: absolute;
			top: 22px; right: 0;              /* Anchor popover to the corner's right edge. */
			padding: 4px;
			background: #fff;
			border: 1px solid #ccc;
			border-radius: 4px;
			box-shadow: 0 2px 6px rgba(0,0,0,0.15);
			z-index: 4;
		}
		.vsword-table-corner[data-open="true"] .vsword-table-corner-pop { display: flex; }

		/* Col handle — a thin three-dot strip centered on the cell's top edge.
		 * anchorTo(side='top') writes left = cellLeft + w/2 - 12 and top = cellTop - 8,
		 * so we size 24px wide × 6px tall to sit centered across the border. */
		.vsword-table-col-handle {
			position: absolute;
			width: 24px; height: 6px;
			background: rgba(0,0,0,0.15);
			border-radius: 2px;
			color: #666;
			font-size: 8px;
			line-height: 6px;
			text-align: center;
			cursor: pointer;
			user-select: none;
			z-index: 5;
			overflow: hidden;
		}
		.vsword-table-col-handle:hover { background: rgba(0,0,0,0.3); }

		/* Row handle — mirrored: anchorTo(side='left') writes left = cellLeft - 8 and
		 * top = cellTop + h/2 - 12, so 6×24px vertical strip on the left border. */
		.vsword-table-row-handle {
			position: absolute;
			width: 6px; height: 24px;
			background: rgba(0,0,0,0.15);
			border-radius: 2px;
			color: #666;
			font-size: 8px;
			line-height: 24px;
			text-align: center;
			cursor: pointer;
			user-select: none;
			z-index: 5;
			overflow: hidden;
		}
		.vsword-table-row-handle:hover { background: rgba(0,0,0,0.3); }

		/* Col/Row popovers — mounted on the wrap and anchored via anchorTo (side='below'
		 * for col, side='right' for row). Absolute-positioned so the inline styles from
		 * anchorTo take effect. */
		.vsword-table-col-menu,
		.vsword-table-row-menu {
			position: absolute;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 2px;
			padding: 2px;
			background: #fff;
			border: 1px solid #ccc;
			border-radius: 3px;
			box-shadow: 0 2px 6px rgba(0,0,0,0.15);
			z-index: 6;
		}
		.vsword-table-col-menu {
			flex-direction: column;
		}
		.vsword-table-btn-group {
			display: inline-flex;
			gap: 1px;
			background: #fff;
			padding: 1px;
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

		/* T-3.5b.2 · mermaid NodeView */
		.vsword-mermaid {
			display: block;
			margin: 6px 0;
			padding: 8px 10px;
			border-radius: 4px;
			background: var(--vscode-editor-background, transparent);
			position: relative;
		}
		.vsword-mermaid:hover:not(.is-editing) { background: var(--vscode-editor-hoverHighlightBackground, rgba(120,120,120,0.06)); }
		.vsword-mermaid.is-editing { background: var(--vscode-editor-background, transparent); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc); }
		.vsword-mermaid.has-error:not(.is-editing) { box-shadow: 0 0 0 1px #cc0000; }
		.vsword-mermaid.is-selected { outline: 2px solid var(--vscode-focusBorder, #007acc); outline-offset: 2px; }
		.vsword-mermaid-preview {
			display: block;
			overflow-x: auto;
			text-align: center;
			cursor: pointer;
		}
		.vsword-mermaid-preview svg { max-width: 100%; height: auto; }
		.vsword-mermaid-preview.is-stale { opacity: 0.55; }
		.vsword-mermaid-skeleton {
			display: block;
			padding: 24px 32px;
			color: var(--vscode-descriptionForeground, #888);
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 12px;
			border: 1px dashed var(--vscode-panel-border, #444);
			border-radius: 4px;
			text-align: center;
			box-sizing: border-box;
			width: 100%;
			min-height: 80px;
			line-height: 32px;
		}
		.vsword-mermaid-placeholder {
			display: inline-block;
			padding: 12px 20px;
			color: var(--vscode-descriptionForeground, #888);
			font-style: italic;
			font-size: 12px;
		}
		.vsword-mermaid-error {
			display: block;
			padding: 4px 8px;
			margin-bottom: 6px;
			background: rgba(204,0,0,0.08);
			color: #cc0000;
			border-left: 3px solid #cc0000;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 11px;
		}
		.vsword-mermaid-error-head {
			display: flex;
			align-items: center;
			gap: 8px;
			min-height: 20px;
		}
		.vsword-mermaid-error-headline {
			flex: 1 1 auto;
			cursor: pointer;
			user-select: none;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			outline: none;
		}
		.vsword-mermaid-error-headline::before {
			content: '\u25B6';
			display: inline-block;
			margin-right: 4px;
			font-size: 8px;
			transition: transform 0.12s;
		}
		.vsword-mermaid-error-headline[aria-expanded='true']::before { transform: rotate(90deg); }
		.vsword-mermaid-error-headline:focus-visible { outline: 1px dashed #cc0000; outline-offset: 1px; }
		.vsword-mermaid-error-tools {
			display: inline-flex;
			gap: 4px;
			flex: 0 0 auto;
		}
		.vsword-mermaid-error-btn {
			font: inherit;
			color: inherit;
			background: transparent;
			border: 1px solid rgba(204,0,0,0.35);
			border-radius: 3px;
			padding: 1px 6px;
			cursor: pointer;
			line-height: 1.3;
		}
		.vsword-mermaid-error-btn:hover { background: rgba(204,0,0,0.12); }
		.vsword-mermaid-error-btn.is-copied { color: #2a7f2a; border-color: rgba(42,127,42,0.5); }
		.vsword-mermaid-error-btn.is-copy-failed { color: #cc0000; border-color: rgba(204,0,0,0.7); }
		.vsword-mermaid-error-detail {
			display: block;
			margin: 6px 0 0;
			padding: 6px 8px;
			background: rgba(204,0,0,0.05);
			color: var(--vscode-editor-foreground, #d4d4d4);
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 11px;
			white-space: pre-wrap;
			word-break: break-word;
			max-height: 240px;
			overflow-y: auto;
			border-radius: 2px;
		}
		.vsword-mermaid-editor {
			display: block;
			margin-top: 6px;
		}
		.vsword-mermaid-source {
			display: block;
			width: 100%;
			min-height: 60px;
			padding: 6px 8px;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: var(--vscode-editor-font-size, 13px);
			color: var(--vscode-editor-foreground, #d4d4d4);
			background: var(--vscode-input-background, #1e1e1e);
			border: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 3px;
			resize: vertical;
			outline: none;
			box-sizing: border-box;
		}
		.vsword-mermaid-source:focus { border-color: var(--vscode-focusBorder, #007acc); }
		.vsword-md-shell[data-mode="reading"] .vsword-mermaid-editor { display: none !important; }
		.vsword-md-shell[data-mode="reading"] .vsword-mermaid { cursor: default; box-shadow: none; }
		.vsword-md-shell[data-mode="reading"] .vsword-mermaid-preview { cursor: default; }

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

		/* T-3.11.4 · backlinks footer · empty 时完全隐藏（用户反馈底部灰条噪音） */
		.vsword-backlinks-footer {
			border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
			background: var(--vscode-editorWidget-background, transparent);
			color: var(--vscode-descriptionForeground, #999);
			font-size: 12px;
			padding: 4px 12px;
			margin-top: 12px;
			user-select: none;
			flex-shrink: 0;
		}
		.vsword-backlinks-footer.empty {
			display: none !important;
		}
		.vsword-backlinks-header {
			background: transparent;
			border: 0;
			color: inherit;
			font: inherit;
			padding: 4px 0;
			cursor: pointer;
			letter-spacing: 0.02em;
		}
		.vsword-backlinks-header:hover:not(:disabled) {
			color: var(--vscode-foreground, #ddd);
		}
		.vsword-backlinks-header:disabled { cursor: default; }
		.vsword-backlinks-footer.collapsed .vsword-backlinks-list { display: none; }
		.vsword-backlinks-list {
			list-style: none;
			margin: 4px 0 8px;
			padding: 0;
			max-height: 240px;
			overflow-y: auto;
		}
		.vsword-backlinks-item {
			display: flex;
			align-items: baseline;
			gap: 8px;
			padding: 3px 6px;
			border-radius: 3px;
			cursor: pointer;
		}
		.vsword-backlinks-item:hover {
			background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.15));
		}
		.vsword-backlinks-name {
			color: var(--vscode-textLink-foreground, #4ea1ff);
			font-weight: 500;
		}
		.vsword-backlinks-count {
			font-size: 10px;
			padding: 0 5px;
			border-radius: 8px;
			background: var(--vscode-badge-background, rgba(128, 128, 128, 0.25));
			color: var(--vscode-badge-foreground, inherit);
		}
		.vsword-backlinks-path {
			flex: 1 1 auto;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #888);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		/* T-3.13.6 / RD-2: 查找栏默认彻底不占位（用户反馈底部灰条）；打开时 fixed 浮层 */
		.vsword-hidden { display: none !important; height: 0 !important; overflow: hidden !important; }
		.vsword-find-widget {
			position: fixed;
			bottom: 12px;
			left: 50%;
			transform: translateX(-50%);
			width: min(720px, calc(100vw - 48px));
			z-index: 1000;
			display: none !important;
			flex-direction: column;
			gap: 6px;
			padding: 0;
			margin: 0;
			height: 0;
			min-height: 0;
			overflow: hidden;
			border: 0;
			box-shadow: none;
			background: transparent;
			font-size: 12px;
			pointer-events: none;
		}
		.vsword-find-widget.is-open {
			display: flex !important;
			height: auto;
			min-height: 0;
			padding: 8px 12px;
			overflow: visible;
			pointer-events: auto;
			background: var(--vscode-editorWidget-background, var(--vsword-bg));
			border: 1px solid var(--vsword-border);
			border-radius: 8px;
			box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
		}
		.vsword-find-widget.vsword-hidden,
		.vsword-find-widget:not(.is-open) {
			display: none !important;
			height: 0 !important;
			min-height: 0 !important;
			padding: 0 !important;
			margin: 0 !important;
			border: 0 !important;
			box-shadow: none !important;
			overflow: hidden !important;
			pointer-events: none !important;
		}
		.vsword-find-row,
		.vsword-replace-row {
			display: flex;
			align-items: center;
			gap: 6px;
			flex-wrap: wrap;
		}
		.vsword-find-input,
		.vsword-replace-input {
			flex: 1 1 140px;
			min-width: 100px;
			padding: 4px 8px;
			border: 1px solid var(--vsword-border);
			border-radius: 4px;
			background: var(--vscode-input-background, transparent);
			color: var(--vsword-fg);
		}
		.vsword-find-count { color: var(--vsword-muted); min-width: 4.5em; }
		.vsword-find-opt,
		.vsword-find-prev,
		.vsword-find-next,
		.vsword-find-close,
		.vsword-replace-one,
		.vsword-replace-all {
			border: 1px solid var(--vsword-border);
			background: transparent;
			color: var(--vsword-fg);
			border-radius: 4px;
			padding: 2px 8px;
			cursor: pointer;
		}
		.vsword-find-opt-on { border-color: var(--vsword-accent); color: var(--vsword-accent); }
		.vsword-find-error { border-color: var(--vsword-error) !important; }
		.vsword-replace-row.vsword-hidden { display: none !important; }

		${getThemesCss()}
	</style>
</head>
<body data-theme="${initialTheme}">
	<div class="vsword-md-shell" data-mode="realtime">
		<header class="vsword-md-toolbar">
			<span class="vsword-md-title">${fileName}</span>
			<span class="vsword-md-resource" title="${resourceUri}">${resourceUri}</span>
			<span id="milkdown-status" class="vsword-md-status">Loading…</span>
			<button id="milkdown-save" class="vsword-md-button" type="button">Save</button>
			<div id="milkdown-mode-switch" class="vsword-md-mode-switch" role="radiogroup" aria-label="预览模式">
				<button class="vsword-md-mode-btn" data-mode="realtime" type="button" role="radio" aria-pressed="true" aria-checked="true">实时渲染</button>
				<button class="vsword-md-mode-btn" data-mode="reading" type="button" role="radio" aria-pressed="false" aria-checked="false">阅读模式</button>
				<button class="vsword-md-mode-btn" data-mode="source" type="button" role="radio" aria-pressed="false" aria-checked="false">源码模式</button>
			</div>
			<div id="milkdown-substyle-group" class="vsword-md-substyle-group" role="radiogroup" aria-label="专注策略">
				<button class="vsword-md-substyle-btn" data-substyle="normal" type="button" role="radio" aria-pressed="true" aria-checked="true">普通</button>
				<button class="vsword-md-substyle-btn" data-substyle="focus" type="button" role="radio" aria-pressed="false" aria-checked="false" title="专注模式 (Ctrl+Shift+F)">Focus</button>
				<button class="vsword-md-substyle-btn" data-substyle="typewriter" type="button" role="radio" aria-pressed="false" aria-checked="false" title="打字机模式 (Ctrl+Shift+T)">Typewriter</button>
			</div>
		</header>
		<div id="vsword-large-doc-banner" role="status" aria-live="polite" hidden>
			<span class="vsword-large-doc-msg" id="vsword-large-doc-msg">大文档按需加载中…</span>
			<button type="button" class="vsword-md-button" id="vsword-large-doc-load-all" title="将剩余段落全部装入编辑器（可能短暂卡顿）">加载剩余</button>
			<button type="button" class="vsword-md-button" id="vsword-large-doc-dismiss" title="隐藏本条提示">知道了</button>
		</div>
		<main id="milkdown-root" aria-label="Markdown WYSIWYG editor"><div class="milkdown-empty">Loading Milkdown…</div></main>
		<textarea id="milkdown-source" spellcheck="false" aria-label="Markdown source editor"></textarea>
	</div>
	<script type="module" src="${scriptUri}"></script>
	<script>
		// 首帧结束后卸掉 boot-paint 的 !important，避免卡住后续主题切换；
		// 此时 body[data-theme] + getThemesCss 已就位，背景由文档主题接管。
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				var el = document.getElementById('vsword-boot-paint');
				if (el) { el.remove(); }
			});
		});
	</script>
</body>
</html>`;
}

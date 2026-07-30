/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../../webview/common/webview.js';
import { HTML_PREVIEW_SANDBOX_NO_SCRIPTS } from './htmlPreviewContent.js';

export interface HtmlPreviewShellOptions {
	readonly fileName: string;
	readonly cspSource?: string;
	/** 初始 sandbox（内容到达前占位）。 */
	readonly initialSandbox?: string;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"]/g, ch => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
	}[ch] ?? ch));
}

/**
 * 外层 webview shell：顶栏 + iframe。
 * 用户 HTML 只进 iframe.srcdoc，不进 shell DOM。
 */
export function getHtmlPreviewShellHtml(options: HtmlPreviewShellOptions): string {
	const fileName = escapeHtml(options.fileName);
	const cspSource = escapeHtml(options.cspSource ?? webviewGenericCspSource);
	const initialSandbox = escapeHtml(options.initialSandbox ?? HTML_PREVIEW_SANDBOX_NO_SCRIPTS);
	const nonce = 'vsword-html-preview';

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src data: blob: about:;">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${fileName}</title>
	<style>
		html, body {
			margin: 0;
			padding: 0;
			height: 100%;
			width: 100%;
			overflow: hidden;
			font-family: var(--vscode-font-family, system-ui, sans-serif);
			font-size: var(--vscode-font-size, 13px);
			color: var(--vscode-foreground, #ccc);
			background: var(--vscode-editor-background, #1e1e1e);
		}
		.vsword-html-chrome {
			display: flex;
			align-items: center;
			gap: 8px;
			height: 32px;
			padding: 0 10px;
			border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
			background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background, #252526));
			box-sizing: border-box;
			flex-shrink: 0;
		}
		.vsword-html-chrome .title {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			opacity: 0.85;
		}
		.vsword-html-chrome button {
			appearance: none;
			border: 1px solid var(--vscode-button-border, transparent);
			background: var(--vscode-button-secondaryBackground, #3a3d41);
			color: var(--vscode-button-secondaryForeground, #fff);
			border-radius: 3px;
			padding: 2px 10px;
			cursor: pointer;
			font: inherit;
		}
		.vsword-html-chrome button:hover {
			background: var(--vscode-button-secondaryHoverBackground, #45494e);
		}
		.vsword-html-chrome .badge {
			font-size: 11px;
			opacity: 0.65;
			padding: 1px 6px;
			border-radius: 10px;
			border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
		}
		#frame-wrap {
			height: calc(100% - 32px);
			width: 100%;
			background: #fff;
		}
		iframe {
			border: 0;
			width: 100%;
			height: 100%;
			display: block;
			background: #fff;
		}
	</style>
</head>
<body>
	<div class="vsword-html-chrome" role="toolbar" aria-label="HTML 预览工具栏">
		<span class="title" id="file-title">${fileName}</span>
		<span class="badge" id="script-badge" hidden>脚本已启用</span>
		<button type="button" id="btn-source" title="切换到源码编辑">源码</button>
	</div>
	<div id="frame-wrap">
		<iframe id="preview" title="HTML 预览" sandbox="${initialSandbox}"></iframe>
	</div>
	<script nonce="${nonce}">
(function () {
	const vscode = acquireVsCodeApi();
	const iframe = document.getElementById('preview');
	const titleEl = document.getElementById('file-title');
	const badgeEl = document.getElementById('script-badge');
	const btnSource = document.getElementById('btn-source');

	btnSource.addEventListener('click', function () {
		vscode.postMessage({ type: 'showSource' });
	});

	window.addEventListener('message', function (event) {
		const msg = event.data;
		if (!msg || typeof msg.type !== 'string') {
			return;
		}
		if (msg.type === 'setContent') {
			if (typeof msg.fileName === 'string' && titleEl) {
				titleEl.textContent = msg.fileName;
			}
			const sandbox = typeof msg.sandbox === 'string' ? msg.sandbox : '';
			const allowScripts = sandbox.indexOf('allow-scripts') !== -1;
			if (badgeEl) {
				badgeEl.hidden = !allowScripts;
			}
			// 先清再设，避免同源缓存旧文档
			iframe.removeAttribute('srcdoc');
			iframe.setAttribute('sandbox', sandbox);
			iframe.srcdoc = typeof msg.html === 'string' ? msg.html : '';
		}
	});

	vscode.postMessage({ type: 'ready' });
})();
	</script>
</body>
</html>`;
}

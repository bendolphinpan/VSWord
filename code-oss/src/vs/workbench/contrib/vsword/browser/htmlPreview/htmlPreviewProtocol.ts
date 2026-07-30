/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** RD-HTML-1 · HTML 源码/预览同页签切换 */

export const VSWORD_HTML_PREVIEW_EDITOR_ID = 'workbench.editors.vsword.htmlPreview';

/** Webview origin（隔离于 Milkdown / mindmap）。 */
export const VSWORD_HTML_PREVIEW_ORIGIN = 'vsword-html-preview';

export const VSWORD_HTML_PREVIEW_TYPE_ID = 'workbench.editors.vsword.htmlPreviewInput';

/** 配置：是否允许预览页运行脚本（仍受工作区信任门闩）。 */
export const VSWORD_HTML_PREVIEW_ALLOW_SCRIPTS_CONFIG = 'vsword.htmlPreview.allowScripts';

export const VSWORD_HTML_TOGGLE_PREVIEW_ACTION_ID = 'vsword.html.togglePreview';
export const VSWORD_HTML_SHOW_PREVIEW_ACTION_ID = 'vsword.html.showPreview';
export const VSWORD_HTML_SHOW_SOURCE_ACTION_ID = 'vsword.html.showSource';

/** Host → webview */
export type HostToHtmlPreviewMessage =
	| { readonly type: 'setContent'; readonly html: string; readonly sandbox: string; readonly fileName: string }
	| { readonly type: 'setChrome'; readonly allowScripts: boolean };

/** Webview → host */
export type HtmlPreviewToHostMessage =
	| { readonly type: 'ready' }
	| { readonly type: 'showSource' };

export function isHtmlFilePath(path: string): boolean {
	const lower = path.toLowerCase();
	return lower.endsWith('.html') || lower.endsWith('.htm');
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * RD-HTML-1 · HTML 预览文档装配（纯函数）。
 *
 * 输入用户 HTML 字符串 + base URI，输出可放入 iframe.srcdoc 的完整文档。
 * 无 VS Code 服务依赖，便于 node 单测。
 */

export interface BuildHtmlPreviewDocumentOptions {
	/** 用户 HTML 源码（可为片段或完整文档）。 */
	readonly source: string;
	/**
	 * 作为 `<base href>` 的绝对 URI（通常是 asWebviewUri(dirname(file)) + '/'）。
	 * 相对资源（css/img/script）相对此 base 解析。
	 */
	readonly baseHref: string;
	/**
	 * 是否允许脚本。false 时在文档级注入 CSP 禁止 script（与 iframe sandbox 双保险）。
	 */
	readonly allowScripts: boolean;
}

/**
 * 受信工作区 + allowScripts 时的 iframe sandbox。
 * allow-same-origin：相对资源可按 base 加载；allow-scripts：运行页面 JS。
 */
export const HTML_PREVIEW_SANDBOX_WITH_SCRIPTS =
	'allow-scripts allow-forms allow-same-origin allow-modals allow-popups';

/** 非受信 / 关闭脚本时：只渲染静态 HTML/CSS。 */
export const HTML_PREVIEW_SANDBOX_NO_SCRIPTS = 'allow-same-origin';

export function sandboxForPreview(allowScripts: boolean): string {
	return allowScripts ? HTML_PREVIEW_SANDBOX_WITH_SCRIPTS : HTML_PREVIEW_SANDBOX_NO_SCRIPTS;
}

/**
 * 若文档尚无 `<base>`，在 `<head>`（或文档开头）注入 base href。
 * 已有 base 则不重复注入（尊重作者意图）。
 */
export function injectBaseHref(source: string, baseHref: string): string {
	const href = baseHref.trim();
	if (!href) {
		return source;
	}
	if (/<base\b/i.test(source)) {
		return source;
	}

	const baseTag = `<base href="${escapeAttr(href)}">`;

	// 优先插到 <head> 内
	const headOpen = source.match(/<head\b[^>]*>/i);
	if (headOpen && headOpen.index !== undefined) {
		const insertAt = headOpen.index + headOpen[0].length;
		return source.slice(0, insertAt) + baseTag + source.slice(insertAt);
	}

	// 完整 html 但无 head：在 <html> 后造 head
	const htmlOpen = source.match(/<html\b[^>]*>/i);
	if (htmlOpen && htmlOpen.index !== undefined) {
		const insertAt = htmlOpen.index + htmlOpen[0].length;
		return source.slice(0, insertAt) + `<head>${baseTag}</head>` + source.slice(insertAt);
	}

	// 片段：包一层最小文档
	return `<!DOCTYPE html><html><head>${baseTag}<meta charset="utf-8"></head><body>${source}</body></html>`;
}

/**
 * 关闭脚本时注入 CSP meta，阻止内联/外链 script（sandbox 已禁，此为纵深防御）。
 */
export function injectNoScriptCsp(source: string): string {
	if (/http-equiv\s*=\s*["']?Content-Security-Policy/i.test(source)) {
		// 已有 CSP：不覆盖作者策略
		return source;
	}
	const csp = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'self';">`;
	const headOpen = source.match(/<head\b[^>]*>/i);
	if (headOpen && headOpen.index !== undefined) {
		const insertAt = headOpen.index + headOpen[0].length;
		return source.slice(0, insertAt) + csp + source.slice(insertAt);
	}
	return source;
}

/**
 * 组装 iframe.srcdoc 内容。
 */
export function buildHtmlPreviewDocument(options: BuildHtmlPreviewDocumentOptions): string {
	let html = options.source ?? '';
	if (!html.trim()) {
		html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
	}

	// 片段（无 html/body）时补最小壳，便于 base/CSP 注入
	if (!/<html\b/i.test(html) && !/<body\b/i.test(html) && !/<head\b/i.test(html)) {
		html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
	}

	html = injectBaseHref(html, options.baseHref);

	if (!options.allowScripts) {
		html = injectNoScriptCsp(html);
	}

	return html;
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

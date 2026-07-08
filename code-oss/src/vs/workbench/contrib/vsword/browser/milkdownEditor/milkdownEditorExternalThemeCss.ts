/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.b · Typora 外挂主题 CSS 预处理（纯函数层）。
//
// 两个纯函数：
//   - rebaseCssUrls：把 `url(<相对>)` 改写到主题目录下的绝对 URI 字符串；绝对 URL / data / `/…` 保持原样。
//   - wrapCssWithScope：给 CSS 外套一层 `body[data-theme="<id>"] { ... }` scope，依赖 CSS Nesting。
//
// 本文件不 touch fs、不 touch webview、不 touch protocol —— 只输入字符串 + URI，输出字符串。
// caller（c 卡的 broadcast 层）自己决定：先 rebase → 再 wrap → 再 asWebviewUri（如需）。

import type { URI } from '../../../../../base/common/uri.js';

/**
 * T-3.7d.2 · 把 CSS 文本里所有 `url(<相对>)` rebase 到 `<themeDirUri>/<相对>`。
 *
 * 规则（严格按 PRD §4.2）：
 * - 相对：`./x`、`../y`、`x/y`（不以 `http:`/`https:`/`data:`/`vscode-webview:`/`file:`/`blob:` 开头，不以 `/` 开头）→ rebase
 * - 绝对 URL 前缀 → 原样保留
 * - `/absolute-path` → 原样保留（v1 Non-Goal，不处理绝对本地路径）
 * - 三种引号形式（`url(x)` / `url('x')` / `url("x")`）都识别
 * - rebase 后写回 `url(<themeDirUri.toString()>/<相对>)`，caller 再决定要不要 asWebviewUri
 *
 * 实现：单个正则 + replace 回调；不改 CSS 里其他任何字符（保原始空白 / 顺序）。
 */
export function rebaseCssUrls(rawCss: string, themeDirUri: URI): string {
	const base = ensureTrailingSlash(themeDirUri.toString());
	// url\(  空白?  引号?(捕获)  非空白/非引号/非闭括号(捕获)  引号?  空白?  \)
	// 说明：中间 target 段禁掉 `'"\s)`，跟 css spec 一致。
	return rawCss.replace(
		/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g,
		(match, _quote, target: string) => {
			if (!isRelativeUrl(target)) {
				return match;
			}
			const rebased = base + stripLeadingDotSlash(target);
			return `url(${rebased})`;
		},
	);
}

/**
 * T-3.7d.2 · 给整段 CSS 外套 `body[data-theme="<id>"] { <rawCss> }`。
 *
 * 依赖 webview 环境的 CSS Nesting 支持（Electron/Chromium 现代版本已 GA）。
 * 实现只做字符串拼接，不改内层 CSS 一字一符（便于 caller 逐字节 diff）。
 * caller 要自己保证 id 不含 `"`，本层不做转义 —— 外挂 id 形如 `ext:workspace:slug`，slug 由
 *  discovery 层 lowercase 化，安全字符集已够窄。
 */
export function wrapCssWithScope(rawCss: string, themeId: string): string {
	return `body[data-theme="${themeId}"] { ${rawCss} }`;
}

// ---------- 内部 helper ----------

const ABSOLUTE_URL_PREFIXES = [
	'http://',
	'https://',
	'data:',
	'vscode-webview://',
	'vscode-webview-resource://',
	'file://',
	'blob:',
];

function isRelativeUrl(target: string): boolean {
	if (target.length === 0) { return false; }
	if (target.startsWith('/')) { return false; }        // 绝对本地路径：v1 Non-Goal
	if (target.startsWith('#')) { return false; }        // fragment（SVG symbol 引用）保持原样
	const lower = target.toLowerCase();
	for (const prefix of ABSOLUTE_URL_PREFIXES) {
		if (lower.startsWith(prefix)) { return false; }
	}
	return true;
}

function stripLeadingDotSlash(target: string): string {
	// `./foo` → `foo`；`../foo` 保留（URI.toString() + `../foo` 由 URI 解析层负责规约）。
	return target.startsWith('./') ? target.slice(2) : target;
}

function ensureTrailingSlash(uri: string): string {
	return uri.endsWith('/') ? uri : uri + '/';
}

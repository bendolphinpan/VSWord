/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.c · 外挂主题 CSS payload 组装（纯函数层）。
//
// 职责：给定一个 ext:* 主题 id + 已发现主题清单 + fileService + webview-uri 变换函数，
// 产出 `HostThemeCssPayloadMessage`。全部失败模式（id 找不到 / 读文件抛错 / cssText 空）
// 都返回 undefined，让 caller 决定要不要走「仅广播 themeChanged」的降级路径。
//
// 本层唯一 side effect 是 fileService.readFile —— 不 touch webview、不 touch storage、
// 不订阅事件。这层薄薄的组合层让 Contribution 类可以只做 orchestration，测试也不需要
// 拉起整个 workbench DI 容器。

import type { URI } from '../../../../../base/common/uri.js';
import { dirname } from '../../../../../base/common/resources.js';
import type { IFileService } from '../../../../../platform/files/common/files.js';
import type { ExternalTheme } from './milkdownEditorExternalThemes.js';
import { isExternalThemeId } from './milkdownEditorExternalThemes.js';
import { rebaseCssUrls, wrapCssWithScope } from './milkdownEditorExternalThemeCss.js';
import type { HostThemeCssPayloadMessage } from './milkdownEditorProtocol.js';

/**
 * T-3.7d.2.c · 输入依赖。
 *
 *  - `themeId`：形如 `ext:workspace:foo` / `ext:user:bar`。非 `ext:` 前缀直接返回 undefined。
 *  - `themes`：最近一次 discovery 缓存；通过 `themes.find(t => t.id === themeId)` 反查 URI。
 *  - `fileService`：读原始 CSS。
 *  - `toWebviewUri`：把主题目录 URI 变换为 webview 里可加载的 URI（生产走 `asWebviewUri`）；
 *    测试传身份函数即可。
 */
export interface BuildExternalThemePayloadDeps {
	readonly themeId: string;
	readonly themes: readonly ExternalTheme[];
	readonly fileService: Pick<IFileService, 'readFile'>;
	readonly toWebviewUri: (dirUri: URI) => URI;
}

/**
 * T-3.7d.2.c · 组装 HostThemeCssPayloadMessage。
 *
 * 流程：
 *   1. `themeId` 必须以 `ext:` 开头，且能在 `themes` 里 hit 一条记录 → 否则 undefined
 *   2. 读原始 CSS（fileService.readFile），失败 → undefined
 *   3. `rebaseCssUrls`（相对 URL 改写到 themeDir/... webview uri）
 *   4. `wrapCssWithScope`（外套 `body[data-theme="<id>"] { ... }`）
 *   5. 返回 `{ type: 'themeCssPayload', themeId, cssText }`
 *
 * 全部错误就地吞掉并返回 undefined —— caller 层已经在广播链路里，日志由 caller 打。
 */
export async function buildExternalThemePayload(
	deps: BuildExternalThemePayloadDeps,
): Promise<HostThemeCssPayloadMessage | undefined> {
	const { themeId, themes, fileService, toWebviewUri } = deps;
	if (!isExternalThemeId(themeId)) { return undefined; }
	const found = themes.find(t => t.id === themeId);
	if (!found) { return undefined; }
	let cssText: string;
	try {
		const raw = await fileService.readFile(found.uri);
		cssText = raw.value.toString();
	} catch {
		return undefined;
	}
	const themeDirWebviewUri = toWebviewUri(dirname(found.uri));
	const rebased = rebaseCssUrls(cssText, themeDirWebviewUri);
	const scoped = wrapCssWithScope(rebased, themeId);
	return { type: 'themeCssPayload', themeId, cssText: scoped };
}

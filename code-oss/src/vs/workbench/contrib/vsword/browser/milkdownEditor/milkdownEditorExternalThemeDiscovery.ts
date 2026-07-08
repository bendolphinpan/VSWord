/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7d.2.b · Typora `.css` 外挂主题 discovery（纯函数层）。
//
// 职责：扫描 workspace / user 两级 `.vsword/themes` 目录，产出 ExternalTheme[]。
// - 只 stat + list children，**不读文件内容**（读文件留给 c 卡的 broadcast 层按需处理）。
// - 目录不存在（FileNotFound / NotADirectory）静默降级返回空；其他错误上抛让 caller 决定是否吞。
// - 冲突规则：同 slug 时 workspace 覆盖 user（PRD §4.2 已锁死）。
// - 子目录不递归，v1 简化。
//
// 本文件不引入 Contribution / watcher / eventEmitter —— 那全是 c 卡的活。
// 对应 PRD：`docs/requirements/T-3.7d-theme-compat.md` §4.2 + AC-2/4/5/6。

import type { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import {
	FileSystemProviderErrorCode,
	IFileService,
	IFileStat,
	toFileSystemProviderErrorCode,
} from '../../../../../platform/files/common/files.js';
import {
	ExternalTheme,
	makeExternalThemeId,
	VSWORD_EXTERNAL_THEMES_DIRNAME,
} from './milkdownEditorExternalThemes.js';

/**
 * T-3.7d.2 · discover 输入依赖。
 *
 * - `fileService`：走虚拟文件系统 aware 的 IFileService，不直接 touch node `fs`（PRD 强制）。
 * - `workspaceUri`：第一个 workspace folder；无 workspace 场景传 undefined，只扫用户级。
 * - `userConfigDirUri`：用户级 `.vsword/themes` 的**父目录**（caller 通过
 *   `environmentService.userHome` / `os.homedir()` 等自己拼；本层只负责 join `.vsword/themes`）。
 */
export interface ExternalThemeDiscoveryDeps {
	readonly fileService: IFileService;
	readonly workspaceUri: URI | undefined;
	readonly userConfigDirUri: URI;
}

/**
 * T-3.7d.2 · 从 CSS 头注释里抽取 `Theme Name: XXX` 显示名。
 *
 * 只匹配文件**开头**的 `/* ... *​/` 块注释里的一行 `Theme Name: XXX`，找不到返回 undefined。
 * 大小写不敏感（`theme name:` 也认），值端去首尾空白。
 * caller 自己决定：抽不到时用文件名 basename 兜底（本 b 卡的 discover 就是这么做的）。
 *
 * 纯函数、无副作用。B5 单测的 fixture 直接喂字符串进来。
 */
export function extractThemeDisplayName(cssText: string): string | undefined {
	// 只看开头的第一个块注释；不做递归多注释合并。
	// 允许块注释前有零个或多个空白字符（BOM 等极端情况由 caller 处理）。
	const blockMatch = /^\s*\/\*([\s\S]*?)\*\//.exec(cssText);
	if (!blockMatch) {
		return undefined;
	}
	const block = blockMatch[1];
	// `Theme Name:` 大小写不敏感，值到行尾。
	const nameMatch = /theme\s*name\s*:\s*(.+?)\s*(?:\r?\n|$)/i.exec(block);
	if (!nameMatch) {
		return undefined;
	}
	const value = nameMatch[1].trim();
	return value.length > 0 ? value : undefined;
}

/**
 * T-3.7d.2 · 扫描 workspace + user 两个 `.vsword/themes` 目录，产出 ExternalTheme[]。
 *
 * 输出稳定顺序：**先 workspace 组，再 user 组，组内按 slug 升序**。同 slug workspace 覆盖 user。
 * 目录不存在（FileNotFound / NotADirectory）静默返回该源的空数组；其余错误上抛。
 *
 * displayName：**不读文件内容**，直接用文件名 basename 去掉 `.css` 后缀（保持大小写）。
 * 后续 c 卡若要走「读 CSS 头注释拿 `Theme Name:`」路径，再叠一层过滤即可 —— 本层保持
 * "只 stat 不读"，扫描成本恒定于目录项数量。
 */
export async function discoverExternalThemes(deps: ExternalThemeDiscoveryDeps): Promise<ExternalTheme[]> {
	const { fileService, workspaceUri, userConfigDirUri } = deps;

	const workspaceDir = workspaceUri ? joinPath(workspaceUri, VSWORD_EXTERNAL_THEMES_DIRNAME) : undefined;
	const userDir = joinPath(userConfigDirUri, VSWORD_EXTERNAL_THEMES_DIRNAME);

	const [workspaceEntries, userEntries] = await Promise.all([
		workspaceDir ? listCssChildren(fileService, workspaceDir) : Promise.resolve([] as IFileStat[]),
		listCssChildren(fileService, userDir),
	]);

	// 冲突处理：先放 user，再放 workspace，同 slug 用 workspace 覆盖。用 Map 保留最后写入。
	const bySlug = new Map<string, ExternalTheme>();
	for (const child of userEntries) {
		const theme = buildExternalTheme(child, 'user');
		if (theme) { bySlug.set(theme.id, theme); }
	}
	for (const child of workspaceEntries) {
		const theme = buildExternalTheme(child, 'workspace');
		if (theme) {
			// workspace 覆盖 user：`ext:*` id 里 source 段不同，得用 slug 做覆盖 key。
			const slug = extractSlugFromId(theme.id);
			for (const [existingId, existingTheme] of bySlug) {
				if (extractSlugFromId(existingId) === slug && existingTheme.source === 'user') {
					bySlug.delete(existingId);
				}
			}
			bySlug.set(theme.id, theme);
		}
	}

	// 稳定排序：先 workspace 组、再 user 组，组内按 slug（== id 尾段）升序。
	const themes = [...bySlug.values()];
	themes.sort((a, b) => {
		if (a.source !== b.source) {
			return a.source === 'workspace' ? -1 : 1;
		}
		return extractSlugFromId(a.id).localeCompare(extractSlugFromId(b.id));
	});
	return themes;
}

async function listCssChildren(fileService: IFileService, dir: URI): Promise<IFileStat[]> {
	try {
		const stat = await fileService.resolve(dir);
		const children = stat.children ?? [];
		return children.filter(child => (
			!child.isDirectory
			&& child.name.toLowerCase().endsWith('.css')
		));
	} catch (err) {
		const code = toFileSystemProviderErrorCode(err instanceof Error ? err : null);
		if (code === FileSystemProviderErrorCode.FileNotFound
			|| code === FileSystemProviderErrorCode.FileNotADirectory) {
			return [];
		}
		throw err;
	}
}

function buildExternalTheme(child: IFileStat, source: 'workspace' | 'user'): ExternalTheme | undefined {
	const basename = child.name.replace(/\.css$/i, '');
	if (basename.length === 0) { return undefined; }
	const slug = basename.toLowerCase();
	return {
		id: makeExternalThemeId(source, slug),
		displayName: basename,
		source,
		uri: child.resource,
	};
}

/**
 * 从 `ext:<source>:<slug>` id 里抽 slug 段。仅本模块内部用于覆盖去重，不导出。
 * 若格式异常兜底返回整段（Map 依然按整段查重，语义安全）。
 */
function extractSlugFromId(id: string): string {
	const idx = id.indexOf(':', 'ext:'.length);
	return idx >= 0 ? id.slice(idx + 1) : id;
}

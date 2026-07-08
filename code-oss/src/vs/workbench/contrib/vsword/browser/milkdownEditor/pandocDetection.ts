/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.3 · Pandoc 检测 —— 纯函数（依赖注入）
//
// 决策 M-1=C：Pandoc 走扩展市场（不内置）；host 侧检测三条策略，命中即停：
//   1. env var `VSWORD_PANDOC_PATH` 明确指向存在的可执行文件（测试/CI 用）
//   2. `IExtensionService.getExtension` 匹配 `PANDOC_EXTENSION_ID_CANDIDATES` 任一 id
//   3. PATH 上存在 `pandoc` / `pandoc.exe`（PATH 分隔符 + 每目录 fs 探测）
//
// 本文件是 browser 层组件，**不直接读 fs**：三条策略都通过依赖注入面（probe*）
// 传进来，由 `exportPandocContribution` 在真机侧装配 fs / IExtensionService / process.env
// 的具体实现。这样 test/node 里可以完全用 stub 跑，绕开 fs / VS Code kernel。

import { PANDOC_EXTENSION_ID_CANDIDATES, VSWORD_PANDOC_PATH_ENV_VAR } from './milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// Result 类型
// ---------------------------------------------------------------------------

/**
 * `detectPandoc` 的返回值。`available=false` 时 `source='none'` 且 `path` / `extensionId` 缺省；
 * 命中任一策略后携带诊断信息（路径 / 扩展 id）以便日后 notification 拼接。
 */
export interface PandocDetectionResult {
	readonly available: boolean;
	readonly source: 'env' | 'extension' | 'path' | 'none';
	readonly path?: string;
	readonly extensionId?: string;
}

// ---------------------------------------------------------------------------
// 依赖注入面
// ---------------------------------------------------------------------------

/** 单条 probe 的返回：命中 → 具体路径/id；未命中 → null。 */
export type PandocProbeResult =
	| { readonly source: 'env'; readonly path: string }
	| { readonly source: 'extension'; readonly extensionId: string }
	| { readonly source: 'path'; readonly path: string }
	| null;

/**
 * 三条 probe 独立注入。真机装配走 exportPandocContribution，测试走 stub。
 *
 * 优先级顺序 = probeEnvVar → probeExtension → probePath，首个非 null 命中即停。
 */
export interface PandocDetectionDeps {
	readonly probeEnvVar: () => Promise<PandocProbeResult>;
	readonly probeExtension: () => Promise<PandocProbeResult>;
	readonly probePath: () => Promise<PandocProbeResult>;
}

// ---------------------------------------------------------------------------
// detectPandoc —— 主入口
// ---------------------------------------------------------------------------

/**
 * 按优先级从上到下调 3 条 probe，首个非 null 命中即返回。
 *
 * 单条 probe 抛错时视为「未命中」（catch → 继续下一条），保护整体不因单个环境
 * 探测异常而彻底失败（e.g. fs 权限拒绝、IExtensionService 未就绪）。
 */
export async function detectPandoc(deps: PandocDetectionDeps): Promise<PandocDetectionResult> {
	const chain: ReadonlyArray<() => Promise<PandocProbeResult>> = [
		deps.probeEnvVar,
		deps.probeExtension,
		deps.probePath,
	];
	for (const probe of chain) {
		let hit: PandocProbeResult = null;
		try {
			hit = await probe();
		} catch {
			hit = null;
		}
		if (!hit) {
			continue;
		}
		if (hit.source === 'extension') {
			return { available: true, source: 'extension', extensionId: hit.extensionId };
		}
		return { available: true, source: hit.source, path: hit.path };
	}
	return { available: false, source: 'none' };
}

// ---------------------------------------------------------------------------
// 三条 probe 的工厂 —— 都是纯函数，宿主装配时把真实 env/fs/IExtensionService 传进来
// ---------------------------------------------------------------------------

/**
 * 环境变量 probe：`VSWORD_PANDOC_PATH` → fileExists 校验。
 *
 * 未设 / 空串 / 文件不存在 → null。用于 CI / 手动指定测试路径的场景。
 */
export function makeEnvVarProbe(
	readEnvVar: (name: string) => string | undefined,
	fileExists: (absolutePath: string) => Promise<boolean>,
): () => Promise<PandocProbeResult> {
	return async () => {
		const raw = readEnvVar(VSWORD_PANDOC_PATH_ENV_VAR);
		if (!raw || raw.trim().length === 0) {
			return null;
		}
		const trimmed = raw.trim();
		if (await fileExists(trimmed)) {
			return { source: 'env', path: trimmed };
		}
		return null;
	};
}

/**
 * 扩展 probe：任一 `PANDOC_EXTENSION_ID_CANDIDATES` 被 IExtensionService 识别即命中。
 *
 * `getExtension` reject / throw 视为未命中（例如扩展主机未启动的极端场景）。
 */
export function makeExtensionProbe(
	getExtension: (id: string) => Promise<unknown>,
	candidates: readonly string[] = PANDOC_EXTENSION_ID_CANDIDATES,
): () => Promise<PandocProbeResult> {
	return async () => {
		for (const id of candidates) {
			let hit: unknown = undefined;
			try {
				hit = await getExtension(id);
			} catch {
				hit = undefined;
			}
			if (hit) {
				return { source: 'extension', extensionId: id };
			}
		}
		return null;
	};
}

/**
 * PATH probe：把 `readEnvVar('PATH')` 按分隔符切分，每目录探测 `pandoc` / `pandoc.exe`。
 *
 * `pathSep` / `isWindows` / `joinPath` 由调用方注入，避免 browser 层直接依赖 node 的 `path` 模块。
 * 命中首个存在的可执行文件即返回；全都不存在 → null。
 */
export function makePathProbe(deps: {
	readonly readEnvVar: (name: string) => string | undefined;
	readonly fileExists: (absolutePath: string) => Promise<boolean>;
	readonly pathSep: string;
	readonly isWindows: boolean;
	readonly joinPath: (dir: string, name: string) => string;
}): () => Promise<PandocProbeResult> {
	return async () => {
		const raw = deps.readEnvVar('PATH') || deps.readEnvVar('Path') || deps.readEnvVar('path');
		if (!raw) {
			return null;
		}
		const dirs = raw.split(deps.pathSep).map(s => s.trim()).filter(Boolean);
		const names = deps.isWindows ? ['pandoc.exe', 'pandoc.cmd', 'pandoc'] : ['pandoc'];
		for (const dir of dirs) {
			for (const name of names) {
				const candidate = deps.joinPath(dir, name);
				let exists = false;
				try {
					exists = await deps.fileExists(candidate);
				} catch {
					exists = false;
				}
				if (exists) {
					return { source: 'path', path: candidate };
				}
			}
		}
		return null;
	};
}

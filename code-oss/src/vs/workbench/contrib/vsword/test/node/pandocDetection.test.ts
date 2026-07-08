/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8b.3 · pandocDetection 纯函数单测
//
// 覆盖：
//   A) detectPandoc 优先级链：env 优先 > extension > PATH > none
//   B) 单条 probe 抛错 → 视为未命中，继续下一条
//   C) makeEnvVarProbe：未设 / 空串 / 文件不存在 / 正常命中
//   D) makeExtensionProbe：无候选命中 / 命中第一个 / 命中第 N 个 / getExtension 抛错
//   E) makePathProbe：空 PATH / PATH 里首命中 / Windows 尝试 .exe

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	PandocDetectionDeps,
	PandocProbeResult,
	detectPandoc,
	makeEnvVarProbe,
	makeExtensionProbe,
	makePathProbe,
} from '../../browser/milkdownEditor/pandocDetection.js';
import { PANDOC_EXTENSION_ID_CANDIDATES, VSWORD_PANDOC_PATH_ENV_VAR } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// 辅助工厂
// ---------------------------------------------------------------------------

function fixedProbe(result: PandocProbeResult): () => Promise<PandocProbeResult> {
	return async () => result;
}

function throwingProbe(): () => Promise<PandocProbeResult> {
	return async () => { throw new Error('probe boom'); };
}

function buildDeps(overrides: Partial<PandocDetectionDeps>): PandocDetectionDeps {
	return {
		probeEnvVar: overrides.probeEnvVar ?? fixedProbe(null),
		probeExtension: overrides.probeExtension ?? fixedProbe(null),
		probePath: overrides.probePath ?? fixedProbe(null),
	};
}

// ---------------------------------------------------------------------------
// A · detectPandoc 优先级链
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · detectPandoc 优先级链', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('env 命中 → source=env，其它 probe 不再调用', async () => {
		let extCalled = 0;
		let pathCalled = 0;
		const result = await detectPandoc(buildDeps({
			probeEnvVar: fixedProbe({ source: 'env', path: '/opt/pandoc/pandoc' }),
			probeExtension: async () => { extCalled++; return null; },
			probePath: async () => { pathCalled++; return null; },
		}));
		assert.strictEqual(result.available, true);
		assert.strictEqual(result.source, 'env');
		assert.strictEqual(result.path, '/opt/pandoc/pandoc');
		assert.strictEqual(extCalled, 0, 'env 命中后不应调 extension probe');
		assert.strictEqual(pathCalled, 0, 'env 命中后不应调 PATH probe');
	});

	test('env 未命中 → extension 命中 → source=extension，PATH probe 不调用', async () => {
		let pathCalled = 0;
		const result = await detectPandoc(buildDeps({
			probeEnvVar: fixedProbe(null),
			probeExtension: fixedProbe({ source: 'extension', extensionId: 'ryzngard.vscode-pandoc' }),
			probePath: async () => { pathCalled++; return null; },
		}));
		assert.strictEqual(result.available, true);
		assert.strictEqual(result.source, 'extension');
		assert.strictEqual(result.extensionId, 'ryzngard.vscode-pandoc');
		assert.strictEqual(result.path, undefined, 'extension 分支不带 path');
		assert.strictEqual(pathCalled, 0);
	});

	test('env / extension 均未命中 → PATH fallback 命中 → source=path', async () => {
		const result = await detectPandoc(buildDeps({
			probeEnvVar: fixedProbe(null),
			probeExtension: fixedProbe(null),
			probePath: fixedProbe({ source: 'path', path: '/usr/local/bin/pandoc' }),
		}));
		assert.strictEqual(result.available, true);
		assert.strictEqual(result.source, 'path');
		assert.strictEqual(result.path, '/usr/local/bin/pandoc');
	});

	test('三 probe 全部未命中 → available=false / source=none', async () => {
		const result = await detectPandoc(buildDeps({}));
		assert.strictEqual(result.available, false);
		assert.strictEqual(result.source, 'none');
		assert.strictEqual(result.path, undefined);
		assert.strictEqual(result.extensionId, undefined);
	});

	test('单条 probe 抛错 → 视为未命中，继续下一条', async () => {
		const result = await detectPandoc(buildDeps({
			probeEnvVar: throwingProbe(),
			probeExtension: throwingProbe(),
			probePath: fixedProbe({ source: 'path', path: '/usr/bin/pandoc' }),
		}));
		assert.strictEqual(result.available, true);
		assert.strictEqual(result.source, 'path');
	});

	test('所有 probe 均抛错 → 也返回 unavailable，不冒泡异常', async () => {
		const result = await detectPandoc(buildDeps({
			probeEnvVar: throwingProbe(),
			probeExtension: throwingProbe(),
			probePath: throwingProbe(),
		}));
		assert.strictEqual(result.available, false);
		assert.strictEqual(result.source, 'none');
	});
});

// ---------------------------------------------------------------------------
// C · makeEnvVarProbe
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · makeEnvVarProbe', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('env 未设 → null', async () => {
		const probe = makeEnvVarProbe(() => undefined, async () => true);
		assert.strictEqual(await probe(), null);
	});

	test('env 空串 / 仅空白 → null', async () => {
		const probe1 = makeEnvVarProbe(() => '', async () => true);
		const probe2 = makeEnvVarProbe(() => '   \t', async () => true);
		assert.strictEqual(await probe1(), null);
		assert.strictEqual(await probe2(), null);
	});

	test('env 指定路径但文件不存在 → null', async () => {
		const probe = makeEnvVarProbe(
			(n) => n === VSWORD_PANDOC_PATH_ENV_VAR ? '/nowhere/pandoc' : undefined,
			async () => false,
		);
		assert.strictEqual(await probe(), null);
	});

	test('env 指定路径且存在 → 命中 source=env', async () => {
		const seen: string[] = [];
		const probe = makeEnvVarProbe(
			(n) => n === VSWORD_PANDOC_PATH_ENV_VAR ? '  /opt/pandoc  ' : undefined,
			async (p) => { seen.push(p); return true; },
		);
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'env', path: '/opt/pandoc' });
		assert.deepStrictEqual(seen, ['/opt/pandoc'], '应传去掉首尾空白后的路径');
	});

	test('只查 VSWORD_PANDOC_PATH，不误查 PATH', async () => {
		const seen: string[] = [];
		const probe = makeEnvVarProbe((n) => { seen.push(n); return undefined; }, async () => true);
		await probe();
		assert.deepStrictEqual(seen, [VSWORD_PANDOC_PATH_ENV_VAR]);
	});
});

// ---------------------------------------------------------------------------
// D · makeExtensionProbe
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · makeExtensionProbe', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('候选集全部未安装 → null', async () => {
		const probe = makeExtensionProbe(async () => undefined);
		assert.strictEqual(await probe(), null);
	});

	test('首个候选命中 → 立即返回，不查后续', async () => {
		const asked: string[] = [];
		const probe = makeExtensionProbe(async (id) => {
			asked.push(id);
			return id === PANDOC_EXTENSION_ID_CANDIDATES[0] ? { identifier: id } : undefined;
		});
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'extension', extensionId: PANDOC_EXTENSION_ID_CANDIDATES[0] });
		assert.deepStrictEqual(asked, [PANDOC_EXTENSION_ID_CANDIDATES[0]], '命中首个后应立即停止');
	});

	test('第二个候选命中 → 返回该 id', async () => {
		const target = PANDOC_EXTENSION_ID_CANDIDATES[1];
		const probe = makeExtensionProbe(async (id) => id === target ? { identifier: id } : undefined);
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'extension', extensionId: target });
	});

	test('getExtension 抛错 → 该候选视为未命中，继续下一个', async () => {
		const target = PANDOC_EXTENSION_ID_CANDIDATES[1];
		const probe = makeExtensionProbe(async (id) => {
			if (id === PANDOC_EXTENSION_ID_CANDIDATES[0]) { throw new Error('boom'); }
			return id === target ? { identifier: id } : undefined;
		});
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'extension', extensionId: target });
	});

	test('自定义候选集 → 只查传入的 id', async () => {
		const asked: string[] = [];
		const probe = makeExtensionProbe(async (id) => { asked.push(id); return undefined; }, ['custom.pandoc']);
		await probe();
		assert.deepStrictEqual(asked, ['custom.pandoc']);
	});
});

// ---------------------------------------------------------------------------
// E · makePathProbe
// ---------------------------------------------------------------------------

suite('T-3.8b.3 · makePathProbe', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('PATH 未设 → null', async () => {
		const probe = makePathProbe({
			readEnvVar: () => undefined,
			fileExists: async () => true,
			pathSep: ':',
			isWindows: false,
			joinPath: (d, n) => `${d}/${n}`,
		});
		assert.strictEqual(await probe(), null);
	});

	test('POSIX PATH 里首个存在 pandoc 的目录命中 → source=path', async () => {
		const probe = makePathProbe({
			readEnvVar: (n) => n === 'PATH' ? '/nope:/opt/bin:/usr/local/bin' : undefined,
			fileExists: async (p) => p === '/usr/local/bin/pandoc',
			pathSep: ':',
			isWindows: false,
			joinPath: (d, n) => `${d}/${n}`,
		});
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'path', path: '/usr/local/bin/pandoc' });
	});

	test('Windows PATH 优先尝试 pandoc.exe', async () => {
		const asked: string[] = [];
		const probe = makePathProbe({
			readEnvVar: (n) => n === 'PATH' ? 'C:\\Tools\\Pandoc;C:\\Other' : undefined,
			fileExists: async (p) => { asked.push(p); return p === 'C:\\Tools\\Pandoc\\pandoc.exe'; },
			pathSep: ';',
			isWindows: true,
			joinPath: (d, n) => `${d}\\${n}`,
		});
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'path', path: 'C:\\Tools\\Pandoc\\pandoc.exe' });
		assert.strictEqual(asked[0], 'C:\\Tools\\Pandoc\\pandoc.exe', 'Windows 应先探 pandoc.exe');
	});

	test('fileExists 全 false → null', async () => {
		const probe = makePathProbe({
			readEnvVar: (n) => n === 'PATH' ? '/a:/b:/c' : undefined,
			fileExists: async () => false,
			pathSep: ':',
			isWindows: false,
			joinPath: (d, n) => `${d}/${n}`,
		});
		assert.strictEqual(await probe(), null);
	});

	test('PATH 里的空段应被忽略（连续分隔符 / 首尾分隔符）', async () => {
		const asked: string[] = [];
		const probe = makePathProbe({
			readEnvVar: (n) => n === 'PATH' ? ':/usr/bin::/opt/bin:' : undefined,
			fileExists: async (p) => { asked.push(p); return false; },
			pathSep: ':',
			isWindows: false,
			joinPath: (d, n) => `${d}/${n}`,
		});
		await probe();
		// 只有 /usr/bin 和 /opt/bin 应被探测（空段过滤后）
		assert.deepStrictEqual(asked, ['/usr/bin/pandoc', '/opt/bin/pandoc']);
	});

	test('fileExists 抛错 → 该目录视为未命中，继续', async () => {
		const probe = makePathProbe({
			readEnvVar: (n) => n === 'PATH' ? '/bad:/good' : undefined,
			fileExists: async (p) => {
				if (p.startsWith('/bad')) { throw new Error('EACCES'); }
				return p === '/good/pandoc';
			},
			pathSep: ':',
			isWindows: false,
			joinPath: (d, n) => `${d}/${n}`,
		});
		const hit = await probe();
		assert.deepStrictEqual(hit, { source: 'path', path: '/good/pandoc' });
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b.5 · Mermaid 22 类 fixture round-trip 保真度测试
//
// 每类 fixture：
//   1) 用 mermaid-render-worker.mjs（子进程 fork）在 jsdom 里跑 mermaid v11 渲染
//   2) normalize 后与 .expected.svg golden 比对
//   3) 若 golden 缺失，则用当前 normalized 作为 golden（首次生成）
//
// 与 gate-e 里的 6 个 test 文件不同：这个 test 通过 fork 子进程完成 mermaid 渲染，
// mocha 主进程只负责 diff。因为 mermaid v11 需要一整套 jsdom + canvas + screen shim，
// 塞进 mocha 会污染其它测试。
//
// worker 一次 render 22 类耗时 ≈ 2s（首次冷启 + 22 类 render），一次跑一次即可。

import * as assert from 'assert';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-ignore — 通过 barrel 引入的 .mjs SSOT
import { MERMAID_FIXTURES } from '../fixtures/mermaid/_index.mjs';

// resolve 代码树里的路径。gate-f 会把 bundle 塞到 .tmp-vsword-mermaid-tests-xxx/，
// __dirname 于是不指向 src 目录；用 process.cwd() = code-oss 反推。
const CODE_OSS = process.cwd().endsWith('code-oss') ? process.cwd() : path.resolve(process.cwd(), 'code-oss');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const FIXTURE_DIR = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/mermaid');
const WORKER = path.resolve(CODE_OSS, 'test/scripts/mermaid-render-worker.mjs');

interface WorkerIter { ok: boolean; ms: number; svgBytes?: number; normBytes?: number; normalized?: string; error?: string; }
interface WorkerResult { id: string; tier: string; ok: boolean; error: string | null; iterations: WorkerIter[]; }
interface WorkerPayload { mermaidVersion: string; builder: string; iterations: number; total: number; okCount: number; failCount: number; results: WorkerResult[]; }

let cachedPayload: WorkerPayload | null = null;

function runWorkerOnce(): WorkerPayload {
	if (cachedPayload) { return cachedPayload; }
	const tmpOut = path.join(REPO_ROOT, `code-oss/test/reports/_mermaid-roundtrip-${Date.now()}.json`);
	fs.mkdirSync(path.dirname(tmpOut), { recursive: true });
	const res = cp.spawnSync(process.execPath, [WORKER, '--iterations', '1', '--out', tmpOut], {
		encoding: 'utf8',
		cwd: REPO_ROOT,
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	if (res.status !== 0) {
		throw new Error(`mermaid-render-worker exited with status ${res.status}`);
	}
	if (!fs.existsSync(tmpOut)) {
		throw new Error(`mermaid-render-worker did not produce ${tmpOut}`);
	}
	cachedPayload = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
	try { fs.unlinkSync(tmpOut); } catch { /* keep */ }
	return cachedPayload!;
}

// mocha 每个 test 独立 timeout；首次 render 需要 fork worker，给宽裕。
suite('T-3.5b.5 · Mermaid round-trip · golden svg diff', function () {
	// eslint-disable-next-line no-invalid-this
	this.timeout(120_000);

	let payload: WorkerPayload;
	suiteSetup(() => {
		payload = runWorkerOnce();
	});

	test('worker: 22/22 render 成功（GA + beta）', () => {
		assert.strictEqual(payload.total, 22, `expected 22 fixtures, got ${payload.total}`);
		assert.strictEqual(payload.failCount, 0, `render failed for ${payload.results.filter(r => !r.ok).map(r => r.id).join(', ')}`);
	});

	for (const fx of MERMAID_FIXTURES as Array<{ id: string; tier: string }>) {
		test(`[mermaid/${fx.tier}] ${fx.id} · normalized svg == golden`, () => {
			const r = payload.results.find(x => x.id === fx.id);
			assert.ok(r, `worker payload missing fixture id=${fx.id}`);
			assert.strictEqual(r!.ok, true, `render fail for ${fx.id}: ${r!.error}`);
			const it = r!.iterations[0];
			const normalized = it.normalized || '';
			assert.ok(normalized.length > 0, `empty normalized svg for ${fx.id}`);
			const goldenPath = path.join(FIXTURE_DIR, `${fx.id}.expected.svg`);
			if (!fs.existsSync(goldenPath)) {
				// 首次生成：落 golden 后跳过 diff。
				fs.writeFileSync(goldenPath, normalized, 'utf8');
				return;
			}
			const golden = fs.readFileSync(goldenPath, 'utf8');
			if (golden !== normalized) {
				// diff 尽量简短：show 前 200 字符差异。
				let firstDiff = -1;
				const min = Math.min(golden.length, normalized.length);
				for (let i = 0; i < min; i++) { if (golden[i] !== normalized[i]) { firstDiff = i; break; } }
				if (firstDiff < 0) { firstDiff = min; }
				const around = (s: string) => JSON.stringify(s.slice(Math.max(0, firstDiff - 40), firstDiff + 80));
				assert.fail(
					`svg diff for ${fx.id} at offset ${firstDiff}\n  golden(len=${golden.length}): ${around(golden)}\n  actual(len=${normalized.length}): ${around(normalized)}`
				);
			}
		});
	}
});

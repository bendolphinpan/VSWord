#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  RD-3 · 内存 / RSS 基线探针
 *
 *  能自动做的（本脚本）：
 *    1) Node 进程 baseline heap/rss
 *    2) 读入 1mb-mixed.md（若存在）后的 heap/rss 增量
 *    3) progressive 分块（markdown-chunk）的块数与 table 密度
 *
 *  不能自动做的（需 Electron 真机）：
 *    - Chromium renderer idle RSS
 *    - 打开 1MB 后的 renderer 峰值 RSS
 *  → 见脚本末尾打印的手测步骤；结果写入
 *    code-oss/test/reports/rd-3-rss-handmeasure.md
 *
 *  用法（仓库根）：
 *    node code-oss/test/scripts/rd-3-rss-probe.mjs
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO = path.resolve(CODE_OSS, '..');
const REPORT_DIR = path.join(CODE_OSS, 'test', 'reports');
const OUT_JSON = path.join(REPORT_DIR, 'rd-3-rss-probe.json');
const FIXTURE = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf/1mb-mixed.md',
);
const CHUNK_MOD = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/markdown-chunk.template.js',
);

function mem() {
	const m = process.memoryUsage();
	return {
		rss: m.rss,
		heapUsed: m.heapUsed,
		heapTotal: m.heapTotal,
		external: m.external,
		rssMiB: +(m.rss / 1024 / 1024).toFixed(1),
		heapUsedMiB: +(m.heapUsed / 1024 / 1024).toFixed(1),
	};
}

function fmtMiB(n) {
	return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

async function loadChunkModule() {
	// esbuild not required — .template.js is plain ESM-ish with @ts-nocheck; Node can import if we use pathToFileURL
	// but it uses export without "type":"module" path. Use dynamic import via file URL.
	const href = pathToFileURL(CHUNK_MOD).href;
	return import(href);
}

const t0 = Date.now();
const baseline = mem();
global.gc?.();

const result = {
	builtAt: new Date().toISOString(),
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	baseline,
	fixture: null,
	afterRead: null,
	deltaRead: null,
	progressive: null,
	notes: [],
};

if (!fs.existsSync(FIXTURE)) {
	result.notes.push(`fixture missing: ${FIXTURE}`);
	console.warn('[rd-3] fixture missing, skip 1MB path');
} else {
	const raw = fs.readFileSync(FIXTURE, 'utf8');
	const afterRead = mem();
	result.fixture = {
		path: path.relative(REPO, FIXTURE).replace(/\\/g, '/'),
		bytes: Buffer.byteLength(raw, 'utf8'),
		chars: raw.length,
	};
	result.afterRead = afterRead;
	result.deltaRead = {
		rss: afterRead.rss - baseline.rss,
		heapUsed: afterRead.heapUsed - baseline.heapUsed,
		rssMiB: +((afterRead.rss - baseline.rss) / 1024 / 1024).toFixed(1),
		heapUsedMiB: +((afterRead.heapUsed - baseline.heapUsed) / 1024 / 1024).toFixed(1),
	};

	try {
		const chunk = await loadChunkModule();
		const use = chunk.shouldUseProgressiveOpen(raw);
		const sizes = chunk.resolveProgressiveChunkSizes(raw);
		const parts = use
			? chunk.splitMarkdownProgressive(raw, sizes.firstMax, sizes.nextMax)
			: [raw];
		result.progressive = {
			enabled: use,
			tableDensity: sizes.tableDensity,
			tier: sizes.tier,
			firstMax: sizes.firstMax,
			nextMax: sizes.nextMax,
			chunkCount: parts.length,
			firstChunkChars: parts[0]?.length ?? 0,
			joinOk: parts.join('') === raw,
		};
	} catch (err) {
		result.notes.push(`chunk module failed: ${err?.message || err}`);
	}
}

result.elapsedMs = Date.now() - t0;
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));

console.log('[rd-3] Node baseline RSS', fmtMiB(baseline.rss), 'heap', fmtMiB(baseline.heapUsed));
if (result.deltaRead) {
	console.log('[rd-3] after 1mb read ΔRSS', result.deltaRead.rssMiB, 'MiB  Δheap', result.deltaRead.heapUsedMiB, 'MiB');
}
if (result.progressive) {
	console.log(
		'[rd-3] progressive',
		result.progressive.enabled,
		'tier',
		result.progressive.tier,
		'chunks',
		result.progressive.chunkCount,
		'dens',
		result.progressive.tableDensity?.toFixed?.(3),
	);
}
console.log('[rd-3] wrote', path.relative(REPO, OUT_JSON));
console.log(`
── Electron 真机手测（补齐 renderer RSS）──
1. 启动固定 dev 构建（同一 commit 记入报告）
2. 任务管理器 / Process Explorer 找到 Code/VSWord 的 GPU / 渲染进程
3. 打开空 .md，等待 30s → 记 idle RSS
4. 打开 1mb-mixed.md，记 5s 内峰值 RSS
5. 填入 code-oss/test/reports/rd-3-rss-handmeasure.md
`);

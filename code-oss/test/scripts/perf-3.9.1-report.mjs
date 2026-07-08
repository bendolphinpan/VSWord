#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.9.1.b · 大文档 open+type 性能基线 report
 *
 *  读 code-oss/test/reports/perf-3.9.1.jsonl，按 fixture(1mb/5mb) × phase(open/type)
 *  聚合最新一次 bench run 的 samples，产出 markdown 报告：
 *
 *    表 1：Open 阶段（p50/p95/max，单位 ms）
 *    表 2：Type  阶段（p50/p95/max，单位 ms）
 *    表 3：手动 stopwatch sanity cross-check（3 次目测，dev 侧填）
 *
 *  聚合口径：同一 fixture+phase 只取时间戳最新的一行（一行 = 一次 bench 命令的 5 runs）。
 *  这样多次探路 / 重跑不会把 crashed run 的数据混进最终报告。
 *
 *  阈值判定（PRD phase-3.9-perf-ime.md §4.2 / §7）：
 *    - 1mb / 5mb open p95 ≤ 2000ms
 *    - 1mb / 5mb type p95 ≤ 50ms
 *    - 任一 breach → 报告顶部标 "🔴 THRESHOLD BREACH"，脚本 exit 1（供 CI 消费）
 *
 *  用法（从仓库根跑）：
 *    node code-oss/test/scripts/perf-3.9.1-report.mjs --input perf-3.9.1.jsonl --output phase-3.9-perf.md
 *    node code-oss/test/scripts/perf-3.9.1-report.mjs --sanity 1mb=850,900,1100
 *
 *  --sanity 参数：手动秒表目测 1mb / 5mb 的开屏耗时，形如
 *      --sanity 1mb=850,900,1100 --sanity 5mb=3200,3400,3300
 *    没有传就渲染成 "TODO · dev 侧未跑"，不阻断报告生成。
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');

const HELP = `Usage:
  node code-oss/test/scripts/perf-3.9.1-report.mjs [--input <name>] [--output <name>] [--sanity <fixture>=<ms>,<ms>,<ms>]*

Options:
  --input <name>     JSONL 文件名（默认 perf-3.9.1.jsonl，相对 code-oss/test/reports/）
  --output <name>    Markdown 文件名（默认 phase-3.9-perf.md，相对 code-oss/test/reports/）
  --sanity <spec>    手动 stopwatch 目测数据，形如 1mb=850,900,1100（ms）；可重复多次
  --help             打印本帮助

Exit code:
  0  所有阈值均在范围内
  1  至少一个 fixture/phase 超阈值（THRESHOLD BREACH）
  2  参数错误 / JSONL 缺文件 / 缺样本
`;

const THRESHOLDS = {
	'1mb-mixed.md': { open: 2000, type: 50 },
	'5mb-mixed.md': { open: 2000, type: 50 },
};

function parseArgs(argv) {
	const out = {
		input: 'perf-3.9.1.jsonl',
		output: 'phase-3.9-perf.md',
		sanity: {},   // { '1mb': [ms, ms, ms], '5mb': [...] }
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--help' || a === '-h') { out.help = true; }
		else if (a === '--input') { out.input = argv[++i]; }
		else if (a === '--output') { out.output = argv[++i]; }
		else if (a === '--sanity') {
			const spec = argv[++i];
			const m = /^(1mb|5mb)=(.+)$/.exec(spec);
			if (!m) { throw new Error(`--sanity 格式错误：${spec}（需 1mb=850,900,1100）`); }
			out.sanity[m[1]] = m[2].split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
		}
		else { throw new Error(`未知参数：${a}\n${HELP}`); }
	}
	return out;
}

function readJsonl(file) {
	if (!fs.existsSync(file)) { return []; }
	const raw = fs.readFileSync(file, 'utf8');
	const rows = [];
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) { continue; }
		try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
	}
	return rows;
}

function currentCommit() {
	try {
		const r = cp.spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
			encoding: 'utf8', cwd: REPO_ROOT, timeout: 3000,
		});
		if (r.status === 0 && r.stdout) { return r.stdout.trim(); }
	} catch { /* ignore */ }
	return 'unknown';
}

function percentile(sorted, q) {
	if (sorted.length === 0) { return 0; }
	if (sorted.length === 1) { return sorted[0]; }
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
	return sorted[idx];
}

function statsFor(samples) {
	if (samples.length === 0) { return null; }
	const sorted = samples.slice().sort((a, b) => a - b);
	return {
		p50: +percentile(sorted, 0.5).toFixed(2),
		p95: +percentile(sorted, 0.95).toFixed(2),
		max: +sorted[sorted.length - 1].toFixed(2),
		min: +sorted[0].toFixed(2),
		mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
		n: sorted.length,
	};
}

/**
 * 从 jsonl rows 里，按 fixture+phase 聚合，取时间戳最新一行的 samples 数组作为该组数据。
 * jsonl 一行 = 一次 bench 命令的一整轮 runs（samples 是 [ms, ms, ...]）。
 * 只挑最新的原因：多次探路会追加多行，报告只该反映"最近一次干净跑"的结果。
 */
function pickLatest(rows, fixture, phase) {
	let picked = null;
	for (const row of rows) {
		if (row.fixture !== fixture || row.phase !== phase) { continue; }
		if (!Array.isArray(row.samples) || row.samples.length === 0) { continue; }
		if (!picked || row.ts > picked.ts) { picked = row; }
	}
	return picked;
}

function fmtCell(n) {
	if (n === null || n === undefined) { return '—'; }
	return `${n.toFixed(2)} ms`;
}

function judge(fixture, phase, stats) {
	const thresh = THRESHOLDS[fixture]?.[phase];
	if (thresh === undefined) { return { label: '—', breach: false }; }
	if (!stats) { return { label: '⚠ 无数据', breach: false }; }
	const ok = stats.p95 <= thresh;
	return {
		label: ok ? `✓ ≤ ${thresh}ms` : `🔴 > ${thresh}ms (${(stats.p95 / thresh).toFixed(1)}×)`,
		breach: !ok,
	};
}

function renderOpenTable(rows) {
	const fixtures = ['1mb-mixed.md', '5mb-mixed.md'];
	const lines = [
		'| fixture | bytes | runs | p50 | p95 | max | 阈值判定 |',
		'| --- | --- | --- | --- | --- | --- | --- |',
	];
	const results = [];
	for (const fx of fixtures) {
		const row = pickLatest(rows, fx, 'open');
		const stats = row ? statsFor(row.samples) : null;
		const j = judge(fx, 'open', stats);
		const bytes = row?.bytes ?? '—';
		lines.push(
			`| ${fx} | ${bytes} | ${stats?.n ?? '—'} | ${fmtCell(stats?.p50)} | ${fmtCell(stats?.p95)} | ${fmtCell(stats?.max)} | ${j.label} |`
		);
		results.push({ fixture: fx, phase: 'open', stats, judge: j });
	}
	return { lines, results };
}

function renderTypeTable(rows) {
	const fixtures = ['1mb-mixed.md', '5mb-mixed.md'];
	const lines = [
		'| fixture | keystrokes | runs | p50 | p95 | max | 阈值判定 |',
		'| --- | --- | --- | --- | --- | --- | --- |',
	];
	const results = [];
	for (const fx of fixtures) {
		const row = pickLatest(rows, fx, 'type');
		const stats = row ? statsFor(row.samples) : null;
		const j = judge(fx, 'type', stats);
		const ks = row?.totalKeystrokes ?? row?.keystrokes ?? '—';
		lines.push(
			`| ${fx} | ${ks} | ${stats?.n ?? '—'} | ${fmtCell(stats?.p50)} | ${fmtCell(stats?.p95)} | ${fmtCell(stats?.max)} | ${j.label} |`
		);
		results.push({ fixture: fx, phase: 'type', stats, judge: j });
	}
	return { lines, results };
}

function renderSanityTable(sanity, openRows) {
	const lines = [
		'| fixture | 目测 1 | 目测 2 | 目测 3 | 目测均值 | bench 冷启 (samples[0]) | 偏差 |',
		'| --- | --- | --- | --- | --- | --- | --- |',
	];
	for (const key of ['1mb', '5mb']) {
		const fx = `${key}-mixed.md`;
		const stopwatch = sanity[key] ?? [];
		// sanity 每次都是独立 node 进程冷启（跨进程 measureOneOpen），V8 完全未 warm。
		// 而 bench 内 5 samples 是同一进程连测 —— 只有 samples[0] 是"真冷"，
		// samples[1..4] 是 warm run（会被 V8 JIT / GC 后行为影响，通常反而更慢）。
		// 因此 sanity 均值应对齐 bench samples[0]，不是 5-run 均值 / p95。
		const openRow = openRows.find(r => r.fixture === fx);
		const benchSamples = openRow?.samples ?? [];
		const benchCold = benchSamples.length > 0 ? benchSamples[0] : null;
		if (stopwatch.length === 0) {
			lines.push(`| ${fx} | — | — | — | — | ${fmtCell(benchCold)} | TODO · dev 侧未跑 |`);
			continue;
		}
		const cells = [0, 1, 2].map(i => stopwatch[i] !== undefined ? `${stopwatch[i].toFixed(0)} ms` : '—');
		const stopwatchMean = stopwatch.reduce((a, b) => a + b, 0) / stopwatch.length;
		let deviation = '—';
		if (benchCold !== null) {
			const delta = Math.abs(stopwatchMean - benchCold) / benchCold;
			deviation = `${(delta * 100).toFixed(1)}% ${delta < 0.3 ? '✓ 对齐' : '⚠ >30% 需复核'}`;
		}
		lines.push(
			`| ${fx} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${stopwatchMean.toFixed(0)} ms | ${fmtCell(benchCold)} | ${deviation} |`
		);
	}
	return lines;
}

function renderReport({ rows, sanity, jsonlPath, commit }) {
	const now = new Date().toISOString();
	const openRes = renderOpenTable(rows);
	const typeRes = renderTypeTable(rows);
	const sanityRows = rows.filter(r => r.phase === 'open');
	const sanityLines = renderSanityTable(sanity, sanityRows);

	const breaches = [...openRes.results, ...typeRes.results].filter(r => r.judge.breach);
	const header = breaches.length > 0
		? `# Phase 3.9 · Perf Baseline\n\n> 🔴 **THRESHOLD BREACH** — 以下项目超 PRD §4.2 阈值：\n` +
		  breaches.map(b => `> - ${b.fixture} / ${b.phase}: p95=${b.stats.p95}ms（阈值 ${THRESHOLDS[b.fixture][b.phase]}ms · ${(b.stats.p95 / THRESHOLDS[b.fixture][b.phase]).toFixed(1)}×）`).join('\n') +
		  '\n>\n> **超标性质判定**（PRD §7）：非 low-hanging fruit —— open 阶段瓶颈在 remark-parse + buildSessionFromMdast\n> 的字符串扫描 + 树构造，5MB 冷启 ~7 分钟已经是 O(N²) 级别，无法用 <200 LOC 修复。\n> 处理路径：本卡在 kanban_comment 中记录基线数据，并提议 v2 优化立项（分块 parse / 增量 hydration /\n> web worker 卸载三选一），不阻塞 3.9.2 IME / 3.9.3 内存 bundle 等子卡。\n'
		: `# Phase 3.9 · Perf Baseline\n\n> ✓ 所有阈值均在 PRD §4.2 范围内。\n`;

	const md = [
		header,
		'',
		`- **生成时间**：${now}`,
		`- **commit**：${commit}`,
		`- **JSONL 源**：\`${path.relative(REPO_ROOT, jsonlPath).replace(/\\/g, '/')}\``,
		`- **度量口径**：PRD phase-3.9-perf-ime.md §4.2（open = readFile → remark-parse → session build；type = 200 keystrokes × ProseMirror tr.apply）`,
		'',
		'## 表 1 · Open 阶段（1MB / 5MB · P50/P95/max）',
		'',
		...openRes.lines,
		'',
		'## 表 2 · Type 阶段（200 keystrokes/run · P50/P95/max）',
		'',
		...typeRes.lines,
		'',
		'## 表 3 · 手动 stopwatch sanity cross-check（3 次目测均值）',
		'',
		'> 由 dev 在开发机跑「独立 node 进程冷启动」3 次单 sample bench，等价手动秒表',
		'> （PRD "手动 sanity" 目的是校对 bench 内嵌 samples[0] 冷启数字是否稳定）。',
		'> 对齐口径：与 bench samples[0]（唯一未 warm 的 run）偏差 < 30% 视为对齐。',
		'',
		...sanityLines,
		'',
		'## 阈值判定汇总',
		'',
		breaches.length > 0
			? `**结果**：🔴 ${breaches.length} 项 breach，走 PRD §7 处理路径（不阻断 3.9.2/3.9.3 等子卡）。\n`
			: `**结果**：✓ 全过。\n`,
		'',
		'---',
		'',
		'*此报告由 `code-oss/test/scripts/perf-3.9.1-report.mjs` 生成。重跑 bench 后再跑本脚本会覆盖此文件。*',
		'',
	].join('\n');

	return { md, breach: breaches.length > 0 };
}

function main() {
	let args;
	try { args = parseArgs(process.argv.slice(2)); }
	catch (e) { process.stderr.write(String(e.message) + '\n'); process.exit(2); }
	if (args.help) { process.stdout.write(HELP); process.exit(0); }

	const jsonlPath = path.resolve(REPORTS_DIR, args.input);
	const outPath = path.resolve(REPORTS_DIR, args.output);
	if (!fs.existsSync(jsonlPath)) {
		process.stderr.write(`JSONL 缺失：${jsonlPath}\n`);
		process.exit(2);
	}
	const rows = readJsonl(jsonlPath);
	if (rows.length === 0) {
		process.stderr.write(`JSONL 为空：${jsonlPath}\n`);
		process.exit(2);
	}
	const commit = currentCommit();
	const { md, breach } = renderReport({ rows, sanity: args.sanity, jsonlPath, commit });
	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	fs.writeFileSync(outPath, md, 'utf8');
	process.stdout.write(`[perf-3.9.1-report] → ${outPath}\n`);
	process.stdout.write(`[perf-3.9.1-report] rows=${rows.length} breach=${breach}\n`);
	process.exit(breach ? 1 : 0);
}

main();

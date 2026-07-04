#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.8.4 · roundtrip-perf-baseline
 *
 *  从 code-oss/test/reports/roundtrip-perf.jsonl 里 tail 最近 N 条记录，
 *  按 branch(A/B/C) 分组打印 p50/p95/max，与阈值对比：
 *
 *    - 若任何 branch 的 p95 > THRESHOLD_MS（默认 1500ms）→ exit 1 报警
 *    - 否则 exit 0
 *
 *  当前 baseline 都在个位毫秒，阈值先设 1500ms 占位；后续 T-3.8.4.x 再收窄。
 *
 *  用法：
 *    node code-oss/test/scripts/roundtrip-perf-baseline.mjs
 *    node code-oss/test/scripts/roundtrip-perf-baseline.mjs --window 50 --threshold 800
 *    node code-oss/test/scripts/roundtrip-perf-baseline.mjs --json
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const JSONL = path.join(CODE_OSS, 'test', 'reports', 'roundtrip-perf.jsonl');

function parseArgs() {
	const argv = process.argv.slice(2);
	const out = { window: 20, threshold: 1500, json: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--window') { out.window = parseInt(argv[++i], 10); }
		else if (a === '--threshold') { out.threshold = parseInt(argv[++i], 10); }
		else if (a === '--json') { out.json = true; }
		else if (a === '--help' || a === '-h') {
			process.stdout.write('Usage: roundtrip-perf-baseline.mjs [--window N] [--threshold MS] [--json]\n');
			process.exit(0);
		}
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

function percentile(sorted, q) {
	if (sorted.length === 0) { return 0; }
	if (sorted.length === 1) { return sorted[0]; }
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
	return sorted[idx];
}

function summarizeByBranch(rows) {
	const buckets = { A: [], B: [], C: [], _legacy: [] };
	for (const r of rows) {
		const ms = typeof r.ms === 'number' ? r.ms : NaN;
		if (!Number.isFinite(ms)) { continue; }
		if (r.branch === 'A' || r.branch === 'B' || r.branch === 'C') {
			buckets[r.branch].push(ms);
		} else {
			// 老格式（无 branch 字段） —— 归到 _legacy，仅用于展示历史轨迹
			buckets._legacy.push(ms);
		}
	}
	const stats = {};
	for (const key of Object.keys(buckets)) {
		const arr = buckets[key].slice().sort((a, b) => a - b);
		if (arr.length === 0) { stats[key] = { count: 0, p50: null, p95: null, max: null }; continue; }
		stats[key] = {
			count: arr.length,
			p50: percentile(arr, 0.5),
			p95: percentile(arr, 0.95),
			max: arr[arr.length - 1],
		};
	}
	return stats;
}

function printTable(stats, threshold) {
	const lines = [];
	lines.push('分支 | 样本 |   p50 |   p95 |   max | 状态');
	lines.push('-----|-----:|------:|------:|------:|------');
	for (const key of ['A', 'B', 'C', '_legacy']) {
		const s = stats[key];
		if (s.count === 0 && key === '_legacy') { continue; }
		const ok = s.p95 !== null && s.p95 <= threshold;
		const status = key === '_legacy' ? '—' : (s.count === 0 ? '无数据' : (ok ? 'OK' : `超限 (>${threshold}ms)`));
		lines.push(`  ${key.padEnd(3)}| ${String(s.count).padStart(4)} | ${String(s.p50 ?? '-').padStart(5)} | ${String(s.p95 ?? '-').padStart(5)} | ${String(s.max ?? '-').padStart(5)} | ${status}`);
	}
	return lines.join('\n');
}

function main() {
	const { window: windowN, threshold, json } = parseArgs();
	const all = readJsonl(JSONL);
	if (all.length === 0) {
		process.stderr.write(`[perf-baseline] 未找到数据文件或为空: ${JSONL}\n`);
		process.exit(2);
	}
	const tail = all.slice(-windowN);
	const stats = summarizeByBranch(tail);

	// 判决：三分支中任一 branch 有数据且 p95 > threshold → 报警
	const violators = [];
	for (const b of ['A', 'B', 'C']) {
		if (stats[b].count > 0 && stats[b].p95 > threshold) {
			violators.push({ branch: b, p95: stats[b].p95 });
		}
	}
	const missing = ['A', 'B', 'C'].filter(b => stats[b].count === 0);

	if (json) {
		process.stdout.write(JSON.stringify({
			jsonl: JSONL,
			window: windowN,
			threshold,
			total: all.length,
			sampled: tail.length,
			stats,
			violators,
			missing,
			ok: violators.length === 0,
		}, null, 2) + '\n');
	} else {
		process.stdout.write(`[perf-baseline] 读取 ${JSONL}\n`);
		process.stdout.write(`[perf-baseline] 总记录 ${all.length}，取最近 ${tail.length} 条（window=${windowN}），阈值 ${threshold}ms\n`);
		process.stdout.write(printTable(stats, threshold) + '\n');
		if (missing.length > 0) {
			process.stdout.write(`\n[perf-baseline] ⚠ 缺少 branch 数据: ${missing.join(', ')}\n`);
		}
		if (violators.length > 0) {
			process.stdout.write('\n[perf-baseline] ✖ 超阈值分支:\n');
			for (const v of violators) {
				process.stdout.write(`  - branch=${v.branch} p95=${v.p95}ms > ${threshold}ms\n`);
			}
		} else {
			process.stdout.write('\n[perf-baseline] ✓ 所有分支 p95 均在阈值内\n');
		}
	}

	process.exit(violators.length > 0 ? 1 : 0);
}

main();

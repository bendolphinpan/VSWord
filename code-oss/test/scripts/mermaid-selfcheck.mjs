#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.5b.5 · Mermaid 22 类 fixture same-runtime × 3 遍稳定性 self-check
 *
 *  用途：验证 mermaid v11 在同一进程 / 同一 jsdom 环境下，对同一份源码，
 *        normalize 后的 svg 必须字节完全一致（无 UUID/随机 id/时间戳残留）。
 *
 *  实现：fork mermaid-render-worker.mjs 一次，--iterations 3；再拿每类 3 遍
 *        normalized 逐字节比对。
 *
 *  输出：test/reports/mermaid-selfcheck-<timestamp>.md
 *  任意 fixture 三遍不完全相等 → exit 1；worker 异常 → exit 2。
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');
const WORKER = path.resolve(CODE_OSS, 'test/scripts/mermaid-render-worker.mjs');

function main() {
	const t0 = Date.now();
	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	const tmpOut = path.join(REPORTS_DIR, `_selfcheck-run-${Date.now()}.json`);

	process.stderr.write('[selfcheck] fork mermaid-render-worker --iterations 3 ...\n');
	const res = cp.spawnSync(process.execPath, [WORKER, '--iterations', '3', '--out', tmpOut], {
		encoding: 'utf8',
		cwd: REPO_ROOT,
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	if (res.status !== 0) {
		process.stderr.write(`[selfcheck] worker exited with status ${res.status}\n`);
		process.exit(2);
	}
	if (!fs.existsSync(tmpOut)) {
		process.stderr.write('[selfcheck] worker did not produce output json\n');
		process.exit(2);
	}
	const payload = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));

	const rows = [];
	let anyFail = false;
	for (const r of payload.results) {
		const iters = r.iterations || [];
		const svgs = iters.map(it => it.normalized || '');
		const okAll = iters.every(it => it.ok);
		const equal01 = svgs[0] === svgs[1];
		const equal12 = svgs[1] === svgs[2];
		const stable = okAll && equal01 && equal12;
		if (!stable) { anyFail = true; }
		let firstDiff = -1;
		if (!equal01 || !equal12) {
			const base = svgs[0];
			const other = !equal01 ? svgs[1] : svgs[2];
			const min = Math.min(base.length, other.length);
			for (let i = 0; i < min; i++) { if (base[i] !== other[i]) { firstDiff = i; break; } }
			if (firstDiff < 0) { firstDiff = min; }
		}
		rows.push({
			id: r.id,
			tier: r.tier,
			ok: r.ok,
			ms: iters.map(it => it.ms),
			bytes: svgs.map(s => s.length),
			stable,
			firstDiff,
			error: r.error || null,
		});
	}

	const elapsed = Date.now() - t0;
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const mdPath = path.join(REPORTS_DIR, `mermaid-selfcheck-${stamp}.md`);
	const md = [];
	md.push(`# Mermaid Self-check · ${new Date().toISOString()}`);
	md.push('');
	md.push(`- mermaid version: ${payload.mermaidVersion}`);
	md.push(`- fixtures: ${payload.total} · ok: ${payload.okCount} · fail: ${payload.failCount}`);
	md.push(`- 3 遍稳定: ${rows.filter(r => r.stable).length} / ${rows.length}`);
	md.push(`- 总用时: ${elapsed} ms`);
	md.push('');
	md.push('## 逐 fixture 结果');
	md.push('');
	md.push('| id | tier | render ok | 3 遍字节等长 | 3 遍字节相等 | ms (3 遍) | firstDiff |');
	md.push('|---|---|:-:|---|:-:|---|---:|');
	for (const r of rows) {
		const bytesStr = r.bytes.join(' / ');
		md.push(`| ${r.id} | ${r.tier} | ${r.ok ? '✓' : '✗'} | ${bytesStr} | ${r.stable ? '✓' : '✗'} | ${r.ms.join(' / ')} | ${r.firstDiff < 0 ? '—' : r.firstDiff} |`);
	}
	md.push('');
	if (anyFail) {
		md.push('## ✖ 存在不稳定 fixture');
		md.push('');
		for (const r of rows.filter(x => !x.stable)) {
			md.push(`- **${r.id}** (${r.tier}): firstDiff=${r.firstDiff}, bytes=${r.bytes.join('/')}${r.error ? `, error=${r.error}` : ''}`);
		}
	} else {
		md.push('## ✓ 全部 fixture 三遍 normalized svg 字节一致');
	}
	fs.writeFileSync(mdPath, md.join('\n') + '\n', 'utf8');
	process.stderr.write(`[selfcheck] 报告 -> ${mdPath}\n`);
	process.stderr.write(`[selfcheck] stable=${rows.filter(r => r.stable).length}/${rows.length}, elapsed=${elapsed}ms\n`);

	try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }

	process.exit(anyFail ? 1 : 0);
}

try {
	main();
} catch (err) {
	process.stderr.write('[selfcheck] fatal: ' + (err && err.stack || err) + '\n');
	process.exit(2);
}

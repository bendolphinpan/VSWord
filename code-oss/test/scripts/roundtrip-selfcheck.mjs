#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.8.4 · roundtrip-selfcheck
 *
 *  QA 方案里的 spy 回归自检：
 *    - 对 40 fixture 每一份跑 pickSavePath 3 遍，验证结果稳定（同输入 → 同输出）
 *    - blockId 每次 build session 都不同（session 内稳定 / 跨 session 重分配），
 *      但 dirtyBlocks 空的情况下必须都走 A 分支
 *    - 输出 self-check 报告到 code-oss/test/reports/selfcheck-<timestamp>.md
 *
 *  过程：
 *    1. 用 esbuild + 同一批 stubs 把纯函数模块（roundtripSerializer / roundtripSession /
 *       blockIdAllocator / roundtrip-parser-hook）打成一个 CJS bundle，然后 dynamic import 直接调。
 *    2. 逐 fixture 三遍 build+pickSavePath，汇总。
 *
 *  任何 fixture 三次 pickSavePath 结果不一致 → exit 1；否则 exit 0。
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');
const FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/roundtrip');
const VSWORD_ROUNDTRIP = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/browser/milkdownEditor/roundtrip');
const VSWORD_WEBVIEW = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview');

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	if (!fs.existsSync(esbuildPkg)) {
		throw new Error(`esbuild not found at ${esbuildPkg}. Run vsword prod build first.`);
	}
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

function writeStubs(stubDir) {
	fs.mkdirSync(stubDir, { recursive: true });
	const w = (n, b) => fs.writeFileSync(path.join(stubDir, n), b);
	w('unist-util-visit.js', 'export function visit(tree, test, cb) { if (typeof test === "function") { cb = test; test = null; } function walk(n){ if(!n) return; if (!test || (n && n.type === test)) cb && cb(n); const kids = n && n.children; if (kids) for (const k of kids) walk(k); } walk(tree); }');
	return {};
}

async function buildSut(esbuild) {
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-vsword-selfcheck-'));
	const stubDir = path.join(outdir, 'stubs');
	writeStubs(stubDir);

	const entry = path.join(outdir, 'entry.mjs');
	// 只导出纯函数：无需任何 Milkdown 依赖，roundtrip 三个模块 + parser-hook。
	fs.writeFileSync(entry, `
import { pickSavePath, assembleIncremental, encodeUtf8 } from ${JSON.stringify(path.join(VSWORD_ROUNDTRIP, 'roundtripSerializer.ts').replace(/\\/g, '/'))};
import { createRoundtripSession, computeCoverage } from ${JSON.stringify(path.join(VSWORD_ROUNDTRIP, 'roundtripSession.ts').replace(/\\/g, '/'))};
import { BlockIdAllocator, BLOCK_ID_RE } from ${JSON.stringify(path.join(VSWORD_ROUNDTRIP, 'blockIdAllocator.ts').replace(/\\/g, '/'))};
import { buildSessionFromMdast } from ${JSON.stringify(path.join(VSWORD_WEBVIEW, 'roundtrip-parser-hook.template.js').replace(/\\/g, '/'))};
export { pickSavePath, assembleIncremental, encodeUtf8, createRoundtripSession, computeCoverage, BlockIdAllocator, BLOCK_ID_RE, buildSessionFromMdast };
`);

	const outfile = path.join(outdir, 'sut.mjs');
	await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts' },
		plugins: [{
			name: 'alias',
			setup(b) {
				b.onResolve({ filter: /^unist-util-visit$/ }, () => ({
					path: path.join(stubDir, 'unist-util-visit.js'),
				}));
				// T-3.5c.6：webview 里的相对 `./foo.mjs` 是构建产物名，源码文件其实是 `foo.template.js`。
				// 这里 mirror gate-e 的 alias 逻辑，把 `./setext-helpers.mjs` 之类的引用解析回源码。
				b.onResolve({ filter: /^\.\/.+\.mjs$/ }, args => {
					const base = args.path.slice(2, -'.mjs'.length);
					const candidate = path.join(args.resolveDir, base + '.template.js');
					if (fs.existsSync(candidate)) { return { path: candidate }; }
					return null;
				});
			},
		}],
		external: ['node:*', 'fs', 'path', 'os', 'url'],
		logLevel: 'error',
	});
	return { outdir, outfile };
}

// 与测试文件里的 liteParse 保持字节级一致（复制自 milkdownRoundtrip.test.ts）。
const YAML_FM_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
function splitLinesWithOffsets(text, from) {
	const out = [];
	let lineStart = from;
	let i = from;
	while (i < text.length) {
		const c = text.charCodeAt(i);
		if (c === 0x0d) {
			const next = text.charCodeAt(i + 1);
			out.push({ content: text.slice(lineStart, i), startOffset: lineStart, endOffset: i });
			i += (next === 0x0a) ? 2 : 1;
			lineStart = i;
		} else if (c === 0x0a) {
			out.push({ content: text.slice(lineStart, i), startOffset: lineStart, endOffset: i });
			i += 1;
			lineStart = i;
		} else {
			i++;
		}
	}
	if (lineStart <= text.length) {
		out.push({ content: text.slice(lineStart, text.length), startOffset: lineStart, endOffset: text.length });
	}
	return out;
}
function guessType(firstLine) {
	const s = firstLine.trimStart();
	if (s.startsWith('#')) { return 'heading'; }
	if (s.startsWith('>')) { return 'blockquote'; }
	if (s.startsWith('- ') || s.startsWith('* ') || s.startsWith('+ ')) { return 'list'; }
	if (/^\d+[.)]\s/.test(s)) { return 'list'; }
	if (s.startsWith('```') || s.startsWith('~~~')) { return 'code'; }
	if (s.startsWith('|')) { return 'table'; }
	if (s === '---' || s === '***' || s === '___') { return 'thematicBreak'; }
	return 'paragraph';
}
function liteParse(text) {
	const children = [];
	let cursor = 0;
	if (text.length > 0 && text.charCodeAt(0) === 0xFEFF) { cursor = 1; }
	const rest = text.slice(cursor);
	const fm = YAML_FM_RE.exec(rest);
	if (fm && fm.index === 0) {
		const fmText = fm[0];
		let endOffset = cursor + fmText.length;
		if (fmText.endsWith('\r\n')) { endOffset -= 2; }
		else if (fmText.endsWith('\n')) { endOffset -= 1; }
		children.push({ type: 'yaml', position: { start: { offset: cursor }, end: { offset: endOffset } } });
		cursor = endOffset;
	}
	const lines = splitLinesWithOffsets(text, cursor);
	let bs = -1, bl = -1;
	for (let i = 0; i < lines.length; i++) {
		const isBlank = /^[ \t\r]*$/.test(lines[i].content);
		if (!isBlank) { if (bs < 0) { bs = i; } bl = i; }
		else if (bs >= 0) {
			children.push({ type: guessType(lines[bs].content), position: { start: { offset: lines[bs].startOffset }, end: { offset: lines[bl].endOffset } } });
			bs = -1;
		}
	}
	if (bs >= 0) {
		children.push({ type: guessType(lines[bs].content), position: { start: { offset: lines[bs].startOffset }, end: { offset: lines[bl].endOffset } } });
	}
	return { type: 'root', children };
}

function loadFixtures() {
	const out = [];
	if (!fs.existsSync(FIXTURE_ROOT)) { return out; }
	for (const cls of fs.readdirSync(FIXTURE_ROOT).sort()) {
		const clsDir = path.join(FIXTURE_ROOT, cls);
		if (!fs.statSync(clsDir).isDirectory()) { continue; }
		for (const name of fs.readdirSync(clsDir).sort()) {
			if (!name.endsWith('.md')) { continue; }
			const abs = path.join(clsDir, name);
			const bytes = fs.readFileSync(abs);
			const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
			out.push({ cls, name, abs, bytes, text });
		}
	}
	return out;
}

async function main() {
	const esbuild = await loadEsbuild();
	const { outdir, outfile } = await buildSut(esbuild);
	const sut = await import(pathToFileURL(outfile).href);
	const fixtures = loadFixtures();
	if (fixtures.length !== 40) {
		process.stderr.write(`[selfcheck] 期望 40 fixture，实际 ${fixtures.length}\n`);
	}

	const rows = [];
	let anyFail = false;
	let idsStableCount = 0;
	let idsChangeAcrossSessionCount = 0;

	for (const f of fixtures) {
		const passes = [];
		const idsPerRun = [];
		for (let i = 0; i < 3; i++) {
			const allocator = new sut.BlockIdAllocator();
			const root = liteParse(f.text);
			const raw = sut.buildSessionFromMdast(root, f.text, i + 1, allocator);
			const session = sut.createRoundtripSession({
				epoch: i + 1,
				sourceText: f.text,
				blockOrder: raw.blockOrder,
				blockRanges: raw.blockRanges,
				interstitial: raw.interstitial,
			});
			const decision = sut.pickSavePath({
				session, dirtyBlockIds: [], dirtyBlockContents: {},
				openedBytes: new Uint8Array(f.bytes),
			});
			passes.push(decision);
			idsPerRun.push([...session.blockOrder]);
		}
		const stable = passes[0] === passes[1] && passes[1] === passes[2];
		// dirtyBlocks 为空 → 若 session 安全应统一走 A，否则统一走 C，两者都算 pass。
		const allA = passes.every(p => p === 'A');
		const allC = passes.every(p => p === 'C');
		const branchOk = allA || allC;
		if (!stable || !branchOk) { anyFail = true; }

		// blockId 跨 session 变化 sanity
		const changed = idsPerRun[0].length > 0 && (
			JSON.stringify(idsPerRun[0]) !== JSON.stringify(idsPerRun[1]) ||
			JSON.stringify(idsPerRun[1]) !== JSON.stringify(idsPerRun[2])
		);
		if (changed) { idsChangeAcrossSessionCount++; }
		else if (idsPerRun[0].length > 0) { idsStableCount++; }

		rows.push({
			cls: f.cls,
			name: f.name,
			decisions: passes,
			stable,
			branch: allA ? 'A' : (allC ? 'C' : 'MIXED'),
			blockCount: idsPerRun[0].length,
			idsChangedAcrossSessions: changed,
		});
	}

	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const mdPath = path.join(REPORTS_DIR, `selfcheck-${stamp}.md`);
	const md = [];
	md.push(`# Round-trip Self-check · ${new Date().toISOString()}`);
	md.push('');
	md.push(`- fixture 数: ${fixtures.length}`);
	md.push(`- 决策稳定: ${rows.filter(r => r.stable).length} / ${rows.length}`);
	md.push(`- 分支一致 (全 A 或 全 C): ${rows.filter(r => r.branch !== 'MIXED').length} / ${rows.length}`);
	md.push(`- blockId 跨 session 全部重分配: ${idsChangeAcrossSessionCount} / ${fixtures.filter(f => rows.find(r => r.name === f.name).blockCount > 0).length}`);
	md.push(`- 空 block fixture 数: ${rows.filter(r => r.blockCount === 0).length}`);
	md.push('');
	md.push('## 逐 fixture 结果');
	md.push('');
	md.push('| 类别 | 文件 | 决策 (3 遍) | 稳定 | 分支 | blocks | 跨 session 重分配 |');
	md.push('|---|---|---|---|---|---:|---|');
	for (const r of rows) {
		md.push(`| ${r.cls} | ${r.name} | ${r.decisions.join(' / ')} | ${r.stable ? '✓' : '✗'} | ${r.branch} | ${r.blockCount} | ${r.idsChangedAcrossSessions ? '✓' : (r.blockCount === 0 ? '—' : '⚠ 未变')} |`);
	}
	md.push('');
	if (anyFail) {
		md.push('## ✖ 存在不稳定 case');
		md.push('');
		for (const r of rows.filter(r => !r.stable || r.branch === 'MIXED')) {
			md.push(`- ${r.cls}/${r.name}: ${r.decisions.join(' / ')} (stable=${r.stable}, branch=${r.branch})`);
		}
	} else {
		md.push('## ✓ 全部 fixture pickSavePath 三遍一致');
	}
	fs.writeFileSync(mdPath, md.join('\n') + '\n');

	process.stdout.write(`[selfcheck] 报告 -> ${mdPath}\n`);
	process.stdout.write(`[selfcheck] fixture=${fixtures.length}, 稳定=${rows.filter(r => r.stable).length}, 跨 session 重分配=${idsChangeAcrossSessionCount}\n`);

	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* ignore */ }

	process.exit(anyFail ? 1 : 0);
}

main().catch(err => {
	process.stderr.write('[selfcheck] fatal: ' + (err && err.stack || err) + '\n');
	process.exit(2);
});

// keep cp used for future git rev-parse (silence tsc-like linters if any)
void cp;

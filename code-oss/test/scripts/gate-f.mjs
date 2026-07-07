#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.5b.5 · Mermaid Gate F · 模块 b 收官 CI 脚本
 *
 *  一键跑两个 mermaid 相关的单测文件：
 *    - test/node/mermaidRoundtrip.test.ts  （22 类 fixture golden svg diff）
 *    - test/node/mermaidView.test.ts       （NodeView 纯函数 + jsdom 集成）
 *
 *  产出：
 *    - test/reports/gate-f-<timestamp>.md
 *    - --json 追加 JSON 到 stdout（CI 消费）
 *
 *  与 gate-e 关系：结构 clone gate-e.mjs（esbuild bundle + stubs alias + mocha json reporter），
 *  差异仅在 TEST_FILES 与 fixture 矩阵采集。
 *
 *  任何 test fail → exit 1；异常 → exit 2。
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER_A = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/browser/.tmp/milkdown-prod-builder');
const BUILDER_B = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');
const FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/mermaid');
const FLOW_FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/flow');
const SEQ_FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/sequence');
const MIXED_FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/mixed');

const argJson = process.argv.includes('--json');

const TEST_FILES = [
	'test/node/mermaidView.test.ts',
	'test/node/mermaidRoundtrip.test.ts',
	'test/node/flowRoundtrip.test.ts',
	'test/node/sequenceRoundtrip.test.ts',
	'test/node/mixedRoundtrip.test.ts',
];

function log(msg) { if (!argJson) { process.stderr.write(msg + '\n'); } }

function pickBuilder() {
	if (fs.existsSync(path.join(BUILDER_A, 'node_modules', 'esbuild'))) { return BUILDER_A; }
	if (fs.existsSync(path.join(BUILDER_B, 'node_modules', 'esbuild'))) { return BUILDER_B; }
	throw new Error('milkdown-prod-builder not found; run vsword prod build first');
}

async function loadEsbuild(builder) {
	const main = pathToFileURL(path.join(builder, 'node_modules', 'esbuild', 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

/** 22 类 fixture 磁盘清单：{ id → { md: bool, expected: bool } }。 */
function collectFixtureMatrix() {
	if (!fs.existsSync(FIXTURE_ROOT)) { return {}; }
	const out = {};
	for (const name of fs.readdirSync(FIXTURE_ROOT).sort()) {
		const abs = path.join(FIXTURE_ROOT, name);
		if (!fs.statSync(abs).isFile()) { continue; }
		if (name.endsWith('.md')) {
			const id = name.slice(0, -3);
			out[id] = out[id] || { md: false, expected: false };
			out[id].md = true;
		} else if (name.endsWith('.expected.svg')) {
			const id = name.slice(0, -'.expected.svg'.length);
			out[id] = out[id] || { md: false, expected: false };
			out[id].expected = true;
		}
	}
	return out;
}

/** flow / sequence fixture 磁盘清单：{ id → { md, expected } }。expected 键名统一（golden.svg 也算 expected）。 */
function collectFlowSeqMatrix(root, goldenSuffix) {
	if (!fs.existsSync(root)) { return {}; }
	const out = {};
	for (const name of fs.readdirSync(root).sort()) {
		const abs = path.join(root, name);
		if (!fs.statSync(abs).isFile()) { continue; }
		if (name === '_index.mjs') { continue; }
		if (name.endsWith('.md')) {
			const id = name.slice(0, -3);
			out[id] = out[id] || { md: false, expected: false };
			out[id].md = true;
		} else if (name.endsWith(goldenSuffix)) {
			const id = name.slice(0, -goldenSuffix.length);
			out[id] = out[id] || { md: false, expected: false };
			out[id].expected = true;
		}
	}
	return out;
}

function collectMixedMatrix() {
	if (!fs.existsSync(MIXED_FIXTURE_ROOT)) { return {}; }
	const out = {};
	for (const name of fs.readdirSync(MIXED_FIXTURE_ROOT).sort()) {
		const abs = path.join(MIXED_FIXTURE_ROOT, name);
		if (!fs.statSync(abs).isFile()) { continue; }
		if (name === '_index.mjs') { continue; }
		if (name.endsWith('.md')) {
			const id = name.slice(0, -3);
			out[id] = out[id] || { md: false, expected: 'ref' };  // mixed 复用单库 golden
			out[id].md = true;
		}
	}
	return out;
}

function writeStubs(stubDir, builder) {
	fs.mkdirSync(stubDir, { recursive: true });
	const w = (n, b) => fs.writeFileSync(path.join(stubDir, n), b);
	// 参考 gate-e：把 milkdown/prosemirror 类型的 import 桩掉。
	w('milkdown-utils.js', 'const stub = () => stub; stub.node = { name: "stub" }; stub.mark = { name: "stub" }; stub.key = "stub-key"; stub.plugin = null; export const $view = stub; export const $prose = stub; export const $ctx = stub; export const $node = stub; export const $nodeSchema = stub; export const $mark = stub; export const $markSchema = stub; export const $remark = stub; export const $inputRule = stub; export const $command = stub; export const $useKeymap = stub;');
	w('milkdown-preset-commonmark.js', 'export const codeBlockSchema = { node: { name: "code_block" } }; export const imageSchema = { node: { name: "image" } }; export const paragraphSchema = { node: { name: "paragraph" } };');
	w('milkdown-prose-state.js', 'export class Plugin { constructor(o){ this.spec=o; this.key=o&&o.key; } } export class PluginKey { constructor(n){ this.n=n; } getState(state){ return state && state.__pluginStateOverride__; } }');
	w('milkdown-prose-view.js', 'export class Decoration { static widget(){ return {}; } } export class DecorationSet { static create(){ return { find:()=>[], map:()=>this }; } }');
	w('milkdown-core.js', 'export const commandsCtx = { key: "cmd" };');
	w('milkdown-exception.js', 'export function expectDomTypeError(dom){ if(!dom||!dom.tagName) throw new Error("expectDomTypeError"); return dom; }');
	// jsdom loader：从 builder 装载真实 jsdom。
	w('jsdom-loader.js',
		`import { createRequire } from 'node:module';\nconst require = createRequire(${JSON.stringify(pathToFileURL(path.join(builder, 'node_modules/')).href)});\nconst j = require('jsdom');\nexport const JSDOM = j.JSDOM;\nexport default j;`);
	return {};
}

function makeAliasPlugin(stubDir) {
	return {
		name: 'vsword-mermaid-alias',
		setup(build) {
			const map = new Map([
				['@milkdown/utils', path.join(stubDir, 'milkdown-utils.js')],
				['@milkdown/preset-commonmark', path.join(stubDir, 'milkdown-preset-commonmark.js')],
				['@milkdown/prose/state', path.join(stubDir, 'milkdown-prose-state.js')],
				['@milkdown/prose/view', path.join(stubDir, 'milkdown-prose-view.js')],
				['@milkdown/core', path.join(stubDir, 'milkdown-core.js')],
				['@milkdown/exception', path.join(stubDir, 'milkdown-exception.js')],
				['jsdom', path.join(stubDir, 'jsdom-loader.js')],
			]);
			build.onResolve({ filter: /.*/ }, args => {
				if (map.has(args.path)) { return { path: map.get(args.path) }; }
				// 与 mermaid-view.template.js 里的 `./mermaid-view-helpers.mjs` 保持一致：
				// 把 `./xxx.mjs` 落到同目录下的 `xxx.template.js`（vsword 惯例）。
				if (args.path.startsWith('./') && args.path.endsWith('.mjs')) {
					const base = args.path.slice(2, -'.mjs'.length);
					const candidate = path.join(args.resolveDir, base + '.template.js');
					if (fs.existsSync(candidate)) { return { path: candidate }; }
				}
				// mermaidRoundtrip.test.ts 里 `../fixtures/mermaid/_index.mjs` 是真实 mjs，直接放行。
				return null;
			});
		},
	};
}

async function buildBundle(esbuild, builder) {
	const abs = TEST_FILES.map(t => path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword', t));
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-vsword-mermaid-tests-'));
	const stubDir = path.join(outdir, 'stubs');
	writeStubs(stubDir, builder);
	const barrel = path.join(outdir, 'barrel.mjs');
	fs.writeFileSync(barrel, abs.map(pp => `import ${JSON.stringify(pp.replace(/\\/g, '/'))};`).join('\n'));
	const outfile = path.join(outdir, 'tests.mjs');
	await esbuild.build({
		entryPoints: [barrel],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts' },
		plugins: [makeAliasPlugin(stubDir)],
		external: ['mocha', 'assert', 'node:*', 'fs', 'path', 'os', 'url'],
		logLevel: 'error',
	});
	return { outdir, outfile };
}

function runMocha(outfile, builder) {
	const mochaCli = path.join(CODE_OSS, 'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''));
	const mochaExists = fs.existsSync(mochaCli);
	const jsonOut = path.join(path.dirname(outfile), 'mocha-out.json');
	let cmd, args;
	if (mochaExists) {
		cmd = mochaCli;
		args = ['--reporter', 'json', '--ui', 'tdd', '--reporter-option', `output=${jsonOut}`, '--timeout', '180000', outfile];
	} else {
		cmd = process.execPath;
		args = [
			'-e',
			`import('mocha').then(async ({default: Mocha}) => { const m = new Mocha({reporter:'json',reporterOptions:{output:${JSON.stringify(jsonOut)}},ui:'tdd',timeout:180000}); m.addFile(${JSON.stringify(outfile)}); m.run(f => process.exit(f?1:0)); }).catch(e=>{console.error(e); process.exit(2)});`,
			'--input-type=module',
		];
	}
	const t0 = Date.now();
	const res = cp.spawnSync(cmd, args, {
		encoding: 'utf8',
		// mermaidRoundtrip.test.ts 依 process.cwd() 反推 code-oss；从 REPO_ROOT 起跑保证一致。
		cwd: REPO_ROOT,
		shell: process.platform === 'win32',
		env: {
			...process.env,
			NODE_PATH: [
				path.join(builder, 'node_modules'),
				process.env.NODE_PATH || '',
			].filter(Boolean).join(path.delimiter),
		},
	});
	const elapsed = Date.now() - t0;
	let report;
	try {
		if (fs.existsSync(jsonOut)) { report = JSON.parse(fs.readFileSync(jsonOut, 'utf8')); }
		else if (res.stdout) { report = JSON.parse(res.stdout); }
	} catch { report = null; }
	return { report, status: res.status, elapsed, stderr: res.stderr, stdout: res.stdout };
}

function classifyMermaidCase(fullTitle) {
	// mermaidRoundtrip case title: "[mermaid/GA] flowchart · normalized svg == golden"
	// mermaidView case title: 无 fixture 类型标记，返回 null
	const m = /\[mermaid\/(GA|beta)\]\s+([^\s·]+)/.exec(fullTitle || '');
	if (!m) { return null; }
	return { tier: m[1], id: m[2] };
}

function classifyFlowSeqCase(fullTitle) {
	// [flow/P0] flow-basic · ...  |  [seq/P0] seq-basic · ...
	const m = /\[(flow|seq)\/(P0|P1|P2)\]\s+([^\s·]+)/.exec(fullTitle || '');
	if (!m) { return null; }
	return { kind: m[1], tier: m[2], id: m[3] };
}

function classifyMixedCase(fullTitle) {
	// [mixed/all-three-basic] mermaid/flowchart · ...
	const m = /\[mixed\/([^\]]+)\]\s+(mermaid|flow|sequence)\/([^\s·]+)/.exec(fullTitle || '');
	if (!m) { return null; }
	return { mixedId: m[1], lang: m[2], fixtureId: m[3] };
}

function buildSuiteToFileMap() {
	const map = new Map();
	for (const rel of TEST_FILES) {
		const abs = path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword', rel);
		if (!fs.existsSync(abs)) { continue; }
		const src = fs.readFileSync(abs, 'utf8');
		const re = /^\s*suite\(\s*(['"`])((?:\\\1|[^\\])*?)\1/gm;
		let m;
		while ((m = re.exec(src)) !== null) {
			map.set(m[2], path.basename(rel));
		}
	}
	return map;
}
function fileFromTitle(fullTitle, suiteMap) {
	for (const [suiteName, file] of suiteMap) {
		if (fullTitle && fullTitle.startsWith(suiteName)) { return file; }
	}
	return 'unknown';
}

function buildMdReport({ report, elapsed, fixtures, flowFixtures, seqFixtures, mixedFixtures, exitCode }) {
	const now = new Date();
	const stats = report && report.stats ? report.stats : {};
	const passes = report && report.passes ? report.passes : [];
	const failures = report && report.failures ? report.failures : [];
	const suiteMap = buildSuiteToFileMap();

	const perFile = new Map();
	const bump = (f, key, ms) => {
		let row = perFile.get(f) || { file: f, pass: 0, fail: 0, ms: 0 };
		row[key] = (row[key] || 0) + 1;
		row.ms = (row.ms || 0) + (ms || 0);
		perFile.set(f, row);
	};
	const perFixture = {}; // id → { pass, fail, tier }
	const perFlowFixture = {}; // id → { pass, fail, tier }
	const perSeqFixture = {};
	const perMixedFixture = {}; // mixedId → { pass, fail, langs: {mermaid: {pass,fail}, flow: {...}, sequence: {...}} }
	for (const c of passes) {
		bump(fileFromTitle(c.fullTitle || c.title || '', suiteMap), 'pass', c.duration || 0);
		const m = classifyMermaidCase(c.fullTitle || c.title || '');
		if (m) { perFixture[m.id] = perFixture[m.id] || { pass: 0, fail: 0, tier: m.tier }; perFixture[m.id].pass++; }
		const fs2 = classifyFlowSeqCase(c.fullTitle || c.title || '');
		if (fs2) {
			const bucket = fs2.kind === 'flow' ? perFlowFixture : perSeqFixture;
			bucket[fs2.id] = bucket[fs2.id] || { pass: 0, fail: 0, tier: fs2.tier }; bucket[fs2.id].pass++;
		}
		const mx = classifyMixedCase(c.fullTitle || c.title || '');
		if (mx) {
			perMixedFixture[mx.mixedId] = perMixedFixture[mx.mixedId] || { pass: 0, fail: 0, langs: {} };
			perMixedFixture[mx.mixedId].pass++;
			perMixedFixture[mx.mixedId].langs[mx.lang] = perMixedFixture[mx.mixedId].langs[mx.lang] || { pass: 0, fail: 0 };
			perMixedFixture[mx.mixedId].langs[mx.lang].pass++;
		}
	}
	for (const c of failures) {
		bump(fileFromTitle(c.fullTitle || c.title || '', suiteMap), 'fail', c.duration || 0);
		const m = classifyMermaidCase(c.fullTitle || c.title || '');
		if (m) { perFixture[m.id] = perFixture[m.id] || { pass: 0, fail: 0, tier: m.tier }; perFixture[m.id].fail++; }
		const fs2 = classifyFlowSeqCase(c.fullTitle || c.title || '');
		if (fs2) {
			const bucket = fs2.kind === 'flow' ? perFlowFixture : perSeqFixture;
			bucket[fs2.id] = bucket[fs2.id] || { pass: 0, fail: 0, tier: fs2.tier }; bucket[fs2.id].fail++;
		}
		const mx = classifyMixedCase(c.fullTitle || c.title || '');
		if (mx) {
			perMixedFixture[mx.mixedId] = perMixedFixture[mx.mixedId] || { pass: 0, fail: 0, langs: {} };
			perMixedFixture[mx.mixedId].fail++;
			perMixedFixture[mx.mixedId].langs[mx.lang] = perMixedFixture[mx.mixedId].langs[mx.lang] || { pass: 0, fail: 0 };
			perMixedFixture[mx.mixedId].langs[mx.lang].fail++;
		}
	}

	const lines = [];
	lines.push(`# Gate F · mermaid + flow + sequence + mixed · ${now.toISOString()}`);
	lines.push('');
	lines.push(`- exitCode: ${exitCode}`);
	lines.push(`- 总用时: ${elapsed} ms`);
	lines.push(`- 测试总数: ${stats.tests ?? '?'}`);
	lines.push(`- 通过: ${stats.passes ?? passes.length}`);
	lines.push(`- 失败: ${stats.failures ?? failures.length}`);
	lines.push(`- 挂起 (pending): ${stats.pending ?? 0}`);
	lines.push('');

	lines.push('## 各测试文件汇总');
	lines.push('');
	lines.push('| 文件 | 通过 | 失败 | 用时(ms) |');
	lines.push('|---|---:|---:|---:|');
	for (const f of TEST_FILES) {
		const base = path.basename(f);
		const row = perFile.get(base) || { pass: 0, fail: 0, ms: 0 };
		lines.push(`| ${base} | ${row.pass} | ${row.fail} | ${row.ms} |`);
	}
	lines.push('');

	lines.push('## Mermaid 22 类 fixture 通过矩阵');
	lines.push('');
	lines.push('| id | tier | .md | .expected.svg | round-trip pass | round-trip fail |');
	lines.push('|---|---|:-:|:-:|---:|---:|');
	const allIds = Object.keys(fixtures).sort();
	for (const id of allIds) {
		const f = fixtures[id];
		const p = perFixture[id] || { pass: 0, fail: 0, tier: '-' };
		lines.push(`| ${id} | ${p.tier} | ${f.md ? '✓' : '✗'} | ${f.expected ? '✓' : '✗'} | ${p.pass} | ${p.fail} |`);
	}
	lines.push('');

	lines.push('## Flow fixture 通过矩阵');
	lines.push('');
	lines.push('| id | tier | .md | .golden.svg | round-trip pass | round-trip fail |');
	lines.push('|---|---|:-:|:-:|---:|---:|');
	for (const id of Object.keys(flowFixtures || {}).sort()) {
		const f = flowFixtures[id];
		const p = perFlowFixture[id] || { pass: 0, fail: 0, tier: '-' };
		lines.push(`| ${id} | ${p.tier} | ${f.md ? '✓' : '✗'} | ${f.expected ? '✓' : '✗'} | ${p.pass} | ${p.fail} |`);
	}
	lines.push('');

	lines.push('## Sequence fixture 通过矩阵');
	lines.push('');
	lines.push('| id | tier | .md | .golden.svg | round-trip pass | round-trip fail |');
	lines.push('|---|---|:-:|:-:|---:|---:|');
	for (const id of Object.keys(seqFixtures || {}).sort()) {
		const f = seqFixtures[id];
		const p = perSeqFixture[id] || { pass: 0, fail: 0, tier: '-' };
		lines.push(`| ${id} | ${p.tier} | ${f.md ? '✓' : '✗'} | ${f.expected ? '✓' : '✗'} | ${p.pass} | ${p.fail} |`);
	}
	lines.push('');

	lines.push('## Mixed fixture 通过矩阵');
	lines.push('');
	lines.push('| id | .md | mermaid pass/fail | flow pass/fail | sequence pass/fail | total pass | total fail |');
	lines.push('|---|:-:|---|---|---|---:|---:|');
	for (const id of Object.keys(mixedFixtures || {}).sort()) {
		const f = mixedFixtures[id];
		const p = perMixedFixture[id] || { pass: 0, fail: 0, langs: {} };
		const cell = (lang) => { const l = p.langs[lang] || { pass: 0, fail: 0 }; return `${l.pass}/${l.fail}`; };
		lines.push(`| ${id} | ${f.md ? '✓' : '✗'} | ${cell('mermaid')} | ${cell('flow')} | ${cell('sequence')} | ${p.pass} | ${p.fail} |`);
	}
	lines.push('');

	if (failures.length > 0) {
		lines.push('## 失败列表');
		lines.push('');
		for (const f of failures) {
			lines.push(`- **${f.fullTitle || f.title}**`);
			if (f.err && f.err.message) {
				lines.push('  ```');
				for (const ln of String(f.err.message).split(/\r?\n/).slice(0, 8)) {
					lines.push('  ' + ln);
				}
				lines.push('  ```');
			}
		}
		lines.push('');
	}

	lines.push('## 用例逐条状态');
	lines.push('');
	lines.push('| 状态 | 用时(ms) | 名称 |');
	lines.push('|---|---:|---|');
	for (const c of passes) { lines.push(`| ✅ | ${c.duration || 0} | ${c.fullTitle || c.title} |`); }
	for (const c of failures) { lines.push(`| ❌ | ${c.duration || 0} | ${c.fullTitle || c.title} |`); }
	lines.push('');

	return lines.join('\n');
}

async function main() {
	log('[gate-f] 定位 milkdown-prod-builder...');
	const builder = pickBuilder();
	log(`[gate-f] builder=${builder}`);
	const esbuild = await loadEsbuild(builder);
	log('[gate-f] 构建测试 bundle...');
	const { outdir, outfile } = await buildBundle(esbuild, builder);
	log(`[gate-f] bundle -> ${outfile}`);

	log('[gate-f] 运行 mocha (json reporter, mermaid 首跑约 2-5s)...');
	const { report, status, elapsed } = runMocha(outfile, builder);

	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const mdPath = path.join(REPORTS_DIR, `gate-f-${stamp}.md`);
	const fixtures = collectFixtureMatrix();
	const flowFixtures = collectFlowSeqMatrix(FLOW_FIXTURE_ROOT, '.golden.svg');
	const seqFixtures = collectFlowSeqMatrix(SEQ_FIXTURE_ROOT, '.golden.svg');
	const mixedFixtures = collectMixedMatrix();
	const md = buildMdReport({ report, elapsed, fixtures, flowFixtures, seqFixtures, mixedFixtures, exitCode: status ?? 0 });
	fs.writeFileSync(mdPath, md, 'utf8');
	log(`[gate-f] md 报告 -> ${mdPath}`);

	if (argJson) {
		const summary = {
			ok: (status ?? 0) === 0,
			exitCode: status ?? 0,
			elapsedMs: elapsed,
			mdReport: mdPath,
			stats: report && report.stats ? report.stats : null,
			testFiles: TEST_FILES,
			fixtureMatrix: fixtures,
			flowFixtureMatrix: flowFixtures,
			sequenceFixtureMatrix: seqFixtures,
			mixedFixtureMatrix: mixedFixtures,
		};
		process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
	} else {
		const stats = report && report.stats ? report.stats : {};
		log(`[gate-f] 完成: passes=${stats.passes ?? '?'} failures=${stats.failures ?? '?'} elapsed=${elapsed}ms exit=${status ?? 0}`);
	}

	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* ignore */ }

	process.exit(status && status !== 0 ? 1 : 0);
}

main().catch(err => {
	process.stderr.write('[gate-f] fatal: ' + (err && err.stack || err) + '\n');
	process.exit(2);
});

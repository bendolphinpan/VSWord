#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.8.4 · Round-trip Gate E · 模块 a 收官 CI 脚本
 *
 *  一键跑六个 round-trip 相关的单测文件：
 *    - milkdownRoundtrip.test.ts
 *    - protocolRoundtrip.test.ts
 *    - roundtripSerializer.test.ts
 *    - roundtripSession.test.ts
 *    - roundtripTracker.test.ts
 *    - milkdownWorkingCopy.test.ts
 *
 *  产出：
 *    - test/reports/gate-e-<timestamp>.md（fixture 矩阵 + case 状态 + 用时）
 *    - --json 输出机器可读结构给 CI 消费
 *
 *  用法：
 *    node code-oss/test/scripts/gate-e.mjs           # 跑测试 + 生成 md 报告
 *    node code-oss/test/scripts/gate-e.mjs --json    # 额外把 JSON 打到 stdout
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
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const REPORTS_DIR = path.resolve(CODE_OSS, 'test', 'reports');
const FIXTURE_ROOT = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/fixtures/roundtrip');

const argJson = process.argv.includes('--json');

const TEST_FILES = [
	'test/node/milkdownRoundtrip.test.ts',
	'test/node/protocolRoundtrip.test.ts',
	'test/node/roundtripSerializer.test.ts',
	'test/node/roundtripSession.test.ts',
	'test/node/roundtripTracker.test.ts',
	'test/node/milkdownWorkingCopy.test.ts',
];

function log(msg) { if (!argJson) { process.stderr.write(msg + '\n'); } }

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	if (!fs.existsSync(esbuildPkg)) {
		throw new Error(`esbuild not found at ${esbuildPkg}. Run vsword prod build first.`);
	}
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

function collectFixtureMatrix() {
	if (!fs.existsSync(FIXTURE_ROOT)) { return {}; }
	const out = {};
	for (const cls of fs.readdirSync(FIXTURE_ROOT).sort()) {
		const clsDir = path.join(FIXTURE_ROOT, cls);
		if (!fs.statSync(clsDir).isDirectory()) { continue; }
		out[cls] = fs.readdirSync(clsDir).filter(n => n.endsWith('.md')).sort();
	}
	return out;
}

function buildRefractorLangStubs(stubDir) {
	const refractorLangs = ['bash','c','cpp','csharp','css','diff','docker','go','ini','java','javascript','json','jsx','markdown','markup','nginx','php','powershell','python','ruby','rust','scss','sql','toml','tsx','typescript','yaml'];
	for (const l of refractorLangs) {
		fs.writeFileSync(path.join(stubDir, `refractor-${l}.js`), 'export default function() {};');
	}
	return refractorLangs;
}

function writeStubs(stubDir) {
	fs.mkdirSync(stubDir, { recursive: true });
	const write = (name, body) => fs.writeFileSync(path.join(stubDir, name), body);
	write('milkdown-utils.js', 'const stub = () => stub; stub.node = { name: "stub" }; stub.mark = { name: "stub" }; stub.key = "stub-key"; stub.plugin = null; export const $view = stub; export const $prose = stub; export const $ctx = stub; export const $node = stub; export const $nodeSchema = stub; export const $mark = stub; export const $markSchema = stub; export const $remark = stub; export const $inputRule = stub; export const $command = stub; export const $useKeymap = stub;');
	write('milkdown-preset-commonmark.js', 'export const codeBlockSchema = { node: { name: "code_block" } }; export const imageSchema = { node: { name: "image" } }; export const paragraphSchema = { node: { name: "paragraph" } };');
	write('milkdown-plugin-prism.js', 'export const prismConfig = { key: "prism-key" };');
	write('milkdown-preset-gfm.js', 'export const tableSchema = { node: { name: "table" } };');
	write('milkdown-prose-tables.js', 'export class TableMap {};');
	write('milkdown-prose-state.js', 'export class Plugin { constructor(o){ this.spec=o; this.key=o&&o.key; } } export class PluginKey { constructor(n){ this.n=n; } getState(state){ return state && state.__pluginStateOverride__; } }');
	write('milkdown-core.js', 'export const commandsCtx = { key: "cmd" };');
	write('unist-util-visit.js', 'export function visit(tree, test, cb) { if (typeof test === "function") { cb = test; test = null; } function walk(n){ if(!n) return; if (!test || (n && n.type === test)) cb && cb(n); const kids = n && n.children; if (kids) for (const k of kids) walk(k); } walk(tree); }');
	write('milkdown-preset-commonmark-inline.js', 'export const imageInputRule = () => null; export const imageSchema = { node: { name: "image" } };');
	write('milkdown-exception.js', 'export function expectDomTypeError(dom){ if(!dom||!dom.tagName) throw new Error("expectDomTypeError"); return dom; }');
	write('refractor-core.js', 'export const refractor = { register: () => {} };');
	write('jsdom-loader.js',
		`import { createRequire } from 'node:module';\nconst require = createRequire(${JSON.stringify(pathToFileURL(path.join(BUILDER, 'node_modules/')).href)});\nconst j = require('jsdom');\nexport const JSDOM = j.JSDOM;\nexport default j;`);
	const refractorLangs = buildRefractorLangStubs(stubDir);
	return refractorLangs;
}

function makeAliasPlugin(stubDir, refractorLangs) {
	return {
		name: 'vsword-alias',
		setup(build) {
			const map = new Map([
				['@milkdown/utils', path.join(stubDir, 'milkdown-utils.js')],
				['@milkdown/preset-commonmark', path.join(stubDir, 'milkdown-preset-commonmark.js')],
				['@milkdown/preset-gfm', path.join(stubDir, 'milkdown-preset-gfm.js')],
				['@milkdown/plugin-prism', path.join(stubDir, 'milkdown-plugin-prism.js')],
				['@milkdown/prose/tables', path.join(stubDir, 'milkdown-prose-tables.js')],
				['@milkdown/prose/state', path.join(stubDir, 'milkdown-prose-state.js')],
				['@milkdown/core', path.join(stubDir, 'milkdown-core.js')],
				['@milkdown/exception', path.join(stubDir, 'milkdown-exception.js')],
				['unist-util-visit', path.join(stubDir, 'unist-util-visit.js')],
				['refractor/core', path.join(stubDir, 'refractor-core.js')],
				['jsdom', path.join(stubDir, 'jsdom-loader.js')],
			]);
			for (const l of refractorLangs) {
				map.set(`refractor/${l}`, path.join(stubDir, `refractor-${l}.js`));
			}
			build.onResolve({ filter: /.*/ }, args => {
				if (map.has(args.path)) { return { path: map.get(args.path) }; }
				if (args.path.startsWith('./') && args.path.endsWith('.mjs')) {
					const base = args.path.slice(2, -'.mjs'.length);
					const candidate = path.join(args.resolveDir, base + '.template.js');
					if (fs.existsSync(candidate)) { return { path: candidate }; }
				}
				return null;
			});
		},
	};
}

async function buildBundle(esbuild) {
	const abs = TEST_FILES.map(t => path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword', t));
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-vsword-tests-'));
	const stubDir = path.join(outdir, 'stubs');
	const refractorLangs = writeStubs(stubDir);
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
		plugins: [makeAliasPlugin(stubDir, refractorLangs)],
		external: ['mocha', 'assert', 'node:*', 'fs', 'path', 'os', 'url'],
		logLevel: 'error',
	});
	return { outdir, outfile };
}

function runMocha(outfile) {
	const mochaCli = path.join(CODE_OSS, 'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''));
	const mochaExists = fs.existsSync(mochaCli);
	const jsonOut = path.join(path.dirname(outfile), 'mocha-out.json');
	let cmd, args;
	if (mochaExists) {
		cmd = mochaCli;
		args = ['--reporter', 'json', '--ui', 'tdd', '--reporter-option', `output=${jsonOut}`, outfile];
	} else {
		cmd = process.execPath;
		args = [
			'-e',
			`import('mocha').then(async ({default: Mocha}) => { const m = new Mocha({reporter:'json',reporterOptions:{output:${JSON.stringify(jsonOut)}},ui:'tdd'}); m.addFile(${JSON.stringify(outfile)}); m.run(f => process.exit(f?1:0)); }).catch(e=>{console.error(e); process.exit(2)});`,
			'--input-type=module',
		];
	}
	const t0 = Date.now();
	const res = cp.spawnSync(cmd, args, {
		encoding: 'utf8',
		cwd: CODE_OSS,
		shell: process.platform === 'win32',
		env: {
			...process.env,
			NODE_PATH: [
				path.join(BUILDER, 'node_modules'),
				process.env.NODE_PATH || '',
			].filter(Boolean).join(path.delimiter),
		},
	});
	const elapsed = Date.now() - t0;

	// mocha JSON reporter writes to file when output= is given; also captured on stdout as fallback.
	let report;
	try {
		if (fs.existsSync(jsonOut)) {
			report = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
		} else if (res.stdout) {
			report = JSON.parse(res.stdout);
		}
	} catch (e) {
		report = null;
	}
	return { report, status: res.status, elapsed, stderr: res.stderr, stdout: res.stdout };
}

function classifyCase(fullTitle) {
	// 从 test title 里抽出 fixture 类别（typora / obsidian / pandoc / …）
	const m = /\[([^\]]+)\]/.exec(fullTitle || '');
	if (!m) { return null; }
	const cls = m[1].split('/')[0];
	return cls;
}

/**
 * 扫每个源 test 文件，抽出顶层 `suite('...')` 名字。
 * 返回 { [suiteName]: 'basename.test.ts' } 用于 fullTitle → file 反查。
 */
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
	// mocha fullTitle = "<suiteName> <testName>"，最长前缀匹配。
	for (const [suiteName, file] of suiteMap) {
		if (fullTitle && fullTitle.startsWith(suiteName)) { return file; }
	}
	return 'unknown';
}

function buildMdReport({ report, elapsed, fixtures, exitCode }) {
	const now = new Date();
	const stats = report && report.stats ? report.stats : {};
	const passes = report && report.passes ? report.passes : [];
	const failures = report && report.failures ? report.failures : [];
	const suiteMap = buildSuiteToFileMap();

	const perFile = new Map();
	const bumpFile = (f, key) => {
		let row = perFile.get(f) || { file: f, pass: 0, fail: 0, ms: 0 };
		row[key] = (row[key] || 0) + 1;
		perFile.set(f, row);
	};
	const bumpFileMs = (f, ms) => {
		let row = perFile.get(f) || { file: f, pass: 0, fail: 0, ms: 0 };
		row.ms = (row.ms || 0) + (ms || 0);
		perFile.set(f, row);
	};

	const fixtureHits = {};
	const walkCase = (c, ok) => {
		const file = fileFromTitle(c.fullTitle || c.title || '', suiteMap);
		bumpFile(file, ok ? 'pass' : 'fail');
		bumpFileMs(file, c.duration || 0);
		const cls = classifyCase(c.fullTitle || c.title || '');
		if (cls) {
			fixtureHits[cls] = fixtureHits[cls] || { pass: 0, fail: 0 };
			fixtureHits[cls][ok ? 'pass' : 'fail'] += 1;
		}
	};
	for (const c of passes) { walkCase(c, true); }
	for (const c of failures) { walkCase(c, false); }

	const lines = [];
	lines.push(`# Round-trip Gate E · ${now.toISOString()}`);
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

	lines.push('## Fixture 覆盖矩阵');
	lines.push('');
	lines.push('| 类别 | 磁盘 fixture 数 | 关联 case 通过 | 关联 case 失败 |');
	lines.push('|---|---:|---:|---:|');
	const classes = Object.keys(fixtures).sort();
	for (const cls of classes) {
		const hit = fixtureHits[cls] || { pass: 0, fail: 0 };
		lines.push(`| ${cls} | ${fixtures[cls].length} | ${hit.pass} | ${hit.fail} |`);
	}
	lines.push('');

	if (failures.length > 0) {
		lines.push('## 失败列表');
		lines.push('');
		for (const f of failures) {
			lines.push(`- **${f.fullTitle || f.title}**`);
			if (f.err && f.err.message) {
				lines.push('  ```');
				for (const ln of String(f.err.message).split(/\r?\n/).slice(0, 6)) {
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
	for (const c of passes) {
		lines.push(`| ✅ | ${c.duration || 0} | ${c.fullTitle || c.title} |`);
	}
	for (const c of failures) {
		lines.push(`| ❌ | ${c.duration || 0} | ${c.fullTitle || c.title} |`);
	}
	lines.push('');

	return lines.join('\n');
}

async function main() {
	log('[gate-e] 开始构建测试 bundle...');
	const esbuild = await loadEsbuild();
	const { outdir, outfile } = await buildBundle(esbuild);
	log(`[gate-e] bundle -> ${outfile}`);

	log('[gate-e] 运行 mocha (json reporter)...');
	const { report, status, elapsed } = runMocha(outfile);

	fs.mkdirSync(REPORTS_DIR, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const mdPath = path.join(REPORTS_DIR, `gate-e-${stamp}.md`);
	const fixtures = collectFixtureMatrix();
	const md = buildMdReport({ report, elapsed, fixtures, exitCode: status ?? 0 });
	fs.writeFileSync(mdPath, md, 'utf8');
	log(`[gate-e] md 报告 -> ${mdPath}`);

	if (argJson) {
		const summary = {
			ok: (status ?? 0) === 0,
			exitCode: status ?? 0,
			elapsedMs: elapsed,
			mdReport: mdPath,
			stats: report && report.stats ? report.stats : null,
			testFiles: TEST_FILES,
			fixtureMatrix: fixtures,
		};
		process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
	} else {
		// 简洁人读摘要
		const stats = report && report.stats ? report.stats : {};
		log(`[gate-e] 完成: passes=${stats.passes ?? '?'} failures=${stats.failures ?? '?'} elapsed=${elapsed}ms exit=${status ?? 0}`);
	}

	// 清理 tmp bundle 目录（保留报告）
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* ignore */ }

	process.exit(status && status !== 0 ? 1 : 0);
}

main().catch(err => {
	process.stderr.write('[gate-e] fatal: ' + (err && err.stack || err) + '\n');
	process.exit(2);
});

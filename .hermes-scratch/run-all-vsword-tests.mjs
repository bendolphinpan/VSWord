#!/usr/bin/env node
/**
 * Ad-hoc: run ALL code-oss/src/vs/workbench/contrib/vsword/test/node/*.test.ts
 * 用 gate-e.mjs 的相同 esbuild+stubs 基础设施，只是扩到全套单测。
 * 用途：T-3.5c.2 完工验证 - 拿到 vsword 全套通过数（基线 493+）。
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const CODE_OSS = path.resolve(REPO_ROOT, 'code-oss');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const TEST_DIR = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/node');

const TEST_FILES = fs.readdirSync(TEST_DIR)
	.filter(n => n.endsWith('.test.ts'))
	.sort()
	.map(n => `test/node/${n}`);

console.log(`[all-vsword] discovered ${TEST_FILES.length} test files:`);
for (const f of TEST_FILES) console.log('  -', f);

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	if (!fs.existsSync(esbuildPkg)) throw new Error(`esbuild not found at ${esbuildPkg}`);
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

function buildRefractorLangStubs(stubDir) {
	const refractorLangs = ['bash','c','cpp','csharp','css','diff','docker','go','ini','java','javascript','json','jsx','markdown','markup','nginx','php','powershell','python','ruby','rust','scss','sql','toml','tsx','typescript','yaml'];
	for (const l of refractorLangs) fs.writeFileSync(path.join(stubDir, `refractor-${l}.js`), 'export default function() {};');
	return refractorLangs;
}

function writeStubs(stubDir) {
	fs.mkdirSync(stubDir, { recursive: true });
	const write = (name, body) => fs.writeFileSync(path.join(stubDir, name), body);
	write('milkdown-utils.js', 'const stub = () => stub; stub.node = { name: "stub" }; stub.mark = { name: "stub" }; stub.key = "stub-key"; stub.plugin = null; export const $view = stub; export const $prose = stub; export const $ctx = stub; export const $node = stub; export const $nodeSchema = stub; export const $mark = stub; export const $markSchema = stub; export const $remark = stub; export const $inputRule = stub; export const $command = stub; export const $useKeymap = stub;');
	write('milkdown-preset-commonmark.js', 'export const codeBlockSchema = { node: { name: "code_block" } }; export const imageSchema = { node: { name: "image" } }; export const paragraphSchema = { node: { name: "paragraph" } };');
	write('milkdown-plugin-prism.js', 'export const prismConfig = { key: "prism-key" };');
	write('milkdown-preset-gfm.js', 'export const tableSchema = { node: { name: "table" } }; export const footnoteReferenceSchema = { node: { name: "footnote_reference" } }; export const footnoteDefinitionSchema = { node: { name: "footnote_definition" } };');
	write('milkdown-prose-tables.js', 'export class TableMap {};');
	write('milkdown-prose-state.js', 'export class Plugin { constructor(o){ this.spec=o; this.key=o&&o.key; } } export class PluginKey { constructor(n){ this.n=n; } getState(state){ return state && state.__pluginStateOverride__; } }');
	write('milkdown-core.js', 'export const commandsCtx = { key: "cmd" }; export const editorViewCtx = { key: "editorView" };');
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
			for (const l of refractorLangs) map.set(`refractor/${l}`, path.join(stubDir, `refractor-${l}.js`));
			build.onResolve({ filter: /.*/ }, args => {
				if (map.has(args.path)) return { path: map.get(args.path) };
				if (args.path.startsWith('./') && args.path.endsWith('.mjs')) {
					const base = args.path.slice(2, -'.mjs'.length);
					const candidate = path.join(args.resolveDir, base + '.template.js');
					if (fs.existsSync(candidate)) return { path: candidate };
				}
				return null;
			});
		},
	};
}

async function buildBundle(esbuild) {
	const abs = TEST_FILES.map(t => path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword', t));
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-vsword-all-tests-'));
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
	const jsonOut = path.join(path.dirname(outfile), 'mocha-out.json');
	const args = ['--reporter', 'json', '--ui', 'tdd', '--reporter-option', `output=${jsonOut}`, outfile];
	const t0 = Date.now();
	const res = cp.spawnSync(mochaCli, args, {
		encoding: 'utf8', cwd: CODE_OSS, shell: process.platform === 'win32',
		env: { ...process.env, NODE_PATH: [path.join(BUILDER, 'node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter) },
	});
	const elapsed = Date.now() - t0;
	let report = null;
	try { if (fs.existsSync(jsonOut)) report = JSON.parse(fs.readFileSync(jsonOut, 'utf8')); } catch (e) { report = null; }
	return { report, status: res.status, elapsed, stderr: res.stderr, stdout: res.stdout };
}

(async () => {
	const esbuild = await loadEsbuild();
	const { outdir, outfile } = await buildBundle(esbuild);
	console.log(`[all-vsword] bundle -> ${outfile}`);
	const { report, status, elapsed, stderr } = runMocha(outfile);
	if (!report) {
		console.error('[all-vsword] no mocha json report');
		if (stderr) console.error(stderr);
		process.exit(2);
	}
	const s = report.stats || {};
	console.log(`[all-vsword] tests=${s.tests} passes=${s.passes} failures=${s.failures} pending=${s.pending} elapsed=${elapsed}ms exit=${status}`);
	// per-file (rough): 用 fullTitle prefix 匹配 suite name
	const suiteMap = new Map();
	for (const rel of TEST_FILES) {
		const abs = path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword', rel);
		if (!fs.existsSync(abs)) continue;
		const src = fs.readFileSync(abs, 'utf8');
		const re = /^\s*suite\(\s*(['"`])((?:\\\1|[^\\])*?)\1/gm;
		let m;
		while ((m = re.exec(src)) !== null) suiteMap.set(m[2], path.basename(rel));
	}
	const perFile = new Map();
	const bump = (fullTitle, ok, dur) => {
		let f = 'unknown';
		for (const [name, file] of suiteMap) if (fullTitle && fullTitle.startsWith(name)) { f = file; break; }
		const row = perFile.get(f) || { pass: 0, fail: 0, ms: 0 };
		if (ok) row.pass++; else row.fail++;
		row.ms += dur || 0;
		perFile.set(f, row);
	};
	for (const c of report.passes || []) bump(c.fullTitle || c.title, true, c.duration);
	for (const c of report.failures || []) bump(c.fullTitle || c.title, false, c.duration);
	console.log('\n[all-vsword] per-file summary:');
	console.log('  file                                pass  fail  ms');
	for (const [file, row] of [...perFile.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
		console.log(`  ${file.padEnd(36)} ${String(row.pass).padStart(4)}  ${String(row.fail).padStart(4)}  ${row.ms}`);
	}
	// dump failures
	if ((report.failures || []).length) {
		console.log('\n[all-vsword] FAILURES:');
		for (const f of report.failures) {
			console.log(`  * ${f.fullTitle}`);
			if (f.err && f.err.message) console.log(`    ${f.err.message.split('\n')[0]}`);
		}
	}
	// cleanup
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch {}
	process.exit(status || 0);
})().catch(e => { console.error(e); process.exit(2); });

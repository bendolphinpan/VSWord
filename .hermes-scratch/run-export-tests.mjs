#!/usr/bin/env node
/**
 * T-3.8b.1 · 只跑 exportHtml* 的 2 个 test/node/*.test.ts —— 复用 run-all-vsword-tests.mjs 的
 * esbuild+stubs 基础设施，但只把 export 两个测试文件塞进 barrel，绕开全量 stub 库缺
 * unified/remark-parse/@milkdown/prose/view 的问题。
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const CODE_OSS = path.resolve(REPO_ROOT, 'code-oss');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');

const TEST_FILES = [
	'test/node/exportHtmlAssemble.test.ts',
	'test/node/exportHtmlImageMode.test.ts',
	'test/node/exportContribution.test.ts',
	'test/node/exportPdfContribution.test.ts',
	'test/node/pandocDetection.test.ts',
	'test/node/exportPandocContribution.test.ts',
];

console.log(`[export-tests] running ${TEST_FILES.length} test files:`);
for (const f of TEST_FILES) console.log('  -', f);

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	if (!fs.existsSync(esbuildPkg)) throw new Error(`esbuild not found at ${esbuildPkg}`);
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

async function buildBundle(esbuild) {
	const abs = TEST_FILES.map(t => path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword', t));
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-vsword-export-tests-'));
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
	console.log(`[export-tests] bundle -> ${outfile}`);
	const { report, status, elapsed, stderr, stdout } = runMocha(outfile);
	if (!report) {
		console.error('[export-tests] no mocha json report');
		if (stdout) console.error('---- stdout ----\n' + stdout);
		if (stderr) console.error('---- stderr ----\n' + stderr);
		process.exit(2);
	}
	const s = report.stats || {};
	console.log(`[export-tests] tests=${s.tests} passes=${s.passes} failures=${s.failures} pending=${s.pending} elapsed=${elapsed}ms exit=${status}`);
	if ((report.failures || []).length) {
		console.log('\n[export-tests] FAILURES:');
		for (const f of report.failures) {
			console.log(`  * ${f.fullTitle}`);
			if (f.err && f.err.message) console.log(`    ${f.err.message.split('\n').slice(0, 5).join('\n    ')}`);
		}
	}
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch {}
	process.exit(status || 0);
})().catch(e => { console.error(e); process.exit(2); });

#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.5b-flowseq.3 · D-1 · flow/sequence theme bridge 单测 ad-hoc runner
 *
 *  职责：把 flowThemeBridge.test.ts + sequenceThemeBridge.test.ts bundle 起来，
 *  用 mocha (tdd) 跑，走 gate-e 的 alias + jsdom loader pattern。
 *
 *  用法：node code-oss/test/scripts/run-flow-sequence-theme-bridge.mjs
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');

const TEST_FILES = [
	'test/node/flowThemeBridge.test.ts',
	'test/node/sequenceThemeBridge.test.ts',
];

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
	const write = (name, body) => fs.writeFileSync(path.join(stubDir, name), body);
	write('jsdom-loader.js',
		`import { createRequire } from 'node:module';\nconst require = createRequire(${JSON.stringify(pathToFileURL(path.join(BUILDER, 'node_modules/')).href)});\nconst j = require('jsdom');\nexport const JSDOM = j.JSDOM;\nexport default j;`);
}

function makeAliasPlugin(stubDir) {
	return {
		name: 'vsword-alias',
		setup(build) {
			const map = new Map([
				['jsdom', path.join(stubDir, 'jsdom-loader.js')],
			]);
			build.onResolve({ filter: /.*/ }, args => {
				if (map.has(args.path)) { return { path: map.get(args.path) }; }
				// gate-e pattern：./foo.mjs → ./foo.template.js
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
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-flowseq-tests-'));
	const stubDir = path.join(outdir, 'stubs');
	writeStubs(stubDir);
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
	let report = null;
	try {
		if (fs.existsSync(jsonOut)) { report = JSON.parse(fs.readFileSync(jsonOut, 'utf8')); }
		else if (res.stdout) { report = JSON.parse(res.stdout); }
	} catch { /* keep null */ }
	return { report, status: res.status, elapsed, stderr: res.stderr, stdout: res.stdout };
}

(async () => {
	const esbuild = await loadEsbuild();
	const { outdir, outfile } = await buildBundle(esbuild);
	const { report, status, elapsed, stderr, stdout } = runMocha(outfile);

	const stats = report && report.stats || {};
	const passes = report && report.passes || [];
	const failures = report && report.failures || [];
	process.stderr.write(`\n[flowseq-theme-bridge] exit=${status} elapsed=${elapsed}ms tests=${stats.tests ?? '?'} pass=${stats.passes ?? passes.length} fail=${stats.failures ?? failures.length}\n`);
	if (failures.length) {
		for (const f of failures) {
			process.stderr.write(`  ✗ ${f.fullTitle}\n    ${f.err && f.err.message ? f.err.message : ''}\n`);
			if (f.err && f.err.stack) { process.stderr.write(`    ${f.err.stack.split('\n').slice(0, 5).join('\n    ')}\n`); }
		}
	}
	if (!report) {
		process.stderr.write(`\n---STDERR---\n${stderr || ''}\n---STDOUT---\n${stdout || ''}\n`);
	}
	// 清理临时目录
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* no-op */ }
	process.exit(status || 0);
})();

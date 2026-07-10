#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.13.4 · typewriter helpers 单测 ad-hoc runner
 *
 *  职责：把 typewriter.test.ts bundle 起来，用 mocha (tdd) 跑。
 *  jsdom 走 gate-e / run-ime-composition-test 相同的 loader-stub + alias plugin
 *  模式（避免 esbuild bundle jsdom native shim；由运行期 require 从
 *  .tmp/milkdown-prod-builder 拿 jsdom 27.x）。
 *
 *  用法：node code-oss/test/scripts/run-typewriter-test.mjs
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');

const TEST_FILE = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/test/node/typewriter.test.ts',
);

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
	// jsdom loader stub —— 强制走 builder/node_modules 里的 jsdom（27.x）。
	fs.writeFileSync(
		path.join(stubDir, 'jsdom-loader.js'),
		`import { createRequire } from 'node:module';\nconst require = createRequire(${JSON.stringify(pathToFileURL(path.join(BUILDER, 'node_modules/')).href)});\nconst j = require('jsdom');\nexport const JSDOM = j.JSDOM;\nexport default j;`,
	);
}

function makeAliasPlugin(stubDir) {
	return {
		name: 'vsword-typewriter-alias',
		setup(build) {
			const map = new Map([
				['jsdom', path.join(stubDir, 'jsdom-loader.js')],
			]);
			build.onResolve({ filter: /.*/ }, args => {
				if (map.has(args.path)) { return { path: map.get(args.path) }; }
				return null;
			});
		},
	};
}

async function main() {
	console.log('[typewriter-test] start');
	if (!fs.existsSync(TEST_FILE)) {
		throw new Error(`missing test: ${TEST_FILE}`);
	}
	const esbuild = await loadEsbuild();
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-typewriter-'));
	const stubDir = path.join(outdir, 'stubs');
	writeStubs(stubDir);
	const outfile = path.join(outdir, 'test.mjs');
	await esbuild.build({
		entryPoints: [TEST_FILE],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts', '.js': 'js' },
		plugins: [makeAliasPlugin(stubDir)],
		external: ['mocha', 'assert', 'node:*', 'fs', 'path', 'os', 'url'],
		logLevel: 'error',
	});
	console.log('[typewriter-test] bundled at', outfile);

	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	const env = {
		...process.env,
		NODE_PATH: [
			path.join(BUILDER, 'node_modules'),
			process.env.NODE_PATH || '',
		].filter(Boolean).join(path.delimiter),
	};
	const t0 = Date.now();
	const res = cp.spawnSync(mochaCli, ['--ui', 'tdd', '--reporter', 'spec', outfile], {
		encoding: 'utf8',
		env,
		cwd: CODE_OSS,
		shell: process.platform === 'win32',
	});
	const elapsed = Date.now() - t0;
	console.log('[typewriter-test] mocha exit=', res.status, 'elapsed=', elapsed, 'ms');
	process.stdout.write('--- STDOUT ---\n' + (res.stdout || '') + '\n');
	if (res.stderr) { process.stderr.write('--- STDERR ---\n' + res.stderr + '\n'); }
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { }
	process.exit(res.status ?? 1);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

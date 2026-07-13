#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  RD-5.2 · Pretext 版心度量纯函数 ad-hoc runner。
 *  用法：node code-oss/test/scripts/run-pretext-measure-test.mjs
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');

const ENTRY = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/test/node/pretextMeasure.test.ts',
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

function makeAliasPlugin() {
	return {
		name: 'vsword-pretext-measure-alias',
		setup(build) {
			build.onResolve({ filter: /^\.\/.*\.mjs$/ }, (args) => {
				const base = args.path.slice(2, -'.mjs'.length);
				const candidate = path.join(args.resolveDir, base + '.template.js');
				if (fs.existsSync(candidate)) { return { path: candidate }; }
				return null;
			});
		},
	};
}

async function bundleAndRun(esbuild) {
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, `.tmp-pretext-measure-`));
	const outfile = path.join(outdir, 'test.mjs');
	console.log(`[pretext-measure-test] bundling ${ENTRY} …`);
	await esbuild.build({
		entryPoints: [ENTRY],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts', '.js': 'js' },
		plugins: [makeAliasPlugin()],
		external: ['mocha', 'assert', 'node:*', '@chenglou/pretext'],
		logLevel: 'error',
		nodePaths: [path.join(BUILDER, 'node_modules')],
	});
	console.log(`[pretext-measure-test] bundled at`, outfile);

	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log(`[pretext-measure-test] mochaCli=`, mochaCli, 'exists=', fs.existsSync(mochaCli));
	const r = cp.spawnSync(mochaCli, [outfile, '--ui', 'tdd', '--timeout', '10000'], {
		cwd: CODE_OSS,
		encoding: 'utf8',
		shell: process.platform === 'win32',
	});
	console.log(`[pretext-measure-test] mocha exit=`, r.status, 'signal=', r.signal);
	if (r.stderr) { console.log('--- STDERR ---\n' + r.stderr); }
	if (r.stdout) { console.log('--- STDOUT ---\n' + r.stdout); }
	if (r.status !== 0) { process.exit(r.status ?? 1); }
}

console.log('[pretext-measure-test] start');
const esbuild = await loadEsbuild();
await bundleAndRun(esbuild);

#!/usr/bin/env node
// Ad-hoc runner for T-3.7b.e · viewModeMatrix.test.ts
// 依赖 jsdom（走 run-view-modes-test.mjs 的 alias pattern）+ mocha 单文件跑。

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
	'src/vs/workbench/contrib/vsword/test/node/viewModeMatrix.test.ts',
);

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

function writeStubs(stubDir) {
	fs.mkdirSync(stubDir, { recursive: true });
	fs.writeFileSync(path.join(stubDir, 'jsdom-loader.js'),
		`import { createRequire } from 'node:module';\nconst require = createRequire(${JSON.stringify(pathToFileURL(path.join(BUILDER, 'node_modules/')).href)});\nconst j = require('jsdom');\nexport const JSDOM = j.JSDOM;\nexport default j;`);
}

function makeAliasPlugin(stubDir) {
	return {
		name: 'vsword-alias',
		setup(build) {
			const map = new Map([['jsdom', path.join(stubDir, 'jsdom-loader.js')]]);
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

async function main() {
	console.log('[view-mode-matrix-test] start');
	if (!fs.existsSync(TEST_FILE)) {
		throw new Error(`missing test: ${TEST_FILE}`);
	}
	const esbuild = await loadEsbuild();
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-viewmode-matrix-'));
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
		external: ['mocha', 'assert', 'node:*'],
		logLevel: 'error',
	});
	const mochaCli = path.join(CODE_OSS, 'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''));
	const res = cp.spawnSync(mochaCli, ['--ui', 'tdd', '--reporter', 'spec', outfile], {
		encoding: 'utf8',
		env: {
			...process.env,
			NODE_PATH: [path.join(BUILDER, 'node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter),
		},
		shell: process.platform === 'win32',
	});
	process.stdout.write(res.stdout || '');
	process.stderr.write(res.stderr || '');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { }
	process.exit(res.status ?? 1);
}
main().catch(e => { console.error(e); process.exit(2); });

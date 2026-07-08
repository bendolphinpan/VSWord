#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.7c.3.b · FindWidget + keymap 单元测试 ad-hoc runner
 *
 *  职责：把 findWidget.test.ts bundle 起来，用 mocha (tdd) 跑。
 *  同 run-mode-switch-component-test.mjs：alias jsdom + ./xxx.mjs → ./xxx.template.js。
 *  find-widget.template.js 内 import 'find-plugin.mjs' / 'find-widget-helpers.mjs' /
 *  'ui-component.mjs'；find-plugin 再 import '@milkdown/prose/*'，走 builder node_modules。
 *
 *  用法：node code-oss/test/scripts/run-find-widget-test.mjs
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
	'src/vs/workbench/contrib/vsword/test/node/findWidget.test.ts',
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
	const write = (name, body) => fs.writeFileSync(path.join(stubDir, name), body);
	write('jsdom-loader.js',
		`import { createRequire } from 'node:module';\nconst require = createRequire(${JSON.stringify(pathToFileURL(path.join(BUILDER, 'node_modules/')).href)});\nconst j = require('jsdom');\nexport const JSDOM = j.JSDOM;\nexport default j;`);
}

function makeAliasPlugin(stubDir) {
	return {
		name: 'vsword-find-widget-alias',
		setup(build) {
			const map = new Map([
				['jsdom', path.join(stubDir, 'jsdom-loader.js')],
			]);
			build.onResolve({ filter: /.*/ }, args => {
				if (map.has(args.path)) { return { path: map.get(args.path) }; }
				// ./foo.mjs → ./foo.template.js（同 mode-switch runner）
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

async function main() {
	console.log('[find-widget-test] start');
	if (!fs.existsSync(TEST_FILE)) {
		throw new Error(`missing test: ${TEST_FILE}`);
	}
	const esbuild = await loadEsbuild();
	console.log('[find-widget-test] esbuild loaded');
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-find-widget-'));
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
		nodePaths: [path.join(BUILDER, 'node_modules')],
	});
	console.log('[find-widget-test] bundled at', outfile);
	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log('[find-widget-test] mochaCli=', mochaCli, 'exists=', fs.existsSync(mochaCli));
	const res = cp.spawnSync(mochaCli, ['--ui', 'tdd', '--reporter', 'spec', outfile], {
		encoding: 'utf8',
		env: {
			...process.env,
			NODE_PATH: [
				path.join(BUILDER, 'node_modules'),
				process.env.NODE_PATH || '',
			].filter(Boolean).join(path.delimiter),
		},
		shell: process.platform === 'win32',
	});
	console.log('[find-widget-test] mocha exit code=', res.status, 'signal=', res.signal, 'err=', res.error && res.error.message);
	process.stdout.write('--- STDOUT ---\n' + (res.stdout || '') + '\n');
	process.stderr.write('--- STDERR ---\n' + (res.stderr || '') + '\n');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { }
	process.exit(res.status ?? 1);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

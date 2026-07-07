#!/usr/bin/env node
// Ad-hoc runner for T-3.7b.c · viewModeEditable.test.ts
// 单文件测试，esbuild 直接 bundle + mocha 跑。风格与 run-view-mode-actions-test.mjs 对齐。

import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const TEST_FILE = path.join(
	CODE_OSS,
	'src/vs/workbench/contrib/vsword/test/node/viewModeEditable.test.ts',
);

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

async function main() {
	console.log('[view-mode-editable-test] start');
	if (!fs.existsSync(TEST_FILE)) {
		throw new Error(`missing test: ${TEST_FILE}`);
	}
	const esbuild = await loadEsbuild();
	console.log('[view-mode-editable-test] esbuild loaded');
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-viewmode-editable-'));
	const outfile = path.join(outdir, 'test.mjs');
	await esbuild.build({
		entryPoints: [TEST_FILE],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts', '.js': 'js' },
		external: ['mocha', 'assert', 'node:*'],
		logLevel: 'error',
	});
	console.log('[view-mode-editable-test] bundled at', outfile);
	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log('[view-mode-editable-test] mochaCli=', mochaCli, 'exists=', fs.existsSync(mochaCli));
	const res = cp.spawnSync(mochaCli, ['--ui', 'tdd', '--reporter', 'spec', outfile], {
		encoding: 'utf8',
		env: process.env,
		shell: process.platform === 'win32',
	});
	console.log('[view-mode-editable-test] mocha exit code=', res.status, 'signal=', res.signal, 'err=', res.error && res.error.message);
	process.stdout.write('--- STDOUT ---\n' + (res.stdout || '') + '\n');
	process.stderr.write('--- STDERR ---\n' + (res.stderr || '') + '\n');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { }
	process.exit(res.status ?? 1);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

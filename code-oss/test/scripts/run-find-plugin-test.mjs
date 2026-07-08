#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.7c.3.a · Find plugin + 匹配算法单测 ad-hoc runner。
 *
 *  与 run-toc-interaction-test.mjs 完全同构（换 ENTRY 与 outdir 前缀）：
 *    - `./foo.mjs` → `./foo.template.js` 别名重写（find-plugin 里 import '.mjs'）
 *    - @milkdown/prose 走 builder node_modules（`nodePaths` 注入）
 *    - 不需要 jsdom（纯 DOM-free · doc/view 全 mock）
 *
 *  用法：node code-oss/test/scripts/run-find-plugin-test.mjs
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
	'src/vs/workbench/contrib/vsword/test/node/findPlugin.test.ts',
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
		name: 'vsword-find-plugin-alias',
		setup(build) {
			// find-plugin.template.js 里 `import ... from './find-widget-helpers.mjs'` →
			// 测试环境下没有 build 步骤，把这类 sibling .mjs import 重写回 .template.js。
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
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, `.tmp-find-plugin-`));
	const outfile = path.join(outdir, 'test.mjs');
	console.log(`[find-plugin-test] bundling ${ENTRY} …`);
	await esbuild.build({
		entryPoints: [ENTRY],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts', '.js': 'js' },
		plugins: [makeAliasPlugin()],
		external: ['mocha', 'assert', 'node:*'],
		logLevel: 'error',
		nodePaths: [path.join(BUILDER, 'node_modules')],
	});
	console.log(`[find-plugin-test] bundled at`, outfile);

	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log(`[find-plugin-test] mochaCli=`, mochaCli, 'exists=', fs.existsSync(mochaCli));
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
	console.log(`[find-plugin-test] mocha exit=`, res.status, 'signal=', res.signal);
	process.stdout.write(`--- STDOUT ---\n` + (res.stdout || '') + '\n');
	process.stderr.write(`--- STDERR ---\n` + (res.stderr || '') + '\n');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* noop */ }
	return res.status ?? 1;
}

async function main() {
	console.log('[find-plugin-test] start');
	if (!fs.existsSync(ENTRY)) { throw new Error(`missing test: ${ENTRY}`); }
	const esbuild = await loadEsbuild();
	const code = await bundleAndRun(esbuild);
	process.exit(code);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

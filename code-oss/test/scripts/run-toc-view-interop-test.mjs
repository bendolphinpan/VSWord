#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.7c.1.b · TOC NodeView + 事务级集中重算 Plugin 单测 ad-hoc runner。
 *
 *  职责：把 tocViewModeInterop.test.ts bundle 起来，用 mocha (tdd) 跑。
 *  与 run-toc-remark-test.mjs 保持一致的 alias / NODE_PATH 模式：
 *    - `./foo.mjs` → `./foo.template.js`（源码里 import 走 .mjs，测试跑 .template.js）
 *    - jsdom / @milkdown/* / mocha / assert 走 builder 的 node_modules（NODE_PATH 注入）
 *
 *  用法：node code-oss/test/scripts/run-toc-view-interop-test.mjs
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
	'src/vs/workbench/contrib/vsword/test/node/tocViewModeInterop.test.ts',
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
	const jsdomEntry = pathToFileURL(
		path.join(BUILDER, 'node_modules', 'jsdom', 'lib', 'api.js'),
	).href;
	return {
		name: 'vsword-toc-view-alias',
		setup(build) {
			build.onResolve({ filter: /^\.\/.*\.mjs$/ }, (args) => {
				const base = args.path.slice(2, -'.mjs'.length);
				const candidate = path.join(args.resolveDir, base + '.template.js');
				if (fs.existsSync(candidate)) { return { path: candidate }; }
				return null;
			});
			// jsdom 走 external + 运行时绝对路径解析：内联会踩 dynamic require，
			// Node ESM 又不遵循 NODE_PATH。改成显式重写 `import 'jsdom'` →
			// `import 'file:///.../.tmp/milkdown-prod-builder/node_modules/jsdom/lib/api.js'`。
			build.onResolve({ filter: /^jsdom$/ }, () => ({
				path: jsdomEntry,
				external: true,
			}));
		},
	};
}

async function bundleAndRun(esbuild) {
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, `.tmp-toc-view-`));
	const outfile = path.join(outdir, 'test.mjs');
	console.log(`[toc-view-test] bundling ${ENTRY} …`);
	await esbuild.build({
		entryPoints: [ENTRY],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts', '.js': 'js' },
		plugins: [makeAliasPlugin()],
		// jsdom 含大量 dynamic require（node_modules 深层原生依赖），无法被 esbuild 内联；
		// 保持 external，运行时经 NODE_PATH 从 builder node_modules 解析。
		// @milkdown/prose / @milkdown/utils 可安全内联。
		external: ['mocha', 'assert', 'jsdom', 'node:*'],
		logLevel: 'error',
		nodePaths: [path.join(BUILDER, 'node_modules')],
	});
	console.log(`[toc-view-test] bundled at`, outfile);

	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log(`[toc-view-test] mochaCli=`, mochaCli, 'exists=', fs.existsSync(mochaCli));
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
	console.log(`[toc-view-test] mocha exit=`, res.status, 'signal=', res.signal);
	process.stdout.write(`--- STDOUT ---\n` + (res.stdout || '') + '\n');
	process.stderr.write(`--- STDERR ---\n` + (res.stderr || '') + '\n');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* noop */ }
	return res.status ?? 1;
}

async function main() {
	console.log('[toc-view-test] start');
	if (!fs.existsSync(ENTRY)) { throw new Error(`missing test: ${ENTRY}`); }
	const esbuild = await loadEsbuild();
	const code = await bundleAndRun(esbuild);
	process.exit(code);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

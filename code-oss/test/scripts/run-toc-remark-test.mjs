#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.7c.1.a · TOC remark transform 单测 ad-hoc runner。
 *
 *  职责：把 tocRemark.test.ts + tocRoundtrip.test.ts bundle 起来，用 mocha (tdd) 跑。
 *  参考 run-mode-switch-component-test.mjs 的 alias pattern：
 *    - `./foo.mjs` → `./foo.template.js`（源码里 import 走 .mjs，测试里跑 .template.js）
 *    - unified / remark-parse / mocha 走 builder 的 node_modules（NODE_PATH 注入）
 *
 *  用法：node code-oss/test/scripts/run-toc-remark-test.mjs
 *
 *  可选参数：
 *    --which=remark      仅跑 tocRemark.test.ts
 *    --which=roundtrip   仅跑 tocRoundtrip.test.ts
 *    （默认两个都跑）
 *--------------------------------------------------------------------------------------------*/

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');

const TESTS = {
	remark: path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/node/tocRemark.test.ts'),
	roundtrip: path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/node/tocRoundtrip.test.ts'),
};

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
		name: 'vsword-toc-alias',
		setup(build) {
			// ./foo.mjs → ./foo.template.js（source template resolution）
			build.onResolve({ filter: /^\.\/.*\.mjs$/ }, (args) => {
				const base = args.path.slice(2, -'.mjs'.length);
				const candidate = path.join(args.resolveDir, base + '.template.js');
				if (fs.existsSync(candidate)) { return { path: candidate }; }
				return null;
			});
		},
	};
}

async function bundleAndRun(esbuild, which, entry) {
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, `.tmp-toc-${which}-`));
	const outfile = path.join(outdir, 'test.mjs');
	console.log(`[toc-test:${which}] bundling ${entry} …`);
	await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		outfile,
		loader: { '.ts': 'ts', '.js': 'js' },
		plugins: [makeAliasPlugin()],
		// mocha / assert / node builtins 走原生；unified / remark-parse / @milkdown/utils
		// 通过 NODE_PATH 从 builder node_modules 里解析（保持在 esbuild 层内联进 bundle）。
		external: ['mocha', 'assert', 'node:*'],
		logLevel: 'error',
		nodePaths: [path.join(BUILDER, 'node_modules')],
	});
	console.log(`[toc-test:${which}] bundled at`, outfile);

	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log(`[toc-test:${which}] mochaCli=`, mochaCli, 'exists=', fs.existsSync(mochaCli));
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
	console.log(`[toc-test:${which}] mocha exit=`, res.status, 'signal=', res.signal);
	process.stdout.write(`--- ${which} STDOUT ---\n` + (res.stdout || '') + '\n');
	process.stderr.write(`--- ${which} STDERR ---\n` + (res.stderr || '') + '\n');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* noop */ }
	return res.status ?? 1;
}

async function main() {
	console.log('[toc-test] start');
	const which = (process.argv.find(a => a.startsWith('--which=')) || '').split('=')[1] || 'all';
	const targets = which === 'all' ? Object.keys(TESTS) : [which];
	for (const t of targets) {
		if (!TESTS[t]) { throw new Error(`unknown test: ${t}`); }
		if (!fs.existsSync(TESTS[t])) { throw new Error(`missing test: ${TESTS[t]}`); }
	}
	const esbuild = await loadEsbuild();
	let overallExit = 0;
	for (const t of targets) {
		const code = await bundleAndRun(esbuild, t, TESTS[t]);
		if (code !== 0) { overallExit = code; }
	}
	process.exit(overallExit);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

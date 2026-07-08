#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.7d.1 · 内置主题 audit 最小回归 ad-hoc runner。
 *
 *  职责：把 themeAudit.test.ts bundle 起来，用 mocha (tdd) 跑 3 条断言：
 *    A1 TS / JS 白名单逐字节相同
 *    A2 getThemesCss() 每个非-default id 都有 body[data-theme="<id>"] 选择器
 *    A3 HostThemeChangedMessage.theme 是 string（宽签名）
 *
 *  与 run-find-plugin-test.mjs 完全同构（换 ENTRY + outdir 前缀 + 不需要额外 nodePaths）。
 *  只依赖 builder node_modules 里的 esbuild + mocha；断言用 node:assert，不需要 jsdom。
 *  测试文件里 `import type { HostThemeChangedMessage }` 是 type-only，esbuild 会自动擦除。
 *
 *  用法：node code-oss/test/scripts/run-theme-audit-test.mjs
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
	'src/vs/workbench/contrib/vsword/test/node/themeAudit.test.ts',
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
		name: 'vsword-theme-audit-alias',
		setup(build) {
			// 若 template 里出现 sibling `.mjs` import，重写回 `.template.js`（沿用其它 runner 的模式；
			// themeAudit 目前没有这类 import，但留着更安全）。
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
	const outdir = fs.mkdtempSync(path.join(CODE_OSS, `.tmp-theme-audit-`));
	const outfile = path.join(outdir, 'test.mjs');
	console.log(`[theme-audit-test] bundling ${ENTRY} …`);
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
	console.log(`[theme-audit-test] bundled at`, outfile);

	const mochaCli = path.join(
		CODE_OSS,
		'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''),
	);
	console.log(`[theme-audit-test] mochaCli=`, mochaCli, 'exists=', fs.existsSync(mochaCli));
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
	console.log(`[theme-audit-test] mocha exit=`, res.status, 'signal=', res.signal);
	process.stdout.write(`--- STDOUT ---\n` + (res.stdout || '') + '\n');
	process.stderr.write(`--- STDERR ---\n` + (res.stderr || '') + '\n');
	try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* noop */ }
	return res.status ?? 1;
}

async function main() {
	console.log('[theme-audit-test] start');
	if (!fs.existsSync(ENTRY)) { throw new Error(`missing test: ${ENTRY}`); }
	const esbuild = await loadEsbuild();
	const code = await bundleAndRun(esbuild);
	process.exit(code);
}

process.on('uncaughtException', e => { console.error('UNCAUGHT', e); process.exit(3); });
process.on('unhandledRejection', e => { console.error('UNHANDLED', e); process.exit(4); });
main().catch(e => { console.error('MAINCATCH', e); process.exit(2); });

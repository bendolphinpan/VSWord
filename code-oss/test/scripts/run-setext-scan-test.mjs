#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * RD-1 · setext O(N) scan unit test runner
 *--------------------------------------------------------------------------------------------*/
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const BUILDER = path.resolve(REPO_ROOT, '.tmp', 'milkdown-prod-builder');
const ENTRY = path.join(CODE_OSS, 'src/vs/workbench/contrib/vsword/test/node/setextScan.test.ts');

async function loadEsbuild() {
	const esbuildPkg = path.join(BUILDER, 'node_modules', 'esbuild');
	if (!fs.existsSync(esbuildPkg)) {
		throw new Error(`esbuild not found at ${esbuildPkg}`);
	}
	const main = pathToFileURL(path.join(esbuildPkg, 'lib', 'main.js')).href;
	const mod = await import(main);
	return mod.default || mod;
}

const esbuild = await loadEsbuild();
const outdir = fs.mkdtempSync(path.join(CODE_OSS, '.tmp-setext-scan-'));
const outfile = path.join(outdir, 'test.mjs');
await esbuild.build({
	entryPoints: [ENTRY],
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node20',
	outfile,
	loader: { '.ts': 'ts', '.js': 'js' },
	plugins: [{
		name: 'alias-template',
		setup(build) {
			build.onResolve({ filter: /^\.\/.*\.mjs$/ }, (args) => {
				const base = args.path.slice(2, -'.mjs'.length);
				const candidate = path.join(args.resolveDir, base + '.template.js');
				if (fs.existsSync(candidate)) { return { path: candidate }; }
				return null;
			});
		},
	}],
	external: ['mocha', 'assert', 'node:*'],
	logLevel: 'error',
});

const mochaCli = path.join(CODE_OSS, 'node_modules/.bin/mocha' + (process.platform === 'win32' ? '.cmd' : ''));
const r = cp.spawnSync(mochaCli, [outfile, '--ui', 'tdd', '--timeout', '10000'], {
	cwd: CODE_OSS,
	encoding: 'utf8',
	shell: process.platform === 'win32',
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
try { fs.rmSync(outdir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(r.status ?? 1);

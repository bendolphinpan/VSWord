#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * VSWord Milkdown spike local bundle builder.
 *
 * Dev-only. Installs dependencies into D:/GIT/VSWord/.tmp/milkdown-spike-builder
 * and writes generated assets to this spike's gitignored vendor directory.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const zlib = require('zlib');

const codeOssRoot = process.cwd();
const workspaceRoot = path.resolve(codeOssRoot, '..');
const spikeRoot = __dirname;
const builderDir = path.join(workspaceRoot, '.tmp', 'milkdown-spike-builder');
const srcDir = path.join(builderDir, 'src');
const vendorDir = path.join(spikeRoot, 'vendor');
const webviewEntryPath = path.join(srcDir, 'webview-entry.ts');
const verifyEntryPath = path.join(srcDir, 'roundtrip-verify.mjs');
const webviewBundlePath = path.join(vendorDir, 'index.js');
const thirdPartyPath = path.join(vendorDir, 'THIRD_PARTY_LICENSES.md');
const resultPath = path.join(vendorDir, 'spike-result.json');

const packages = [
	'@milkdown/core@7.21.2',
	'@milkdown/preset-commonmark@7.21.2',
	'@milkdown/preset-gfm@7.21.2',
	'@milkdown/plugin-history@7.21.2',
	'@milkdown/plugin-listener@7.21.2',
	'@milkdown/transformer@7.21.2',
	'@milkdown/prose@7.21.2',
	'esbuild@0.27.0',
	'jsdom@27.3.0',
];

const webviewSampleMarkdown = '# VSWord Milkdown Spike\n\n你好，Milkdown。\n\n- GFM list\n- **bold** and `code`\n';
const roundTripSampleMarkdown = '# 标题 Title\n\n你好，**Milkdown**。\n\n- 第一项\n- second `code`\n\n| 列 A | 列 B |\n| --- | --- |\n| 甲 | 乙 |\n';

function run(command, cwd = builderDir) {
	console.log(`[milkdown-spike] ${command}`);
	cp.execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command], {
		cwd,
		stdio: 'inherit',
	});
}

function exec(command, cwd = builderDir) {
	return cp.execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command], {
		cwd,
		encoding: 'utf8',
	});
}

fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

if (!fs.existsSync(path.join(builderDir, 'package.json'))) {
	fs.writeFileSync(path.join(builderDir, 'package.json'), JSON.stringify({
		private: true,
		name: 'vsword-milkdown-spike-builder',
		version: '0.0.0',
		type: 'module',
	}, null, 2));
}

fs.writeFileSync(webviewEntryPath, `import { Editor, defaultValueCtx, rootCtx, serializerCtx, editorViewCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const root = document.getElementById('milkdown-root');
const status = document.getElementById('milkdown-status');
const initialMarkdown = document.getElementById('milkdown-initial')?.textContent || ${JSON.stringify(webviewSampleMarkdown)};

function setStatus(message, kind = 'info') {
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function reportError(prefix, err) {
  const msg = err && err.stack ? err.stack : String(err);
  setStatus('[' + prefix + '] ' + (msg.split('\\n')[0] || msg).slice(0, 240), 'error');
  vscode?.postMessage({ type: 'webviewError', prefix, message: msg });
  console.error('[vsword-milkdown-spike]', prefix, err);
}

window.addEventListener('error', e => reportError('uncaught', e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));

async function boot() {
  if (!root) throw new Error('Missing #milkdown-root');
  let lastMarkdown = initialMarkdown;
  const editor = await Editor.make()
    .config(ctx => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        lastMarkdown = markdown;
        vscode?.postMessage({ type: 'markdownUpdated', markdown });
      });
    })
    .use(listener)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .create();

  window.__vswordMilkdownSpike = {
    editor,
    getMarkdown() {
      return editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
    },
    getLastMarkdown() { return lastMarkdown; },
  };
  const markdown = window.__vswordMilkdownSpike.getMarkdown();
  setStatus('Milkdown ready. Serialized markdown bytes: ' + new TextEncoder().encode(markdown).length, 'ok');
  vscode?.postMessage({ type: 'ready', markdown });
}

boot().catch(err => reportError('boot', err));
`);

fs.writeFileSync(verifyEntryPath, `import { JSDOM } from 'jsdom';
import { Editor, defaultValueCtx, rootCtx, serializerCtx, editorViewCtx, parserCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';

const source = ${JSON.stringify(roundTripSampleMarkdown)};
const dom = new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'DOMParser', 'MutationObserver', 'Event', 'CustomEvent']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'getSelection', { value: dom.window.getSelection.bind(dom.window), configurable: true, writable: true });
Object.defineProperty(globalThis, 'addEventListener', { value: dom.window.addEventListener.bind(dom.window), configurable: true, writable: true });
Object.defineProperty(globalThis, 'removeEventListener', { value: dom.window.removeEventListener.bind(dom.window), configurable: true, writable: true });
Object.defineProperty(globalThis, 'dispatchEvent', { value: dom.window.dispatchEvent.bind(dom.window), configurable: true, writable: true });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame || (fn => setTimeout(fn, 16));
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame || (id => clearTimeout(id));

const root = document.getElementById('root');

async function main() {
const editor = await Editor.make()
  .config(ctx => {
    ctx.set(rootCtx, root);
    ctx.set(defaultValueCtx, source);
  })
  .use(commonmark)
  .use(gfm)
  .use(history)
  .create();

const output = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
const parserRoundTrip = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(parserCtx)(source)));
const checks = {
  hasChineseHeading: output.includes('标题 Title'),
  hasChineseBody: output.includes('你好'),
  hasStrong: output.includes('**Milkdown**'),
  hasInlineCode: output.includes(String.fromCharCode(96) + 'code' + String.fromCharCode(96)),
  hasTable: output.includes('| 列 A | 列 B |'),
  parserRoundTripHasTable: parserRoundTrip.includes('| 列 A | 列 B |'),
};
await editor.destroy(true);
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const result = { ok: failed.length === 0, failed, sourceBytes: Buffer.byteLength(source), outputBytes: Buffer.byteLength(output), output, parserRoundTrip };
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`);

run(`npm install ${packages.join(' ')} --prefer-offline --no-audit --no-fund`);
const esbuild = require(path.join(builderDir, 'node_modules', 'esbuild'));

console.log('[milkdown-spike] esbuild webview bundle');
esbuild.buildSync({
	entryPoints: [webviewEntryPath],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	outfile: webviewBundlePath,
	legalComments: 'linked',
	minify: true,
	define: {
		'process.env.NODE_ENV': '"production"',
	},
});

console.log('[milkdown-spike] run roundtrip verifier');
const verifyOut = cp.execFileSync(process.execPath, [verifyEntryPath], { cwd: builderDir, encoding: 'utf8' });
const verifyJson = JSON.parse(verifyOut);
const bundle = fs.readFileSync(webviewBundlePath);
const result = {
	builtAt: new Date().toISOString(),
	milkdownVersion: '7.21.2',
	webviewBundleBytes: bundle.length,
	webviewBundleGzipBytes: zlib.gzipSync(bundle).length,
	roundTrip: verifyJson,
	cspNotes: {
		format: 'esm',
		minified: true,
		dynamicEvalScan: {
			evalToken: /\beval\s*\(/.test(bundle.toString('utf8')),
			newFunctionToken: /new Function\s*\(/.test(bundle.toString('utf8')),
		},
	},
};
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

const licenseJson = exec('npm ls --json --long --all');
const tree = JSON.parse(licenseJson);
const seen = new Map();
function walk(name, node) {
	if (!node || !name) return;
	if (node.version && !seen.has(`${name}@${node.version}`)) {
		seen.set(`${name}@${node.version}`, { name, version: node.version, license: node.license || 'UNKNOWN', repository: node.repository?.url || node.repository || '' });
	}
	for (const [childName, child] of Object.entries(node.dependencies || {})) walk(childName, child);
}
walk(tree.name, tree);
const installed = [...seen.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
let out = '# Milkdown Spike Third-Party License Snapshot\n\n';
out += 'Generated from the temporary builder lockfile under `.tmp/milkdown-spike-builder`. This file documents the dev-only spike bundle; it is not a production dependency approval.\n\n';
out += '## Notes\n\n';
out += '- Primary packages: `@milkdown/core`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/plugin-history`, `@milkdown/plugin-listener` @ 7.21.2 (MIT).\n';
out += '- Intentionally avoids `@milkdown/kit` because it pulls `@milkdown/components` / Vue into the spike bundle and currently hits an npm registry resolution failure for `@babel/parser@^7.29.7`.\n';
out += `- Webview bundle: ${result.webviewBundleBytes} bytes raw / ${result.webviewBundleGzipBytes} bytes gzip.\n`;
out += '- Round-trip verifier runs directly from `.tmp/milkdown-spike-builder/src/roundtrip-verify.mjs` against the temporary builder `node_modules`; it is intentionally not bundled because jsdom uses `require.resolve()` for internal assets.\n';
out += '- Generated `vendor/index.js` is a spike artifact, not a production dependency.\n\n';
out += '## Packages\n\n';
for (const pkg of installed) out += `- ${pkg.name}@${pkg.version} — ${pkg.license}${pkg.repository ? ` — ${pkg.repository}` : ''}\n`;
fs.writeFileSync(thirdPartyPath, out);
console.log(`[milkdown-spike] wrote ${webviewBundlePath}`);
console.log(`[milkdown-spike] wrote ${resultPath}`);
console.log(`[milkdown-spike] wrote ${thirdPartyPath}`);
console.log(JSON.stringify(result, null, 2));

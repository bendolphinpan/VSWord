#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * VSWord Milkdown production bundle builder.
 *
 * Installs pinned Milkdown dependencies into D:/GIT/VSWord/.tmp/milkdown-prod-builder
 * and writes CSP-safe webview assets to src/vs/workbench/contrib/vsword/browser/milkdownEditor/vendor.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const zlib = require('zlib');

const codeOssRoot = process.cwd();
const workspaceRoot = path.resolve(codeOssRoot, '..');
const editorRoot = __dirname;
const builderDir = path.join(workspaceRoot, '.tmp', 'milkdown-prod-builder');
const srcDir = path.join(builderDir, 'src');
const vendorDir = path.join(editorRoot, 'vendor');
const entryPath = path.join(srcDir, 'webview-entry.ts');
const verifyPath = path.join(srcDir, 'roundtrip-verify.mjs');
const bundlePath = path.join(vendorDir, 'index.js');
const resultPath = path.join(vendorDir, 'build-result.json');
const thirdPartyPath = path.join(vendorDir, 'THIRD_PARTY_LICENSES.md');

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

function run(command, cwd = builderDir) {
	console.log(`[milkdown-prod] ${command}`);
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
		name: 'vsword-milkdown-prod-builder',
		version: '0.0.0',
		type: 'module',
	}, null, 2));
}

fs.writeFileSync(entryPath, `import { Editor, defaultValueCtx, rootCtx, serializerCtx, editorViewCtx, parserCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const root = document.getElementById('milkdown-root');
const status = document.getElementById('milkdown-status');
const saveButton = document.getElementById('milkdown-save');
const openTextButton = document.getElementById('milkdown-open-text');

let editor;
let currentMarkdown = '';
let dirty = false;
let initialized = false;
let saveSeq = 0;

function setStatus(message, kind = 'info') {
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function serialize() {
  if (!editor) return currentMarkdown;
  return editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
}

function reportError(prefix, err) {
  const msg = err && err.stack ? err.stack : String(err);
  setStatus('[' + prefix + '] ' + (msg.split('\\n')[0] || msg).slice(0, 240), 'error');
  vscode?.postMessage({ type: 'webviewError', prefix, message: msg });
  console.error('[vsword-milkdown]', prefix, err);
}

async function createEditor(markdown) {
  if (!root) throw new Error('Missing #milkdown-root');
  root.textContent = '';
  currentMarkdown = markdown;
  dirty = false;
  initialized = false;
  if (editor) {
    await editor.destroy(true);
    editor = undefined;
  }
  editor = await Editor.make()
    .config(ctx => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.get(listenerCtx).markdownUpdated((ctx, nextMarkdown) => {
        currentMarkdown = nextMarkdown;
        if (!initialized) return;
        dirty = true;
        setStatus('Unsaved changes…', 'dirty');
        vscode?.postMessage({ type: 'markdownUpdated', markdown: nextMarkdown });
      });
    })
    .use(listener)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .create();
  currentMarkdown = serialize();
  initialized = true;
  setStatus('Ready', 'ok');
}

function requestSave() {
  const markdown = serialize();
  currentMarkdown = markdown;
  dirty = true;
  const requestId = 'manual-' + (++saveSeq);
  setStatus('Saving…', 'dirty');
  vscode?.postMessage({ type: 'save', requestId, markdown });
}

saveButton?.addEventListener('click', () => requestSave());
openTextButton?.addEventListener('click', () => vscode?.postMessage({ type: 'openAsText' }));
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    requestSave();
  }
});
window.addEventListener('error', e => reportError('uncaught', e.error || e.message));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));

window.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'init') {
    createEditor(String(msg.markdown ?? '')).catch(err => reportError('init', err));
    return;
  }
  if (msg.type === 'reload') {
    createEditor(String(msg.markdown ?? '')).catch(err => reportError('reload', err));
    return;
  }
  if (msg.type === 'dirtyChanged') {
    dirty = !!msg.dirty;
    setStatus(dirty ? 'Unsaved changes…' : 'Ready', dirty ? 'dirty' : 'ok');
    return;
  }
  if (msg.type === 'saved') {
    if (msg.ok) {
      dirty = false;
      setStatus('Saved', 'ok');
    } else {
      dirty = true;
      setStatus('Save failed: ' + String(msg.message || 'unknown error').slice(0, 180), 'error');
    }
    return;
  }
  if (msg.type === 'hostError') {
    setStatus('Host error: ' + String(msg.message || 'unknown error').slice(0, 180), 'error');
  }
});

vscode?.postMessage({ type: 'ready' });
window.__vswordMilkdown = { getMarkdown: serialize, isDirty: () => dirty };
`);

fs.writeFileSync(verifyPath, `import { JSDOM } from 'jsdom';
import { Editor, defaultValueCtx, rootCtx, serializerCtx, editorViewCtx, parserCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
const source = '# 标题 Title\\n\\n你好，**Milkdown**。\\n\\n- 第一项\\n- second \`code\`\\n\\n| 列 A | 列 B |\\n| --- | --- |\\n| 甲 | 乙 |\\n';
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
const editor = await Editor.make().config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, source); }).use(commonmark).use(gfm).use(history).create();
const output = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
const parserRoundTrip = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(parserCtx)(source)));
await editor.destroy(true);
const checks = {
  hasChineseHeading: output.includes('标题 Title'),
  hasChineseBody: output.includes('你好'),
  hasStrong: output.includes('**Milkdown**'),
  hasInlineCode: output.includes('\`code\`'),
  hasTable: output.includes('| 列 A | 列 B |'),
  parserRoundTripHasTable: parserRoundTrip.includes('| 列 A | 列 B |'),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const result = { ok: failed.length === 0, failed, outputBytes: Buffer.byteLength(output), parserRoundTripBytes: Buffer.byteLength(parserRoundTrip), output };
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
`);

run(`npm install ${packages.join(' ')} --prefer-offline --no-audit --no-fund`);
const esbuild = require(path.join(builderDir, 'node_modules', 'esbuild'));
console.log('[milkdown-prod] esbuild webview bundle');
esbuild.buildSync({
	entryPoints: [entryPath],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	outfile: bundlePath,
	legalComments: 'linked',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('[milkdown-prod] run roundtrip verifier');
const verifyJson = JSON.parse(cp.execFileSync(process.execPath, [verifyPath], { cwd: builderDir, encoding: 'utf8' }));
const bundleText = fs.readFileSync(bundlePath, 'utf8');
const bundle = Buffer.from(bundleText);
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
			evalToken: /\beval\s*\(/.test(bundleText),
			newFunctionToken: /new Function\s*\(/.test(bundleText),
		},
	},
};
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
const licenseJson = exec('npm ls --json --long --all');
const tree = JSON.parse(licenseJson);
const lines = ['# VSWord Milkdown production third-party licenses', '', `Generated: ${new Date().toISOString()}`, '', '| Package | Version | License | Resolved |', '| --- | --- | --- | --- |'];
const seen = new Set();
function walk(node, name) {
	const deps = node.dependencies || {};
	for (const [depName, dep] of Object.entries(deps)) {
		const key = `${depName}@${dep.version || 'unknown'}`;
		if (!seen.has(key)) {
			seen.add(key);
			lines.push(`| ${depName} | ${dep.version || ''} | ${String(dep.license || dep.licenses || '').replace(/\|/g, '\\|')} | ${dep.resolved || ''} |`);
		}
		walk(dep, depName);
	}
}
walk(tree, tree.name);
fs.writeFileSync(thirdPartyPath, lines.join('\n') + '\n');
console.log(JSON.stringify(result, null, 2));

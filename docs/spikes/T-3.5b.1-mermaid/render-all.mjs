#!/usr/bin/env node
// render-all.mjs
// 用 jsdom 装配一个最小 DOM，把 mermaid v11 装到 window 上并调用 render()。
// 目的：22 类图 × { 能否渲染出 svg / 渲染耗时 / v11 报错 }
//
// 说明：mermaid 内部大量用 dynamic import() 拿子图类型的 chunk。Node 原生 ESM
// 对相对路径 import 是支持的，这一步能验证 "chunk 拆分点在 Node/webview 下能
// 走通"；至于 webview 里能不能真正解析到 vscode-resource:// 下的 chunk，是另
// 一个话题（见 spike-report §CSP 结论）。

import { JSDOM } from 'jsdom';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from './fixtures/diagrams.mjs';

// —— DOM 骨架 ——————————————————————————————————————————
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	pretendToBeVisual: true,
	url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
// navigator on Node 24 is a read-only getter — patch via defineProperty only if absent.
if (!('navigator' in globalThis) || !globalThis.navigator?.userAgent) {
	try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already fine */ }
}
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.DOMPurify = null; // 让 mermaid 走内部实现
// jsdom 缺少的一些 API — mermaid 用 getBBox / getComputedTextLength 做布局
if (!dom.window.SVGElement.prototype.getBBox) {
	dom.window.SVGElement.prototype.getBBox = function () {
		return { x: 0, y: 0, width: 100, height: 30 };
	};
}
if (!dom.window.SVGElement.prototype.getComputedTextLength) {
	dom.window.SVGElement.prototype.getComputedTextLength = function () { return 60; };
}
// requestAnimationFrame 兜底
if (!dom.window.requestAnimationFrame) {
	dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}
// jsdom 无 screen — C4Context 里有 bare `screen` 引用
globalThis.screen = { width: 1920, height: 1080 };
try { dom.window.screen = globalThis.screen; } catch { /* noop */ }
// jsdom 的 canvas 后端要 native 模块；mindmap/architecture 拿 2d ctx 做文字测量
{
	const canvasShim = () => ({
		measureText: (t) => ({ width: (t || '').length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
		fillText() {}, strokeText() {}, save() {}, restore() {},
		translate() {}, rotate() {}, scale() {}, beginPath() {},
		moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
		setLineDash() {}, clearRect() {}, fillRect() {}, arc() {}, quadraticCurveTo() {},
		set font(_v) {}, get font() { return '12px sans-serif'; },
		set textAlign(_v) {}, set textBaseline(_v) {},
		set fillStyle(_v) {}, set strokeStyle(_v) {},
	});
	Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', {
		value: canvasShim, configurable: true, writable: true,
	});
}

const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

const results = [];
let index = 0;

for (const f of FIXTURES) {
	index += 1;
	const id = `spike-${index}-${f.id.replace(/[^a-z0-9]/gi, '_')}`;
	let ok = false;
	let err = null;
	let svgLen = 0;
	let hasSvgTag = false;
	const t0 = performance.now();
	try {
		const { svg } = await mermaid.render(id, f.src);
		svgLen = svg.length;
		hasSvgTag = /<svg[\s>]/i.test(svg);
		ok = hasSvgTag;
	} catch (e) {
		err = String(e && (e.message || e)).slice(0, 300);
	}
	const elapsed = +(performance.now() - t0).toFixed(1);
	results.push({
		id: f.id, tier: f.tier, ok, elapsedMs: elapsed,
		svgBytes: svgLen, hasSvgTag,
		err,
	});
	// 进度日志
	const status = ok ? 'OK ' : 'ERR';
	process.stderr.write(`[${status}] ${f.tier.padEnd(4)} ${f.id.padEnd(24)} ${elapsed}ms  svg=${svgLen}\n`);
}

// 二次尝试：external diagram 注册（尝试仅对 err 的类型注册）
// mermaid v11 起，多数原 -external 已内置；这里只汇报"是否需要 registerExternalDiagrams"。
const externalHint = results.filter(r => !r.ok && /must be registered|external/i.test(r.err || ''));
const summary = {
	mermaidVersion: (await import('./node_modules/mermaid/package.json', { with: { type: 'json' } })).default.version,
	total: results.length,
	ok: results.filter(r => r.ok).length,
	failed: results.filter(r => !r.ok).length,
	byTier: {
		GA: {
			total: results.filter(r => r.tier === 'GA').length,
			ok: results.filter(r => r.tier === 'GA' && r.ok).length,
		},
		beta: {
			total: results.filter(r => r.tier === 'beta').length,
			ok: results.filter(r => r.tier === 'beta' && r.ok).length,
		},
	},
	externalRegistrationHits: externalHint.length,
	results,
};

mkdirSync(join(import.meta.dirname, 'reports'), { recursive: true });
writeFileSync(join(import.meta.dirname, 'reports/render-22.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

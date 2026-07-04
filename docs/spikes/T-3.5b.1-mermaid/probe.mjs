// T-3.5b.1 · Mermaid 探路 probe
// 目的：
//   1. 在 jsdom 里驱动 mermaid v11 逐类 render 22 类图，看能否出 svg + 计时。
//   2. 顺带把 mermaid 主入口 + 核心 chunk 的尺寸打出来，评估懒加载体积。
//   3. 结果 dump 到 report.json，供报告直接引用（避免我手写数据篡改）。
//
// 环境限制：
//   node + jsdom，非 vscode webview。CSP 层要靠"静态扫描 bundle 源码"另外验证，
//   这里只关心 render 能力 + 引擎自身的 API 稳定性。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { fixtures } from './fixtures.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ---- jsdom 装配（尽量贴近 webview 环境）----------------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	url: 'https://vsword-spike.local/',
	pretendToBeVisual: true,
});
const { window } = dom;
// mermaid 在浏览器里读 window / document / DOMParser 等；这里补齐 globals。
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGElement = window.SVGElement;
globalThis.Node = window.Node;
globalThis.DOMParser = window.DOMParser;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* navigator already defined by node 24, jsdom's is close enough */ }
globalThis.getComputedStyle = window.getComputedStyle;
// jsdom 未实现 SVG 2D 度量（getBBox / getComputedTextLength）——mermaid 大量图类型
// 依赖它们布局。真实浏览器/webview 全都可用；在 spike 里我们给一个"能返回近似值"
// 的 stub 让渲染路径能跑完，从而把"引擎/CSP 级"失败与"jsdom 环境"失败区分开来。
function installSvgMetricStubs(win) {
	const w = win || window;
	const stubBBox = function () {
		const text = (this && (this.textContent || '')) || '';
		return { x: 0, y: 0, width: Math.max(8, text.length * 7), height: 14 };
	};
	const stubLen = function () {
		const text = (this && (this.textContent || '')) || '';
		return Math.max(8, text.length * 7);
	};
	const proto = w.SVGElement && w.SVGElement.prototype;
	if (proto) {
		if (typeof proto.getBBox !== 'function') proto.getBBox = stubBBox;
		if (typeof proto.getComputedTextLength !== 'function') proto.getComputedTextLength = stubLen;
		if (typeof proto.getSubStringLength !== 'function') proto.getSubStringLength = stubLen;
	}
	// 部分 mermaid 代码走 HTMLElement.getBoundingClientRect（jsdom 有实现，但返回 0 宽高）
	// 已够用，不 stub。
	// C4 用到全局 screen — jsdom 没有；补一个占位。
	if (typeof w.screen === 'undefined' || w.screen == null) {
		try { Object.defineProperty(w, 'screen', { value: { width: 1024, height: 768 }, configurable: true }); } catch { /* ignore */ }
	}
	try { Object.defineProperty(globalThis, 'screen', { value: w.screen, configurable: true }); } catch { /* ignore */ }
}
installSvgMetricStubs(window);
// jsdom 不带 canvas 后端 —— mermaid mindmap / architecture-beta 用
// HTMLCanvasElement.getContext('2d').measureText 算 label 宽度。
// 真实浏览器 / Electron webview 有完整实现；这里 stub 一个足够 mermaid 收敛布局的假 ctx。
function installCanvasStub(win) {
	const HTMLCanvasElement = win.HTMLCanvasElement;
	if (!HTMLCanvasElement) return;
	const origGet = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (kind) {
		if (kind === '2d') {
			return {
				canvas: this,
				font: '',
				textBaseline: '',
				textAlign: '',
				fillStyle: '',
				strokeStyle: '',
				measureText: (t) => ({
					width: Math.max(4, String(t || '').length * 7),
					actualBoundingBoxAscent: 10,
					actualBoundingBoxDescent: 3,
				}),
				save: () => {}, restore: () => {},
				beginPath: () => {}, closePath: () => {},
				moveTo: () => {}, lineTo: () => {}, arc: () => {},
				fill: () => {}, stroke: () => {},
				fillText: () => {}, strokeText: () => {},
				setTransform: () => {}, transform: () => {},
				translate: () => {}, scale: () => {}, rotate: () => {},
				clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
				createLinearGradient: () => ({ addColorStop: () => {} }),
			};
		}
		return origGet ? origGet.call(this, kind) : null;
	};
}
installCanvasStub(window);
// mermaid 用到 requestAnimationFrame / cancelAnimationFrame
globalThis.requestAnimationFrame = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
globalThis.cancelAnimationFrame = window.cancelAnimationFrame || (id => clearTimeout(id));

// 动态 import mermaid，跟未来 webview 懒加载策略一致
const importStart = performance.now();
const mermaidMod = await import('mermaid');
const importMs = performance.now() - importStart;
const mermaid = mermaidMod.default;

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

// ---- 尺寸测量（raw + gzip）---------------------------------------------
function fileSize(p) {
	try {
		const buf = fs.readFileSync(p);
		return { raw: buf.length, gzip: zlib.gzipSync(buf).length };
	} catch (e) {
		return { raw: 0, gzip: 0, err: String(e.message || e) };
	}
}
const mermaidRoot = path.dirname(path.dirname(new URL(import.meta.resolve('mermaid/package.json')).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const distDir = path.join(mermaidRoot, 'mermaid', 'dist');
// 常见入口
const entryCandidates = [
	'mermaid.core.mjs',       // package.json 里 module
	'mermaid.esm.min.mjs',    // 官方压缩 ESM
	'mermaid.min.js',         // UMD 压缩
	'mermaid.esm.mjs',
];
const bundleSizes = {};
for (const name of entryCandidates) {
	const p = path.join(distDir, name);
	if (fs.existsSync(p)) bundleSizes[name] = fileSize(p);
}
// 统计 dist 目录所有 chunk 数
let chunkCount = 0;
let chunkTotalRaw = 0;
let chunkTotalGzip = 0;
try {
	const files = fs.readdirSync(distDir);
	for (const f of files) {
		if (!/\.(m?js)$/.test(f)) continue;
		chunkCount++;
		const s = fileSize(path.join(distDir, f));
		chunkTotalRaw += s.raw;
		chunkTotalGzip += s.gzip;
	}
} catch { /* ignore */ }

// ---- 静态扫描 CSP 敏感特征 --------------------------------------------
function scanCsp(files) {
	const report = {};
	for (const f of files) {
		const p = path.join(distDir, f);
		if (!fs.existsSync(p)) continue;
		const text = fs.readFileSync(p, 'utf8');
		report[f] = {
			evalCalls: (text.match(/\beval\s*\(/g) || []).length,
			newFunctionCalls: (text.match(/new\s+Function\s*\(/g) || []).length,
			functionCtorCalls: (text.match(/\bFunction\s*\(\s*["'`]/g) || []).length,
			dynamicImports: (text.match(/import\s*\(/g) || []).length,
			documentWrite: /document\.write/.test(text),
			innerHTMLSet: (text.match(/\.innerHTML\s*=/g) || []).length,
			sizeBytes: text.length,
		};
	}
	return report;
}
const cspScan = scanCsp(entryCandidates);

// ---- 22 类 fixture render 循环 ----------------------------------------
const results = [];
let idx = 0;
for (const [name, code] of fixtures) {
	idx++;
	const id = 'm-' + idx + '-' + name.replace(/[^a-zA-Z0-9]/g, '');
	const t0 = performance.now();
	let ok = false, err = null, svgLen = 0, hasSvg = false;
	try {
		const { svg } = await mermaid.render(id, code);
		svgLen = svg?.length || 0;
		hasSvg = /<svg\b/.test(svg || '');
		ok = hasSvg && svgLen > 0;
	} catch (e) {
		err = (e && (e.message || e.str)) ? String(e.message || e.str) : String(e);
	}
	const ms = +(performance.now() - t0).toFixed(1);
	results.push({ name, ok, hasSvg, svgLen, ms, err });
}

// ---- 收尾 ----
const report = {
	generatedAt: new Date().toISOString(),
	mermaidVersion: JSON.parse(fs.readFileSync(path.join(mermaidRoot, 'mermaid', 'package.json'), 'utf8')).version,
	dynamicImportMs: +importMs.toFixed(1),
	bundleSizes,
	distSummary: { chunkCount, chunkTotalRaw, chunkTotalGzip },
	cspScan,
	fixtures: results,
	summary: {
		total: results.length,
		pass: results.filter(r => r.ok).length,
		fail: results.filter(r => !r.ok).length,
	},
};

fs.writeFileSync(path.join(here, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log('mermaid version:', report.mermaidVersion);
console.log('dynamic import ms:', report.dynamicImportMs);
console.log('bundleSizes:');
for (const [k, v] of Object.entries(report.bundleSizes)) console.log('  ', k, 'raw', v.raw, 'gzip', v.gzip);
console.log('dist total chunks:', report.distSummary.chunkCount, 'raw', report.distSummary.chunkTotalRaw, 'gzip', report.distSummary.chunkTotalGzip);
console.log('CSP scan (per entry):');
for (const [k, v] of Object.entries(report.cspScan)) console.log('  ', k, v);
console.log('per-fixture:');
for (const r of report.fixtures) console.log(' ', r.ok ? '✓' : '✗', r.name.padEnd(22), r.ms.toString().padStart(6), 'ms', 'svg=' + r.svgLen, r.err ? '  err=' + r.err.slice(0, 100) : '');

#!/usr/bin/env node
// theme-switch.mjs
// 目标：测量主题切换的实际成本。
//   1) mermaid.initialize({ theme }) 是全局的，切主题后必须逐图 re-render
//   2) 有没有 per-render theme 覆盖？—— 通过 %%{init: {'theme':'dark'}}%% 前缀
//   3) 10/50 张图批量重渲染耗时

import { JSDOM } from 'jsdom';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
globalThis.screen = { width: 1920, height: 1080 };
if (!dom.window.requestAnimationFrame) dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', {
	value: () => ({
		measureText: (t) => ({ width: (t || '').length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
		fillText() {}, strokeText() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
		beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, setLineDash() {},
		clearRect() {}, fillRect() {}, arc() {}, quadraticCurveTo() {},
		set font(_v) {}, get font() { return '12px sans-serif'; },
		set textAlign(_v) {}, set textBaseline(_v) {}, set fillStyle(_v) {}, set strokeStyle(_v) {},
	}),
	configurable: true, writable: true,
});
Object.defineProperty(dom.window.SVGElement.prototype, 'getBBox', { value: () => ({ x: 0, y: 0, width: 100, height: 30 }), configurable: true });
Object.defineProperty(dom.window.SVGElement.prototype, 'getComputedTextLength', { value: () => 60, configurable: true });

const { default: mermaid } = await import('mermaid');

// —— 场景 1：per-render theme 覆盖（%%{init}%% frontmatter） ————————
mermaid.initialize({ startOnLoad: false, theme: 'default' });
const src1 = `flowchart LR\n  A --> B`;
const srcWithInitDark = `%%{init: {'theme':'dark'}}%%\nflowchart LR\n  A --> B`;
const { svg: svgDefault } = await mermaid.render('t1', src1);
const { svg: svgInitDark }= await mermaid.render('t2', srcWithInitDark);

// mermaid 会在 SVG 里注入 CSS 变量（比如 --mm-node-fill）— 判断 theme 生效可看
// 生成 SVG 中的 background/fill 关键色差异。用简单的字符串匹配：dark 主题的
// stroke 一般为 lightgrey/#ccc，default 是 #333。
function extractColor(svg) {
	const bg = svg.match(/background:\s*([^;"]+)/i)?.[1] || '';
	const stroke = svg.match(/stroke:\s*([^;"]+)/i)?.[1] || '';
	return { bg, stroke };
}
const perRenderOverride = {
	default: extractColor(svgDefault),
	initDark: extractColor(svgInitDark),
	svgDefaultBytes: svgDefault.length,
	svgInitDarkBytes: svgInitDark.length,
	looksLikeDifferent: svgDefault.slice(0, 400) !== svgInitDark.slice(0, 400) &&
		svgDefault.length !== svgInitDark.length,
};

// —— 场景 2：mermaid.initialize + 批量 re-render 耗时 ————————
const bench = { batch10: null, batch50: null };
for (const N of [10, 50]) {
	// 每次 initialize 完，render N 张 flowchart
	mermaid.initialize({ startOnLoad: false, theme: 'default' });
	const sources = Array.from({ length: N }, (_, i) => `flowchart LR\n  A${i} --> B${i} --> C${i}`);
	// 先跑一遍热身 default
	const t0 = performance.now();
	for (let i = 0; i < N; i++) await mermaid.render('warm-' + i, sources[i]);
	const t1 = performance.now();
	// 切 dark 重跑
	mermaid.initialize({ startOnLoad: false, theme: 'dark' });
	const t2 = performance.now();
	for (let i = 0; i < N; i++) await mermaid.render('dark-' + i, sources[i]);
	const t3 = performance.now();
	// 再切回 default 重跑
	mermaid.initialize({ startOnLoad: false, theme: 'default' });
	const t4 = performance.now();
	for (let i = 0; i < N; i++) await mermaid.render('back-' + i, sources[i]);
	const t5 = performance.now();
	const key = 'batch' + N;
	bench[key] = {
		N,
		initialRenderMs: +(t1 - t0).toFixed(1),
		reRenderDarkMs: +(t3 - t2).toFixed(1),
		reRenderBackMs: +(t5 - t4).toFixed(1),
		perImageAvgMsDark: +((t3 - t2) / N).toFixed(2),
	};
}

const report = {
	mermaidVersion: (await import('./node_modules/mermaid/package.json', { with: { type: 'json' } })).default.version,
	perRenderOverride,
	batchReRender: bench,
	conclusion: {
		perRenderThemeOverride: perRenderOverride.looksLikeDifferent
			? 'YES — %%{init: {theme}}%% frontmatter works per-diagram (no global initialize needed).'
			: 'NO — must call mermaid.initialize({theme}) globally.',
	},
};

writeFileSync(join(import.meta.dirname, 'reports/theme-switch.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

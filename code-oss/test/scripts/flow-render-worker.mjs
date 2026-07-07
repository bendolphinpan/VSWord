#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.5b-flowseq.3c · Flow render worker（helper 子进程）
 *
 *  被 gate-f / flowRoundtrip.test / flow-selfcheck / fixture-bootstrap 共用。
 *  在 jsdom + raphael 里跑 flowchart.js，渲染 fixture 集合，输出 JSON 到 --out。
 *
 *  用法：
 *    node flow-render-worker.mjs \
 *      --ids flow-basic,flow-condition,... \
 *      [--iterations 1] \
 *      --out <json-path>
 *
 *  若不给 --ids，默认跑全部 FLOW_FIXTURES。
 *
 *  与 mermaid-render-worker.mjs 差别：
 *    • 不需要 canvas / screen / cytoscape shim
 *    • 需要 SVGSVGElement.prototype.createSVGMatrix / getScreenCTM shim
 *    • 不需要 cache-bust import：flowchart.js 无模块级 counter，raphael 的
 *      id 由 Math.random 派生，seeded LCG 每次 render 前 reset seed 就稳
 *      （spike .hermes-scratch/flowseq-spike3.mjs 已验证 3 遍字节完全一致）
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE_OSS = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(CODE_OSS, '..');
const VSWORD = path.resolve(CODE_OSS, 'src/vs/workbench/contrib/vsword');
const BUILDER_A = path.resolve(VSWORD, 'browser/.tmp/milkdown-prod-builder');
const BUILDER_B = path.resolve(REPO_ROOT, '.tmp/milkdown-prod-builder');

const argv = new Map();
for (let i = 2; i < process.argv.length; i++) {
	const a = process.argv[i];
	if (a.startsWith('--')) {
		const key = a.slice(2);
		const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
		argv.set(key, val);
	}
}

function pickBuilder() {
	if (fs.existsSync(path.join(BUILDER_A, 'node_modules', 'flowchart.js', 'package.json'))) { return BUILDER_A; }
	if (fs.existsSync(path.join(BUILDER_B, 'node_modules', 'flowchart.js', 'package.json'))) { return BUILDER_B; }
	throw new Error('flowchart.js not found under any .tmp/milkdown-prod-builder path');
}

async function main() {
	const builder = pickBuilder();
	const requireFromBuilder = createRequire(pathToFileURL(path.join(builder, 'node_modules/')).href);
	const jsdomEntry = pathToFileURL(requireFromBuilder.resolve('jsdom')).href;
	const flowchartPkg = JSON.parse(fs.readFileSync(path.join(builder, 'node_modules/flowchart.js/package.json'), 'utf8'));
	const raphaelPkg = JSON.parse(fs.readFileSync(path.join(builder, 'node_modules/raphael/package.json'), 'utf8'));

	const { normalizeFlowSeqSvg } = await import(pathToFileURL(path.join(VSWORD, 'test/utils/flowseq-svg-normalize.mjs')).href);
	const { FLOW_FIXTURES } = await import(pathToFileURL(path.join(VSWORD, 'test/fixtures/flow/_index.mjs')).href);

	// —— jsdom 装配（含 raphael 需要的 SVG shim）——
	const jsdomMod = await import(jsdomEntry);
	const { JSDOM } = jsdomMod;
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		pretendToBeVisual: true, url: 'http://localhost/',
	});
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.SVGElement = dom.window.SVGElement;
	globalThis.self = dom.window;
	if (!('navigator' in globalThis) || !globalThis.navigator?.userAgent) {
		try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* ok */ }
	}
	if (!dom.window.SVGElement.prototype.getBBox) {
		dom.window.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: 100, height: 30 }; };
	}
	if (!dom.window.SVGElement.prototype.getComputedTextLength) {
		dom.window.SVGElement.prototype.getComputedTextLength = function () { return 60; };
	}
	if (!dom.window.requestAnimationFrame) {
		dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
	}
	function makeMatrix(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
		const m = { a, b, c, d, e, f };
		m.multiply = (o) => makeMatrix(a * o.a + c * o.b, b * o.a + d * o.b, a * o.c + c * o.d, b * o.c + d * o.d, a * o.e + c * o.f + e, b * o.e + d * o.f + f);
		m.inverse = () => { const det = a * d - b * c; return makeMatrix(d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det); };
		m.translate = (x, y) => m.multiply(makeMatrix(1, 0, 0, 1, x, y));
		m.scale = (sx, sy) => m.multiply(makeMatrix(sx, 0, 0, sy ?? sx, 0, 0));
		m.rotate = (ang) => { const r = ang * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r); return m.multiply(makeMatrix(cos, sin, -sin, cos, 0, 0)); };
		m.rotateFromVector = () => m;
		m.skewX = () => m; m.skewY = () => m; m.flipX = () => m; m.flipY = () => m;
		return m;
	}
	if (!dom.window.SVGSVGElement.prototype.createSVGMatrix) {
		dom.window.SVGSVGElement.prototype.createSVGMatrix = function () { return makeMatrix(); };
	}
	if (!dom.window.SVGSVGElement.prototype.createSVGPoint) {
		dom.window.SVGSVGElement.prototype.createSVGPoint = function () {
			const p = { x: 0, y: 0 };
			p.matrixTransform = (m) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
			return p;
		};
	}
	try { Object.defineProperty(dom.window.SVGElement.prototype, 'getScreenCTM', { value: () => makeMatrix(), configurable: true, writable: true }); } catch { /* ok */ }
	try { Object.defineProperty(dom.window.SVGElement.prototype, 'getCTM', { value: () => makeMatrix(), configurable: true, writable: true }); } catch { /* ok */ }

	// —— 确定性 shim ——
	const LCG_SEED_BASE = 0x9E3779B9;
	let lcgState = LCG_SEED_BASE >>> 0;
	function resetSeed() { lcgState = LCG_SEED_BASE >>> 0; }
	Math.random = function seededRandom() {
		lcgState = (Math.imul(lcgState, 1664525) + 1013904223) >>> 0;
		return lcgState / 0x100000000;
	};
	const FROZEN_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();
	const realTimer = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : Date.now.bind(Date);
	const OrigDate = dom.window.Date;
	globalThis.Date = new Proxy(OrigDate, {
		construct(target, args) { return args.length === 0 ? new target(FROZEN_NOW) : new target(...args); },
		apply(target, thisArg, args) { return args.length === 0 ? new target(FROZEN_NOW).toString() : Reflect.apply(target, thisArg, args); },
		get(target, prop, receiver) { if (prop === 'now') { return () => FROZEN_NOW; } return Reflect.get(target, prop, receiver); },
	});
	try { dom.window.Date = globalThis.Date; } catch { /* ok */ }

	// —— 装 flowchart.js（隐式依赖 raphael）——
	// raphael 通过 require('raphael') 由 flowchart.js 自装载，不需要预挂 globalThis
	const flowchart = requireFromBuilder('flowchart.js');
	if (!flowchart || typeof flowchart.parse !== 'function') {
		throw new Error('flowchart.js 模块缺少 parse');
	}

	const idsArg = argv.get('ids');
	const iterations = Math.max(1, parseInt(argv.get('iterations') || '1', 10));
	const wantedIds = idsArg && idsArg !== 'true' ? new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean)) : null;

	const targets = FLOW_FIXTURES.filter(f => !wantedIds || wantedIds.has(f.id));
	const results = [];
	for (const f of targets) {
		const perIter = [];
		let overallOk = true;
		let firstErr = null;
		for (let it = 0; it < iterations; it++) {
			resetSeed();
			const host = dom.window.document.createElement('div');
			dom.window.document.body.appendChild(host);
			const t0 = realTimer();
			try {
				const diagram = flowchart.parse(f.src);
				diagram.drawSVG(host, { 'font-size': 14 });
				const svgEl = host.querySelector('svg');
				const svg = svgEl ? new dom.window.XMLSerializer().serializeToString(svgEl) : '';
				const norm = normalizeFlowSeqSvg(svg);
				perIter.push({ ok: true, ms: Math.round(realTimer() - t0), svgBytes: svg.length, normBytes: norm.length, normalized: norm });
			} catch (e) {
				overallOk = false;
				if (!firstErr) { firstErr = String(e && (e.message || e)).slice(0, 400); }
				perIter.push({ ok: false, ms: Math.round(realTimer() - t0), error: String(e && (e.message || e)).slice(0, 400) });
			} finally {
				host.remove();
			}
		}
		results.push({ id: f.id, tier: f.tier, ok: overallOk, error: firstErr, iterations: perIter });
	}

	const payload = {
		flowchartVersion: flowchartPkg.version,
		raphaelVersion: raphaelPkg.version,
		builder,
		iterations,
		total: results.length,
		okCount: results.filter(r => r.ok).length,
		failCount: results.filter(r => !r.ok).length,
		results,
	};

	const outPath = argv.get('out');
	if (outPath && outPath !== 'true') {
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, JSON.stringify(payload), 'utf8');
	} else {
		process.stdout.write(JSON.stringify(payload));
	}
}

main().then(() => {
	// jsdom pretendToBeVisual + rAF shim 会挂 timer；短命 helper 直接 exit
	process.exit(0);
}).catch(err => {
	process.stderr.write('[flow-render-worker] fatal: ' + (err && err.stack || err) + '\n');
	process.exit(2);
});

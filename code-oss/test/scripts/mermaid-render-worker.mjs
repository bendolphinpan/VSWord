#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  T-3.5b.5 · Mermaid render worker（helper 子进程）
 *
 *  被 gate-f / roundtrip.test / selfcheck / fixture-bootstrap 共用。
 *  在 jsdom 里跑 mermaid v11，渲染 fixture 集合，输出 JSON 到 --out。
 *
 *  用法：
 *    node mermaid-render-worker.mjs \
 *      --ids flowchart,sequenceDiagram,... \
 *      [--iterations 1] \
 *      --out <json-path>
 *
 *  若不给 --ids，默认跑全部 22 类。
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
	if (fs.existsSync(path.join(BUILDER_A, 'node_modules', 'mermaid', 'package.json'))) { return BUILDER_A; }
	if (fs.existsSync(path.join(BUILDER_B, 'node_modules', 'mermaid', 'package.json'))) { return BUILDER_B; }
	throw new Error('mermaid package not found under any .tmp/milkdown-prod-builder path');
}

async function main() {
	const builder = pickBuilder();
	// 让 jsdom / mermaid / 依赖都从 builder/node_modules 加载。
	const requireFromBuilder = createRequire(pathToFileURL(path.join(builder, 'node_modules/')).href);
	const jsdomEntry = pathToFileURL(requireFromBuilder.resolve('jsdom')).href;
	const mermaidPkg = JSON.parse(fs.readFileSync(path.join(builder, 'node_modules/mermaid/package.json'), 'utf8'));
	// v11: 默认 ESM 入口在 exports['.'].import 或退回 dist/mermaid.core.mjs
	let mermaidEntryRel = 'dist/mermaid.core.mjs';
	try {
		const exp = mermaidPkg.exports && mermaidPkg.exports['.'];
		if (exp) {
			if (typeof exp.import === 'string') { mermaidEntryRel = exp.import; }
			else if (exp.import && typeof exp.import.default === 'string') { mermaidEntryRel = exp.import.default; }
		}
	} catch { /* fall back */ }
	if (mermaidEntryRel.startsWith('./')) { mermaidEntryRel = mermaidEntryRel.slice(2); }
	const mermaidEntry = pathToFileURL(path.join(builder, 'node_modules/mermaid', mermaidEntryRel)).href;

	const { bootstrapMermaidDom, normalizeMermaidSvg } = await import(pathToFileURL(path.join(VSWORD, 'test/utils/mermaid-svg-normalize.mjs')).href);
	const { MERMAID_FIXTURES } = await import(pathToFileURL(path.join(VSWORD, 'test/fixtures/mermaid/_index.mjs')).href);

	// 让 bootstrapMermaidDom 里的 `import('jsdom')` 能解析：把 jsdom 挂到 module cache 上不方便，
	// 转而在这里内联做 jsdom 装载并复用它。改用直接 import(URL)。
	const jsdomMod = await import(jsdomEntry);
	const { JSDOM } = jsdomMod;
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		pretendToBeVisual: true,
		url: 'http://localhost/',
	});
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.SVGElement = dom.window.SVGElement;
	globalThis.DOMPurify = null;
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
	globalThis.screen = { width: 1920, height: 1080 };
	try { dom.window.screen = globalThis.screen; } catch { /* ok */ }
	const canvasShim = () => ({
		font: '', textBaseline: '', textAlign: '',
		fillStyle: '', strokeStyle: '',
		measureText: (t) => ({
			width: Math.max(4, String(t || '').length * 7),
			actualBoundingBoxAscent: 10,
			actualBoundingBoxDescent: 3,
		}),
		save() {}, restore() {},
		beginPath() {}, closePath() {},
		moveTo() {}, lineTo() {}, arc() {}, quadraticCurveTo() {}, bezierCurveTo() {},
		fill() {}, stroke() {},
		fillText() {}, strokeText() {},
		setTransform() {}, transform() {}, resetTransform() {},
		translate() {}, scale() {}, rotate() {},
		clearRect() {}, fillRect() {}, strokeRect() {},
		setLineDash() {}, getLineDash() { return []; },
		createLinearGradient: () => ({ addColorStop() {} }),
		createRadialGradient: () => ({ addColorStop() {} }),
		createPattern: () => null,
		drawImage() {}, putImageData() {},
		getImageData: () => ({ data: new Uint8ClampedArray(4) }),
		clip() {}, isPointInPath: () => false,
	});
	Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', {
		value: canvasShim, configurable: true, writable: true,
	});
	// jsdom 27（builder 里的版本）的 HTMLElement.clientWidth/offsetWidth 是 IDL getter，
	// 未挂载 layout 时抛错；getComputedStyle().padding-* 返回 ''，parseFloat 就是 NaN。
	// cytoscape 的 GridLayout 用 `cy.width()` 做 boundingBox，NaN 会让 makeBoundingBox
	// 返回 undefined，随后 `bb.h` 抛 "Cannot read properties of undefined"。
	// jsdom 29 直接返回 0 —— 我们复现 29 的语义。
	for (const prop of ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight']) {
		Object.defineProperty(dom.window.HTMLElement.prototype, prop, {
			get() { return 0; }, configurable: true,
		});
	}
	const origGCS = dom.window.getComputedStyle.bind(dom.window);
	dom.window.getComputedStyle = (el, pseudo) => {
		const cs = origGCS(el, pseudo);
		const orig = cs.getPropertyValue?.bind(cs);
		if (orig) {
			cs.getPropertyValue = (name) => {
				const v = orig(name);
				if (!v && typeof name === 'string' && /^padding|^margin|^border/i.test(name)) {
					return '0px';
				}
				return v;
			};
		}
		return cs;
	};
	// bootstrapMermaidDom 未被调用，因它依赖 import('jsdom')；上面已复用同一份 jsdom 装配。
	void bootstrapMermaidDom;

	// ─── 确定性 shim ──────────────────────────────────────────────────
	//   同进程连跑 3 遍时，六类 fixture (sequenceDiagram / classDiagram /
	//   requirementDiagram / gitGraph / sankey-beta / architecture-beta) 会因为
	//   `Math.random()`（dagre / cytoscape layout 随机初始位置 + gitGraph commit
	//   hash）+ `Date.now()`（gantt today line 坐标）而 svg 字节不一致。
	//   worker 是短命子进程，直接 monkey-patch Math.random 为 seeded LCG，
	//   并冻结 Date 到固定时间点；每次 render 前 reset seed，保证 svg 字节稳定。
	const LCG_SEED_BASE = 0x9E3779B9; // 任意常数
	let lcgState = LCG_SEED_BASE;
	function resetRandomSeed() { lcgState = LCG_SEED_BASE >>> 0; }
	Math.random = function seededRandom() {
		// 32-bit LCG: Numerical Recipes 常数
		lcgState = (Math.imul(lcgState, 1664525) + 1013904223) >>> 0;
		return lcgState / 0x100000000;
	};
	// 冻结时间：gantt today line 依赖 `new Date()` 相对源码里 2024-01-01 的距离。
	const FROZEN_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();
	// 保留一份原始 Date.now / performance.now 引用给 timer 用，Proxy 后不能再靠它测时长。
	const realTimer = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : Date.now.bind(Date);
	const OrigDate = dom.window.Date;
	globalThis.Date = new Proxy(OrigDate, {
		construct(target, args) { return args.length === 0 ? new target(FROZEN_NOW) : new target(...args); },
		apply(target, thisArg, args) { return args.length === 0 ? new target(FROZEN_NOW).toString() : Reflect.apply(target, thisArg, args); },
		get(target, prop, receiver) {
			if (prop === 'now') { return () => FROZEN_NOW; }
			return Reflect.get(target, prop, receiver);
		},
	});
	try { dom.window.Date = globalThis.Date; } catch { /* ok */ }
	// ─────────────────────────────────────────────────────────────────

	// mermaid v11 在模块顶层维护若干自增 counter（sequenceDiagram actor id、
	// classDiagram 子 id、sankey node-id、architecture id 冲突后缀等）。
	// selfcheck 需要"同源码同环境三遍字节一致"——单进程内 counter 会跨 render 递增，
	// 所以每一遍都用 cache-bust 重新 import mermaid，counter 归零。
	// import 一次 ≈ 200-500ms，22 类 × 3 遍 ≈ 40s 内跑完，在 gate-f timeout 内。
	async function freshMermaid(bust) {
		const mod = await import(mermaidEntry + '?bust=' + bust);
		const m = mod.default || mod;
		m.initialize({
			startOnLoad: false,
			theme: 'default',
			securityLevel: 'strict',
			deterministicIds: true,
			deterministicIDSeed: 'vsword-mermaid-gate-f',
		});
		return m;
	}
	// 预热一次，让首次 render 的冷启动开销不算进第一条 fixture 的 ms 上。
	await freshMermaid('warmup');

	const idsArg = argv.get('ids');
	const iterations = Math.max(1, parseInt(argv.get('iterations') || '1', 10));
	const wantedIds = idsArg && idsArg !== 'true' ? new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean)) : null;

	const targets = MERMAID_FIXTURES.filter(f => !wantedIds || wantedIds.has(f.id));
	const results = [];
	let bustCounter = 0;
	for (const f of targets) {
		const perIter = [];
		let overallOk = true;
		let firstErr = null;
		for (let it = 0; it < iterations; it++) {
			const id = `spike-${it}-${f.id.replace(/[^a-z0-9]/gi, '_')}`;
			resetRandomSeed();
			const mermaid = await freshMermaid(`${f.id}-${it}-${bustCounter++}`);
			const t0 = realTimer();
			try {
				const out = await mermaid.render(id, f.src);
				const svg = String(out?.svg || '');
				const norm = normalizeMermaidSvg(svg);
				perIter.push({ ok: true, ms: Math.round(realTimer() - t0), svgBytes: svg.length, normBytes: norm.length, normalized: norm });
			} catch (e) {
				overallOk = false;
				if (!firstErr) { firstErr = String(e && (e.message || e)).slice(0, 400); }
				perIter.push({ ok: false, ms: Math.round(realTimer() - t0), error: String(e && (e.message || e)).slice(0, 400) });
			}
		}
		results.push({ id: f.id, tier: f.tier, ok: overallOk, error: firstErr, iterations: perIter });
	}

	const payload = {
		mermaidVersion: mermaidPkg.version,
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
	// jsdom 的 pretendToBeVisual + requestAnimationFrame shim 会留 timer 让 event loop 挂着。
	// worker 是短命 helper，写完 out 就直接退。
	process.exit(0);
}).catch(err => {
	process.stderr.write('[mermaid-render-worker] fatal: ' + (err && err.stack || err) + '\n');
	process.exit(2);
});

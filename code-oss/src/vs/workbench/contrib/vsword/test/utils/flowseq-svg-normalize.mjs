// T-3.5b-flowseq.3c · Flow/Sequence SVG normalize + jsdom+raphael 共享 bootstrap
//
// 三个消费者：
//   1. bootstrap 脚本首次生成 .golden.svg（首跑 test 时兜底）
//   2. flowRoundtrip.test.ts / sequenceRoundtrip.test.ts / mixedRoundtrip.test.ts
//      拿 render 出的 svg 与 golden 比对
//   3. flow-selfcheck.mjs / sequence-selfcheck.mjs 检查 same-runtime × 3 遍字节一致
//
// 设计原则：
//   • normalize 只剥非确定性字段（raphael 内部 id、markerEnd 序号），不改结构/文本
//   • jsdom bootstrap 是 mermaid bootstrap 的裁剪版 —— raphael 只需 SVG matrix / getScreenCTM，
//     不需要 canvas / screen shim；但需要在 loader 侧 defineProperty getScreenCTM
//   • 跨 fixture 交替运行 3 遍字节一致的前提是每次 render 前 `resetSeed()`
//     （spike T-3.5b-flowseq.3c 已验证：raphael 全局 id 由 Math.random 派生，
//     reset seed 后同源码同环境三遍完全一致 —— 见 `.hermes-scratch/flowseq-spike3.mjs`）

/** 递增 raphael id / marker id —— 所有非确定性字段一并抹平。 */
export function normalizeFlowSeqSvg(rawSvg) {
	if (rawSvg == null) { return ''; }
	let s = String(rawSvg);

	// raphael marker id：`raphael-marker-endblock55-obj95g6a`
	//   前缀 `raphael-marker-<type><序号>-<obj hash>`，序号跨 render 递增，hash 由 Math.random 派生
	//   —— reset seed 后同源码同进程结果稳定，但跨 fixture 序号会不同；一并抹平最安全。
	s = s.replace(/raphael-marker-([a-z]+)\d+-[a-z0-9]+/gi, 'raphael-marker-$1-ID');

	// raphael 内部 `obj<hash>` id / class 后缀（少数元素上会出现独立形式）
	s = s.replace(/\bobj[a-z0-9]{5,10}\b/gi, 'obj-ID');

	// XMLSerializer 有时把同名 xmlns 属性输出两次（Raphael 生成，见 spike 样本）
	// 一次性折叠：保留第一个 xmlns="..."，去掉后续重复。
	s = s.replace(/(<svg\b[^>]*?\sxmlns="[^"]+")([^>]*?\sxmlns="[^"]+")/g, '$1');

	// desc 里的 raphael 版本号（同版本内固定，跨 upgrade 会飘）
	s = s.replace(/(Created with Raphaël\s+)\d+\.\d+\.\d+/g, '$1VER');

	// aria-labelledby / aria-describedby 引用的都是随机 id
	s = s.replace(/(aria-(?:labelledby|describedby)=)"[^"]+"/g, '$1"ARIA"');

	// 空白规整：CRLF 归 LF、trim 尾部
	s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trimEnd() + '\n';
	return s;
}

/**
 * 生成 flow/sequence 需要的最小 jsdom 环境（含 raphael 需要的 SVG matrix shim）。
 * 相比 mermaid bootstrap，flow/sequence 不需要 canvas / screen / cytoscape 相关 shim，
 * 但需要 `SVGSVGElement.prototype.createSVGMatrix` / `getScreenCTM` —— 否则 raphael renderfix 抛
 * `TypeError: e.createSVGMatrix is not a function`（spike 已复现 + 修复）。
 *
 * 返回 { dom, cleanup }。cleanup 只清 globalThis 上被这个函数写入的字段。
 */
export async function bootstrapFlowSeqDom() {
	const { JSDOM } = await import('jsdom');
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		pretendToBeVisual: true,
		url: 'http://localhost/',
	});
	const restored = {};
	function assign(name, value) {
		restored[name] = { had: name in globalThis, prev: globalThis[name] };
		try { globalThis[name] = value; } catch { /* readonly on some Node — ignore */ }
	}
	assign('window', dom.window);
	assign('document', dom.window.document);
	assign('HTMLElement', dom.window.HTMLElement);
	assign('SVGElement', dom.window.SVGElement);
	assign('self', dom.window);
	if (!('navigator' in globalThis) || !globalThis.navigator?.userAgent) {
		try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already fine */ }
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

	// —— raphael 需要的 SVG matrix / SVG point / getScreenCTM ——
	function makeMatrix(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
		const m = { a, b, c, d, e, f };
		m.multiply = (o) => makeMatrix(a * o.a + c * o.b, b * o.a + d * o.b, a * o.c + c * o.d, b * o.c + d * o.d, a * o.e + c * o.f + e, b * o.e + d * o.f + f);
		m.inverse = () => {
			const det = a * d - b * c;
			return makeMatrix(d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det);
		};
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
	try {
		Object.defineProperty(dom.window.SVGElement.prototype, 'getScreenCTM', {
			value: function () { return makeMatrix(); }, configurable: true, writable: true,
		});
	} catch { /* ok */ }
	try {
		Object.defineProperty(dom.window.SVGElement.prototype, 'getCTM', {
			value: function () { return makeMatrix(); }, configurable: true, writable: true,
		});
	} catch { /* ok */ }

	return {
		dom,
		cleanup() {
			for (const [name, snap] of Object.entries(restored)) {
				try {
					if (snap.had) { globalThis[name] = snap.prev; }
					else { delete globalThis[name]; }
				} catch { /* ignore */ }
			}
		},
	};
}

/**
 * seeded LCG + 冻结 Date：worker / selfcheck 共用。
 * mermaid worker 里同款 shim 已验证覆盖 mermaid 的 Math.random / Date.now 源；
 * raphael 的随机 id 也走 Math.random，同一 pattern 直接搬。
 */
export function installDeterministicShims(dom) {
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
		get(target, prop, receiver) {
			if (prop === 'now') { return () => FROZEN_NOW; }
			return Reflect.get(target, prop, receiver);
		},
	});
	try { dom.window.Date = globalThis.Date; } catch { /* ok */ }
	return { resetSeed, realTimer };
}

/**
 * 从 builder 装 flowchart.js 单例。返回 { flowchart, version, dir }。
 */
export async function loadFlowchartFromProdBuilder(builderPath) {
	const { existsSync, readFileSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { createRequire } = await import('node:module');
	const { pathToFileURL } = await import('node:url');
	const dir = join(builderPath, 'node_modules', 'flowchart.js');
	if (!existsSync(join(dir, 'package.json'))) {
		throw new Error(`flowchart.js not found under ${builderPath}`);
	}
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const req = createRequire(pathToFileURL(join(builderPath, 'node_modules/')).href);
	const flowchart = req('flowchart.js');
	return { flowchart, version: pkg.version, dir };
}

/**
 * 从 builder 装 raphael + underscore + @rokt33r/js-sequence-diagrams（顺序敏感：
 * sequence 模块顶层读 globalThis.Raphael / globalThis._）。
 * 返回 { Diagram, Raphael, underscore, version, dir }。
 */
export async function loadSequenceFromProdBuilder(builderPath) {
	const { existsSync, readFileSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { createRequire } = await import('node:module');
	const { pathToFileURL } = await import('node:url');
	const dir = join(builderPath, 'node_modules', '@rokt33r', 'js-sequence-diagrams');
	if (!existsSync(join(dir, 'package.json'))) {
		throw new Error(`@rokt33r/js-sequence-diagrams not found under ${builderPath}`);
	}
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const req = createRequire(pathToFileURL(join(builderPath, 'node_modules/')).href);
	const Raphael = req('raphael');
	const underscore = req('underscore');
	globalThis.Raphael = Raphael;
	globalThis._ = underscore;
	// 必须挂到 window 上；sequence 模块内部读 window.Raphael
	try { globalThis.window.Raphael = Raphael; } catch { /* ok */ }
	try { globalThis.window._ = underscore; } catch { /* ok */ }
	const seq = req('@rokt33r/js-sequence-diagrams');
	const Diagram = seq.Diagram || seq.default?.Diagram || seq;
	if (!Diagram || typeof Diagram.parse !== 'function') {
		throw new Error('@rokt33r/js-sequence-diagrams 模块缺少 Diagram.parse');
	}
	return { Diagram, Raphael, underscore, version: pkg.version, dir };
}

/** 找 milkdown prod builder 路径（gate-f 里那一套双点探测）。 */
export function pickProdBuilderPath(candidates) {
	const fs = require('node:fs');
	const path = require('node:path');
	for (const c of candidates) {
		if (fs.existsSync(path.join(c, 'node_modules', 'flowchart.js', 'package.json'))) { return c; }
	}
	throw new Error('milkdown-prod-builder not found under any candidate: ' + candidates.join(', '));
}

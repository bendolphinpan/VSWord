// T-3.5b.5 · Mermaid SVG normalize / jsdom bootstrap 共享工具。
//
// 三个消费者：
//   1. bootstrap 脚本首次生成 .expected.svg
//   2. mermaidRoundtrip.test.ts 拿 render 出的 svg 与 golden 比对
//   3. mermaid-selfcheck.mjs 检查 same-runtime × 3 遍字节一致
//
// 设计原则：
//   • normalize 只剥非确定性字段（自增 id、时间戳等），不改结构/文本，保留 svg 结构可 diff。
//   • jsdom bootstrap 与 spike/T-3.5b.1 render-all.mjs 保持一致（22 类都能跑通的最小 shim）。

/** 递增 id / dom id / 内嵌 diagram id / URL 引用 —— 所有非确定性字段一并抹平。 */
export function normalizeMermaidSvg(rawSvg) {
	if (rawSvg == null) { return ''; }
	let s = String(rawSvg);

	// mermaid 每次 render 会拿到独立的 diagram-id（例：`spike-1-flowchart`、`mermaid-abc123`、`svg-<random>` 等），
	// 这些 id 会作为前缀出现在 <g id="...">、<style>#... 里、<marker id> 里、`url(#...)` 引用里。
	//
	// 我们统一把「render 时喂进去的顶层 id」抹成 `ID`。取 svg 根 <svg id="...">，
	// 如果没有，退到常见前缀正则清除。
	const svgIdMatch = s.match(/<svg[^>]*\bid=(["'])([^"']+)\1/);
	if (svgIdMatch) {
		const raw = svgIdMatch[2];
		// 转义正则元字符
		const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		s = s.replace(new RegExp(escaped, 'g'), 'ID');
	}

	// mermaid 内部还会生成 `mermaid-<random>` / `flowchart-XXX-XXX` 这样的次级 id。
	s = s.replace(/\bmermaid-[a-z0-9]+/gi, 'mermaid-ID');
	s = s.replace(/\b(flowchart|classDiagram|state|sequence|er|c4|xy|block|packet|kanban|arch|radar|treemap|sankey|gantt|journey|pie|quad|req|git|mindmap|timeline)[- ]?[A-Za-z0-9]{3,}/g, (m, p) => `${p}-ID`);

	// 有些子图（如 architecture-beta）会往属性里塞 crypto uuid：a-f0-9 8-4-4-4-12
	s = s.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID');

	// aria-labelledby / aria-describedby 引用的都是随机 id
	s = s.replace(/(aria-(?:labelledby|describedby)=)"[^"]+"/g, '$1"ARIA"');

	// mermaid 内部 counter 抹平（无法被 cache-bust 消除的模块级单例）：
	//   sequenceDiagram：<line id="actor1"> / <line id="actor3"> ...
	//   classDiagram：id="ID-classId-Animal-0" / -1 ...
	//   sankey：id="node-1" / node-11 ...
	//   architecture-beta：<path id="b"> / <path id="b1"> ...
	s = s.replace(/(\bid=")actor\d+(")/g, '$1actorN$2');
	s = s.replace(/(\bid=")root-\d+(")/g, '$1root-N$2');
	s = s.replace(/(\bid="[^"]*?classId-[A-Za-z_][A-Za-z0-9_]*)-\d+(")/g, '$1-N$2');
	s = s.replace(/(\bid=")node-\d+(")/g, '$1node-N$2');
	s = s.replace(/(\bid=")linearGradient-\d+(")/g, '$1linearGradient-N$2');
	// gradient url refs：url(#linearGradient-4) → url(#linearGradient-N)
	s = s.replace(/url\(#(linearGradient|root|actor|node)(-?)\d+\)/g, (_m, name, dash) => `url(#${name}${dash}N)`);
	// architecture-beta：<path id="b" data-name="4"> / <path id="b1" data-name="4"> ...
	// 命中特征是 id 短且紧跟 data-name，避免误伤其他 id。
	s = s.replace(/(\bid=")([a-z]{1,3})\d*("\s+data-name=)/g, '$1$2N$3');

	// 内联 style="min-height: 123px" / style="max-width: 1234px" —— 大小依赖 measure，抹掉
	s = s.replace(/style="([^"]*)"/g, (_, css) => {
		const cleaned = css
			.split(/\s*;\s*/)
			.filter(Boolean)
			.filter(kv => !/^(min-height|max-width|max-height|width|height|font-size|line-height)\s*:/i.test(kv))
			.join('; ');
		return cleaned ? `style="${cleaned}"` : '';
	});

	// 空白规整：把 CRLF 归 LF、去尾部空行
	s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trimEnd() + '\n';

	return s;
}

/**
 * 装配一个能跑 mermaid v11 的最小 jsdom 环境（22 类都覆盖）。
 * 与 docs/spikes/T-3.5b.1-mermaid/render-all.mjs 的 shim 集合保持同步。
 *
 * 返回 { dom, cleanup }。cleanup 只清 globalThis 上被这个函数写入的字段。
 */
export async function bootstrapMermaidDom() {
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
	assign('DOMPurify', null);
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
	// jsdom 无 screen — C4Context 用到 bare `screen`
	assign('screen', { width: 1920, height: 1080 });
	try { dom.window.screen = globalThis.screen; } catch { /* noop */ }
	// canvas 2d shim —— 忽略 kind 参数（与 spike/T-3.5b.1/render-all.mjs 一致），
	// 但补齐 cytoscape / mindmap 需要的 setTransform 等方法。
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
	// jsdom 27（builder 版本）的 clientWidth/offsetWidth 未挂 layout 时抛错、padding 为空。
	// cytoscape GridLayout 会 NPE。复现 jsdom 29 语义：dim=0、padding='0px'。
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
 * 把源码喂给 mermaid，返回 { svg }。id 前缀固定成 `spike-<n>-<slug>`，
 * 让 normalize 有稳定的可抹除锚点。
 */
export async function renderMermaid(mermaidApi, id, source) {
	const out = await mermaidApi.render(id, source);
	if (!out || typeof out.svg !== 'string') {
		throw new Error(`Mermaid render returned no svg for id=${id}`);
	}
	return out.svg;
}

/**
 * 从 vsword 仓库根找 mermaid 包（走 `.tmp/milkdown-prod-builder/node_modules/mermaid` 或
 * `code-oss/src/vs/workbench/contrib/vsword/browser/.tmp/milkdown-prod-builder/node_modules/mermaid`）。
 * 用文件系统探测而不是相对 import，能兼容 gate-f 从任意目录起跑。
 */
export async function loadMermaidFromProdBuilder(repoRoot) {
	const { existsSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { pathToFileURL } = await import('node:url');
	const candidates = [
		join(repoRoot, 'code-oss', 'src', 'vs', 'workbench', 'contrib', 'vsword', 'browser', '.tmp', 'milkdown-prod-builder', 'node_modules', 'mermaid'),
		join(repoRoot, '.tmp', 'milkdown-prod-builder', 'node_modules', 'mermaid'),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, 'package.json'))) {
			const pkg = JSON.parse((await import('node:fs')).readFileSync(join(dir, 'package.json'), 'utf8'));
			const entry = pkg.exports?.['.']?.import?.default
				|| pkg.exports?.['.']?.import
				|| pkg.module
				|| pkg.main;
			// mermaid v11 用 `./dist/mermaid.core.mjs` 作为默认 import 入口
			const rel = typeof entry === 'string' ? entry : './dist/mermaid.core.mjs';
			const abs = join(dir, rel);
			const url = pathToFileURL(abs).href;
			const mod = await import(url);
			return { api: mod.default || mod, version: pkg.version, dir };
		}
	}
	throw new Error('mermaid package not found under any milkdown-prod-builder path');
}

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-seq.2 — js-sequence-diagrams NodeView for code_block[lang=sequence].
//
// 决策锁（mirror mermaid/flowchart · Q1..Q4）：
//   • Inline WYSIWYG：预览常驻，点击 → 图下方展开 textarea
//   • 完全懒加载：首次 render 才 import sequence-diagram + raphael + underscore
//   • 硬跟随 light/dark：host 侧推 isDark，模块级 Set 广播；`simple` 主题下颜色靠外层
//     CSS 覆盖 SVG stroke/fill（PRD "好看放一放"，先保功能）
//   • 错误时：自绘 fallback SVG + 顶部红条 banner
//
// 关键差异（vs mermaid/flowchart）：
//   • rokt33r fork 是 UMD/CJS-shim，dist 里以 `if (typeof Raphael != 'undefined')` 的方式
//     在**模块顶层**读取全局 `Raphael` / `_`。因此 loader 必须在 `import()` sequence-diagram
//     模块之前先把 raphael、underscore 挂到 globalThis 上。
//   • diagram.drawSVG(container, opts) 直接向 DOM 渲染 SVG，不返回字符串。lastGoodSvg
//     用 XMLSerializer 快照实现。清理：`preview.textContent = ''` + 丢弃 diagram 引用
//     即可（raphael 无全局注册表，spike §4 已证）。
//   • fork parser 由 jison 0.4.15 预编译（不是 PEG.js），dist 无 `new Function`/`eval`，
//     CSP `script-src 'self' 'nonce-*'` 下 0 violation（spike T-3.5b-seq.1 报告）。

import {
	getCodeBlockSource,
	sequenceIsEmpty,
	autoSizeTextareaPx,
	normalizeSequenceSource,
	formatErrorHeadline,
	parseErrorLineNumber,
	formatErrorStack,
	offsetOfLine,
	buildSequenceOptions,
} from './sequence-view-helpers.mjs';

// ---- 模块状态 ---------------------------------------------------------------

/** 已挂载的 sequence NodeView 实例集合，用于 themeChanged 广播。 */
const liveViews = new Set();

/** 当前生效的 isDark 值。默认 false（浅色）；host 首次 themeChanged 会覆盖。 */
let currentIsDark = false;

/** sequence-diagram 懒加载单例。第一次调用触发 raphael + underscore + sequence import()，后续复用。 */
let sequencePromise = null;
let sequenceApi = null;
let sequenceLoadError = null;

/** 允许构建脚本 / 测试注入自定义 loader（stub raphael/underscore/sequence-diagram）。 */
let sequenceLoader = null;
export function _installSequenceLoader(loader) {
	sequenceLoader = loader;
	sequencePromise = null;
	sequenceApi = null;
	sequenceLoadError = null;
}

async function loadSequence() {
	if (sequenceApi) return sequenceApi;
	if (sequencePromise) return sequencePromise;
	sequencePromise = (async () => {
		try {
			let api;
			if (sequenceLoader) {
				api = await sequenceLoader();
			} else {
				// UMD 依赖：sequence-diagram-raphael-min.js 模块顶层就会读 `Raphael` / `_`，
				// 因此必须先把它们挂到 globalThis 再 import sequence-diagram。
				const raphaelMod = await import('raphael');
				const underscoreMod = await import('underscore');
				const RaphaelCtor = raphaelMod.default || raphaelMod.Raphael || raphaelMod;
				// underscore@1.4.x CJS 是 `exports._ = _`。esbuild ESM interop 后：
				// namespace.default = module.exports = { _: fn }。既要覆盖 `_` 命名导出，
				// 又要兜底 default 里嵌套的 `_`，最后再 fallback 到 default 本身。
				const underscoreLib =
					(underscoreMod && underscoreMod._) ||
					(underscoreMod && underscoreMod.default && underscoreMod.default._) ||
					(underscoreMod && underscoreMod.default) ||
					underscoreMod;
				// 仅在没被外部先占用时才写入（宿主/其它 NodeView 也可能装了）。
				if (typeof globalThis.Raphael === 'undefined') globalThis.Raphael = RaphaelCtor;
				if (typeof globalThis._ === 'undefined') globalThis._ = underscoreLib;
				const mod = await import('@rokt33r/js-sequence-diagrams/dist/sequence-diagram-raphael-min.js');
				// sequence-diagram-raphael-min.js CJS: exports.Diagram = Diagram; exports.parse = ...
				// 也可能 default = module.exports = { Diagram, parse }。
				api = (mod && mod.Diagram)
					|| (mod && mod.default && mod.default.Diagram)
					|| (mod && mod.default)
					|| mod;
			}
			if (!api || typeof api.parse !== 'function') {
				throw new Error('js-sequence-diagrams module missing Diagram.parse()');
			}
			sequenceApi = api;
			sequenceLoadError = null;
			return api;
		} catch (err) {
			sequenceLoadError = err;
			sequencePromise = null;
			throw err;
		}
	})();
	return sequencePromise;
}

/** 供 UI 重试按钮调用：清缓存、允许下一次 loadSequence 重新触发 import。 */
function resetSequenceLoaderCache() {
	sequencePromise = null;
	sequenceApi = null;
	sequenceLoadError = null;
}

// ---- 主题广播 ---------------------------------------------------------------

/**
 * 由 entry.template.js 在收到 host `themeChanged` 时调用。
 * 若 isDark 变化，触发所有活着的 sequence-view 重新 render。
 */
export function broadcastSequenceTheme(isDark) {
	const next = !!isDark;
	if (next === currentIsDark) return;
	currentIsDark = next;
	for (const rerender of liveViews) {
		try { rerender(); } catch { /* 单实例失败不影响其他 */ }
	}
}

/** 测试用：读当前主题。 */
export function _currentIsDarkForTest() { return currentIsDark; }

// ---- 错误 SVG 兜底 -----------------------------------------------------------

function buildFallbackErrorSvg(doc, message) {
	const svgNs = 'http://www.w3.org/2000/svg';
	const svg = doc.createElementNS(svgNs, 'svg');
	svg.setAttribute('xmlns', svgNs);
	svg.setAttribute('viewBox', '0 0 140 80');
	svg.setAttribute('width', '140');
	svg.setAttribute('height', '80');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', message || 'Sequence render error');
	const rect = doc.createElementNS(svgNs, 'rect');
	rect.setAttribute('x', '1'); rect.setAttribute('y', '1');
	rect.setAttribute('width', '138'); rect.setAttribute('height', '78');
	rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', '#cc0000');
	rect.setAttribute('stroke-dasharray', '4 3'); rect.setAttribute('stroke-width', '1');
	svg.appendChild(rect);
	const cross1 = doc.createElementNS(svgNs, 'line');
	cross1.setAttribute('x1', '54'); cross1.setAttribute('y1', '20');
	cross1.setAttribute('x2', '86'); cross1.setAttribute('y2', '52');
	cross1.setAttribute('stroke', '#cc0000'); cross1.setAttribute('stroke-width', '3');
	cross1.setAttribute('stroke-linecap', 'round');
	svg.appendChild(cross1);
	const cross2 = doc.createElementNS(svgNs, 'line');
	cross2.setAttribute('x1', '86'); cross2.setAttribute('y1', '20');
	cross2.setAttribute('x2', '54'); cross2.setAttribute('y2', '52');
	cross2.setAttribute('stroke', '#cc0000'); cross2.setAttribute('stroke-width', '3');
	cross2.setAttribute('stroke-linecap', 'round');
	svg.appendChild(cross2);
	const text = doc.createElementNS(svgNs, 'text');
	text.setAttribute('x', '70'); text.setAttribute('y', '72');
	text.setAttribute('text-anchor', 'middle');
	text.setAttribute('fill', '#cc0000');
	text.setAttribute('font-family', 'monospace');
	text.setAttribute('font-size', '10');
	text.textContent = 'Sequence Parse Error';
	svg.appendChild(text);
	return svg;
}

// ---- 剪贴板兼容 -------------------------------------------------------------

function copyTextToClipboard(doc, text) {
	try {
		const nav = doc.defaultView && doc.defaultView.navigator;
		if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
			return Promise.resolve(nav.clipboard.writeText(text)).then(() => true).catch(() => execCopyFallback(doc, text));
		}
	} catch { /* fall through */ }
	return Promise.resolve(execCopyFallback(doc, text));
}

function execCopyFallback(doc, text) {
	try {
		const ta = doc.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.left = '-1000px';
		ta.style.opacity = '0';
		doc.body.appendChild(ta);
		ta.select();
		const ok = doc.execCommand && doc.execCommand('copy');
		doc.body.removeChild(ta);
		return !!ok;
	} catch {
		return false;
	}
}

// ---- input debounce（R-6）---------------------------------------------------

/** 200ms textarea debounce · 与 mermaid/flowchart AC-3 同款。 */
const INPUT_DEBOUNCE_MS = 200;

// ---- NodeView 工厂 -----------------------------------------------------------

/**
 * 由 code-block-chrome 的 factory 在 language === 'sequence' 时调用。
 * 返回 ProseMirror NodeView 对象。
 */
export function createSequenceNodeView(node, view, getPos) {
	const doc = view.dom.ownerDocument;

	const dom = doc.createElement('div');
	dom.className = 'vsword-sequence';
	dom.dataset.type = 'sequence_block';
	dom.setAttribute('contenteditable', 'false');

	// 顶部红条 banner
	const errBar = doc.createElement('div');
	errBar.className = 'vsword-sequence-error';
	errBar.hidden = true;

	const errHead = doc.createElement('div');
	errHead.className = 'vsword-sequence-error-head';

	const errHeadline = doc.createElement('span');
	errHeadline.className = 'vsword-sequence-error-headline';
	errHeadline.setAttribute('role', 'button');
	errHeadline.setAttribute('tabindex', '0');
	errHeadline.setAttribute('aria-expanded', 'false');
	errHeadline.title = '点击展开完整错误详情';

	const errTools = doc.createElement('span');
	errTools.className = 'vsword-sequence-error-tools';

	function makeToolBtn(label, aria, cls) {
		const b = doc.createElement('button');
		b.type = 'button';
		b.className = 'vsword-sequence-error-btn' + (cls ? ' ' + cls : '');
		b.textContent = label;
		b.setAttribute('aria-label', aria);
		b.title = aria;
		b.addEventListener('mousedown', (e) => e.preventDefault());
		return b;
	}
	const btnLocate = makeToolBtn('定位', '定位到出错行', 'is-locate');
	btnLocate.hidden = true;
	const btnCopy = makeToolBtn('复制', '复制完整错误信息', 'is-copy');
	const btnRetry = makeToolBtn('重试', '重新加载 sequence 运行时并重试', 'is-retry');
	btnRetry.hidden = true;

	errTools.append(btnLocate, btnCopy, btnRetry);
	errHead.append(errHeadline, errTools);

	const errDetail = doc.createElement('pre');
	errDetail.className = 'vsword-sequence-error-detail';
	errDetail.hidden = true;

	errBar.append(errHead, errDetail);

	// 预览层：包裹 SVG 的 <div>（sequence-diagram 直接向此 div drawSVG）
	const preview = doc.createElement('div');
	preview.className = 'vsword-sequence-preview';

	// 编辑器（textarea 展开）
	const editor = doc.createElement('div');
	editor.className = 'vsword-sequence-editor';
	editor.hidden = true;

	const textarea = doc.createElement('textarea');
	textarea.className = 'vsword-sequence-source';
	textarea.spellcheck = false;
	textarea.setAttribute('aria-label', 'Sequence 源码');

	editor.appendChild(textarea);
	dom.append(errBar, preview, editor);

	// ---- 内部状态 ----
	let editing = false;
	let destroyed = false;
	let current = getCodeBlockSource(node);
	// 保留最近一次成功 render 的 svg HTML 快照
	let lastGoodSvg = '';
	// 递增 render token（并发保护）
	let renderToken = 0;
	// 当前 diagram（用于 clearPreview 时置空 · 无独立 dispose API）
	let currentDiagram = null;
	let currentErrorStack = '';
	let currentErrorLine = null;
	let currentErrorKind = null;
	// input debounce 定时器
	let inputTimer = null;

	function clearInputTimer() {
		if (inputTimer != null) {
			try { clearTimeout(inputTimer); } catch { /* no-op */ }
			inputTimer = null;
		}
	}

	function clearPreview() {
		// sequence-diagram 无 dispose API；raphael 无全局注册表（spike §4 已证），
		// 直接置空 preview 即可释放 SVG DOM 引用。
		currentDiagram = null;
		preview.textContent = '';
	}

	function showSkeleton() {
		clearPreview();
		const skel = doc.createElement('div');
		skel.className = 'vsword-sequence-skeleton';
		skel.textContent = '正在加载 Sequence 引擎…';
		preview.appendChild(skel);
	}

	function showEmpty() {
		clearPreview();
		const hint = doc.createElement('div');
		hint.className = 'vsword-sequence-placeholder';
		hint.textContent = 'Click to add sequence diagram';
		preview.appendChild(hint);
		hideError();
	}

	function hideError() {
		errBar.hidden = true;
		errDetail.hidden = true;
		errHeadline.setAttribute('aria-expanded', 'false');
		btnLocate.hidden = true;
		btnRetry.hidden = true;
		currentErrorStack = '';
		currentErrorLine = null;
		currentErrorKind = null;
		dom.classList.remove('has-error');
	}

	/**
	 * @param {unknown} err
	 * @param {{ kind?: 'parse' | 'runtime', overrideHeadline?: string }} [opts]
	 */
	function showError(err, opts = {}) {
		const kind = opts.kind || 'parse';
		const headline = opts.overrideHeadline || formatErrorHeadline(err);
		errBar.hidden = false;
		errHeadline.textContent = headline;
		currentErrorStack = formatErrorStack(err) || headline;
		currentErrorLine = parseErrorLineNumber(err);
		currentErrorKind = kind;
		btnLocate.hidden = !(currentErrorLine && currentErrorLine > 0);
		btnRetry.hidden = kind !== 'runtime';
		dom.classList.add('has-error');
		clearPreview();
		if (lastGoodSvg && kind === 'parse') {
			// 有 last-good 就复用（辅助对照）；runtime 加载失败态不复用
			preview.innerHTML = lastGoodSvg;
			preview.classList.add('is-stale');
		} else {
			preview.appendChild(buildFallbackErrorSvg(doc, headline));
			preview.classList.remove('is-stale');
		}
	}

	function showSuccess(diagram) {
		currentDiagram = diagram;
		// 生成 SVG HTML 快照：Raphael 生成的是标准 <svg> 元素，先序列化保留
		try {
			const svgEl = preview.querySelector('svg');
			if (svgEl) {
				const serializer = doc.defaultView && doc.defaultView.XMLSerializer;
				if (serializer) {
					lastGoodSvg = new serializer().serializeToString(svgEl);
				} else if (typeof svgEl.outerHTML === 'string') {
					lastGoodSvg = svgEl.outerHTML;
				}
			}
		} catch { /* 快照失败不影响主流程 */ }
		preview.classList.remove('is-stale');
		hideError();
	}

	function toggleErrorDetail(open) {
		const next = typeof open === 'boolean' ? open : errDetail.hidden;
		errDetail.hidden = !next;
		errDetail.textContent = next ? currentErrorStack : '';
		errHeadline.setAttribute('aria-expanded', next ? 'true' : 'false');
	}

	async function render() {
		if (destroyed) return;
		const source = current;
		if (sequenceIsEmpty(source)) {
			showEmpty();
			return;
		}
		const token = ++renderToken;
		if (!sequenceApi) {
			showSkeleton();
		}
		let api;
		try {
			api = await loadSequence();
		} catch (err) {
			if (destroyed || token !== renderToken) return;
			showError(err, {
				kind: 'runtime',
				overrideHeadline: 'Sequence runtime failed to load',
			});
			return;
		}
		if (destroyed || token !== renderToken) return;

		// parse → drawSVG 分开 try：parse 失败走 parse error；drawSVG 失败也 fallback
		let diagram;
		try {
			diagram = api.parse(source);
		} catch (err) {
			if (destroyed || token !== renderToken) return;
			showError(err, { kind: 'parse' });
			return;
		}
		if (destroyed || token !== renderToken) return;
		// 清空旧内容（避免同一 div 上叠图）
		clearPreview();
		try {
			const opts = buildSequenceOptions(currentIsDark);
			// diagram.drawSVG 接受 (container: HTMLElement | string, opts)
			diagram.drawSVG(preview, opts);
			if (destroyed || token !== renderToken) return;
			showSuccess(diagram);
		} catch (err) {
			if (destroyed || token !== renderToken) return;
			showError(err, { kind: 'parse' });
		}
	}

	function scheduleRender() {
		clearInputTimer();
		inputTimer = setTimeout(() => {
			inputTimer = null;
			render();
		}, INPUT_DEBOUNCE_MS);
	}

	// ---- 编辑器打开 / 关闭 ---------------------------------------------------

	function enterEdit() {
		if (editing) return;
		editing = true;
		editor.hidden = false;
		textarea.value = current;
		textarea.style.height = autoSizeTextareaPx(current) + 'px';
		dom.classList.add('is-editing');
		queueMicrotask(() => textarea.focus());
	}

	function commit() {
		if (!editing) return;
		editing = false;
		editor.hidden = true;
		dom.classList.remove('is-editing');
		clearInputTimer();
		const next = normalizeSequenceSource(textarea.value);
		if (next === current) return;
		const pos = typeof getPos === 'function' ? getPos() : null;
		if (pos == null) return;
		const nodeNow = view.state.doc.nodeAt(pos);
		if (!nodeNow || nodeNow.type.name !== 'code_block') return;
		const from = pos + 1;
		const to = pos + nodeNow.nodeSize - 1;
		const tr = next
			? view.state.tr.replaceWith(from, to, view.state.schema.text(next))
			: view.state.tr.delete(from, to);
		view.dispatch(tr);
	}

	function cancel() {
		if (!editing) return;
		editing = false;
		editor.hidden = true;
		dom.classList.remove('is-editing');
		clearInputTimer();
		textarea.value = current;
		render();
	}

	function locateErrorLine() {
		if (currentErrorLine == null || currentErrorLine <= 0) return;
		if (!editing) enterEdit();
		queueMicrotask(() => {
			try {
				textarea.focus();
				const off = offsetOfLine(textarea.value, currentErrorLine);
				textarea.selectionStart = off;
				textarea.selectionEnd = off;
			} catch { /* jsdom selection 差异 */ }
		});
	}

	// ---- 事件绑定 ------------------------------------------------------------

	preview.addEventListener('mousedown', (e) => {
		e.preventDefault();
		e.stopPropagation();
		enterEdit();
	});
	textarea.addEventListener('input', () => {
		current = textarea.value;
		textarea.style.height = autoSizeTextareaPx(current) + 'px';
		// debounce 200ms · R-6
		scheduleRender();
	});
	textarea.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (!errDetail.hidden) {
				toggleErrorDetail(false);
				return;
			}
			cancel();
			view.focus();
			return;
		}
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			commit();
			view.focus();
		}
	});
	textarea.addEventListener('blur', () => { commit(); });

	// 红条 headline：点击 / Enter / Space → 展开/收起详情
	errHeadline.addEventListener('mousedown', (e) => e.preventDefault());
	errHeadline.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleErrorDetail();
	});
	errHeadline.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			toggleErrorDetail();
		} else if (e.key === 'Escape' && !errDetail.hidden) {
			e.preventDefault();
			toggleErrorDetail(false);
		}
	});

	btnLocate.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		locateErrorLine();
	});
	btnCopy.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const text = currentErrorStack || errHeadline.textContent || '';
		if (!text) return;
		copyTextToClipboard(doc, text).then((ok) => {
			const orig = btnCopy.textContent;
			btnCopy.textContent = ok ? '已复制' : '复制失败';
			btnCopy.classList.add(ok ? 'is-copied' : 'is-copy-failed');
			setTimeout(() => {
				if (destroyed) return;
				btnCopy.textContent = orig;
				btnCopy.classList.remove('is-copied', 'is-copy-failed');
			}, 1500);
		});
	});
	btnRetry.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		resetSequenceLoaderCache();
		hideError();
		render();
	});

	// 注册到主题广播列表
	liveViews.add(render);

	// 首次渲染
	render();

	return {
		dom,
		update(nextNode) {
			if (nextNode.type.name !== 'code_block') return false;
			if (nextNode.attrs.language !== 'sequence') return false;
			const nextSrc = getCodeBlockSource(nextNode);
			if (nextSrc !== current) {
				current = nextSrc;
				if (!editing) render();
			}
			return true;
		},
		stopEvent(event) {
			if (editing && editor.contains(event.target)) return true;
			if (errBar.contains(event.target)) return true;
			return false;
		},
		ignoreMutation() { return true; },
		selectNode() { dom.classList.add('is-selected'); },
		deselectNode() { dom.classList.remove('is-selected'); },
		destroy() {
			destroyed = true;
			clearInputTimer();
			liveViews.delete(render);
			clearPreview();
			editor.remove();
		},
		// jsdom 单测探针（不进入 PM 契约）
		_test: {
			get errBar() { return errBar; },
			get errHeadline() { return errHeadline; },
			get errDetail() { return errDetail; },
			get btnLocate() { return btnLocate; },
			get btnCopy() { return btnCopy; },
			get btnRetry() { return btnRetry; },
			get preview() { return preview; },
			get textarea() { return textarea; },
			get isEditing() { return editing; },
			get lastErrorLine() { return currentErrorLine; },
			get lastErrorKind() { return currentErrorKind; },
			get lastGoodSvg() { return lastGoodSvg; },
			toggleErrorDetail,
			async flushRender() { await render(); },
		},
	};
}

// ---- 测试用：探针 -----------------------------------------------------------

export function _liveSequenceViewsCountForTest() { return liveViews.size; }
export function _resetSequenceStateForTest() {
	liveViews.clear();
	currentIsDark = false;
	sequencePromise = null;
	sequenceApi = null;
	sequenceLoader = null;
	sequenceLoadError = null;
}
export function _lastSequenceLoadErrorForTest() { return sequenceLoadError; }

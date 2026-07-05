// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b.2 — Mermaid NodeView for code_block[lang=mermaid].
// T-3.5b.3 — 错误 UI 打磨（headline / 折叠详情 / 复制 / 定位 / 重试 / 空块占位）。
//
// 决策锁：
//   Q1=a inline WYSIWYG（预览常驻，点击图 → 图下方展开 textarea）
//   Q2=b 完全懒加载（首次 render 才 import mermaid，加载中显 skeleton）
//   Q3=a 硬跟随 light/dark（host 侧推 isDark，webview 侧广播给所有实例）
//   Q4=c 错误时优先 mermaid 官方错误 SVG；若无则简易红叉 + 顶部红条 banner
//   P-1 SVG 包裹一层 <div class="vsword-mermaid-preview">
//   P-2 首次加载 > 2s 触发 skeleton（本实现从 0s 开始就是 skeleton，加载完直接切图）
//   P-3 per-render 主题：拼 `%%{init:{'theme':X}}%%` 前缀，不改用户源码
//
// 关键差异（vs math-view）：
//   • code_block 是**非 atom** node，有 text 子节点。commit 用 tr.replaceWith(from, to, schema.text(next))；
//     若 next 为空则 tr.delete(from, to)，保留 code_block 壳（内容空节点）。
//   • NodeView 由 code-block-chrome.template.js 的 factory 头部分派进来（不是独立 $view）。
//   • 主题联动走 webview 全局广播：模块级 Set 记录活着的 NodeView 实例，themeChanged 时集体 re-render。

import {
	getCodeBlockSource,
	buildThemedSource,
	extractMermaidError,
	mermaidIsEmpty,
	autoSizeTextareaPx,
	normalizeMermaidSource,
	formatErrorHeadline,
	parseErrorLineNumber,
	formatErrorStack,
	offsetOfLine,
} from './mermaid-view-helpers.mjs';

// ---- 模块状态 ---------------------------------------------------------------

/** 已挂载的 mermaid NodeView 实例集合，用于 themeChanged 广播。 */
const liveViews = new Set();

/** 当前生效的 isDark 值。默认 false（浅色）；host 首次 themeChanged 会覆盖。 */
let currentIsDark = false;

/** mermaid 懒加载单例（Q2=b）。第一次调用触发 import()，后续复用。 */
let mermaidPromise = null;
let mermaidApi = null;
/** 上一次 loader 失败原因（用于 UI 展示 "runtime failed to load"）。 */
let mermaidLoadError = null;

/**
 * 允许构建脚本 / 测试注入自定义 loader（用于 esbuild 静态分析、或测试用 stub）。
 * 若不注入，走标准 `import('mermaid')`，esbuild 会把 mermaid 打进 chunk。
 */
let mermaidLoader = null;
export function _installMermaidLoader(loader) {
	mermaidLoader = loader;
	mermaidPromise = null;
	mermaidApi = null;
	mermaidLoadError = null;
}

async function loadMermaid() {
	if (mermaidApi) return mermaidApi;
	if (mermaidPromise) return mermaidPromise;
	mermaidPromise = (async () => {
		try {
			const mod = mermaidLoader ? await mermaidLoader() : await import('mermaid');
			const api = mod?.default ?? mod;
			// startOnLoad=false：我们完全接管 render 时机，不让 mermaid 自己扫 DOM。
			try { api.initialize({ startOnLoad: false, securityLevel: 'strict' }); } catch { /* 老版本忽略 */ }
			mermaidApi = api;
			mermaidLoadError = null;
			return api;
		} catch (err) {
			// 记住错误，下次 retry 才能重新入队
			mermaidLoadError = err;
			mermaidPromise = null;
			throw err;
		}
	})();
	return mermaidPromise;
}

/** 供 UI 重试按钮调用：清缓存、允许下一次 loadMermaid 重新触发 import。 */
function resetMermaidLoaderCache() {
	mermaidPromise = null;
	mermaidApi = null;
	mermaidLoadError = null;
}

// 每个 NodeView 生成唯一 render id（mermaid.render 需要 DOM id 前缀）。
let renderSeq = 0;
function nextRenderId() { return 'vsword-mermaid-' + (++renderSeq); }

// ---- 主题广播 ---------------------------------------------------------------

/**
 * 由 entry.template.js 在收到 host `themeChanged` 时调用。
 * 若 isDark 变化，触发所有活着的 mermaid-view 重新 render。
 */
export function broadcastMermaidTheme(isDark) {
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
	svg.setAttribute('aria-label', message || 'Mermaid render error');
	const rect = doc.createElementNS(svgNs, 'rect');
	rect.setAttribute('x', '1'); rect.setAttribute('y', '1');
	rect.setAttribute('width', '138'); rect.setAttribute('height', '78');
	rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', '#cc0000');
	rect.setAttribute('stroke-dasharray', '4 3'); rect.setAttribute('stroke-width', '1');
	svg.appendChild(rect);
	// 红色 X 图标
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
	text.textContent = 'Mermaid Parse Error';
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

// ---- NodeView 工厂 -----------------------------------------------------------

/**
 * 由 code-block-chrome 的 factory 在 language === 'mermaid' 时调用。
 * 返回 ProseMirror NodeView 对象。
 */
export function createMermaidNodeView(node, view, getPos) {
	const doc = view.dom.ownerDocument;

	const dom = doc.createElement('div');
	dom.className = 'vsword-mermaid';
	dom.dataset.type = 'mermaid_block';
	dom.setAttribute('contenteditable', 'false');

	// 顶部红条 banner（错误时显示）：headline + toolbar + 折叠详情
	const errBar = doc.createElement('div');
	errBar.className = 'vsword-mermaid-error';
	errBar.hidden = true;

	const errHead = doc.createElement('div');
	errHead.className = 'vsword-mermaid-error-head';

	const errHeadline = doc.createElement('span');
	errHeadline.className = 'vsword-mermaid-error-headline';
	errHeadline.setAttribute('role', 'button');
	errHeadline.setAttribute('tabindex', '0');
	errHeadline.setAttribute('aria-expanded', 'false');
	errHeadline.title = '点击展开完整错误详情';

	const errTools = doc.createElement('span');
	errTools.className = 'vsword-mermaid-error-tools';

	function makeToolBtn(label, aria, cls) {
		const b = doc.createElement('button');
		b.type = 'button';
		b.className = 'vsword-mermaid-error-btn' + (cls ? ' ' + cls : '');
		b.textContent = label;
		b.setAttribute('aria-label', aria);
		b.title = aria;
		// 避免 PM 抢焦点
		b.addEventListener('mousedown', (e) => e.preventDefault());
		return b;
	}
	const btnLocate = makeToolBtn('定位', '定位到出错行', 'is-locate');
	btnLocate.hidden = true; // 只有解析出行号才亮起
	const btnCopy = makeToolBtn('复制', '复制完整错误信息', 'is-copy');
	const btnRetry = makeToolBtn('重试', '重新加载 mermaid 运行时并重试', 'is-retry');
	btnRetry.hidden = true; // 只有加载失败态才亮起

	errTools.append(btnLocate, btnCopy, btnRetry);
	errHead.append(errHeadline, errTools);

	const errDetail = doc.createElement('pre');
	errDetail.className = 'vsword-mermaid-error-detail';
	errDetail.hidden = true;

	errBar.append(errHead, errDetail);

	// 预览层：包裹 SVG 的 <div>（P-1）
	const preview = doc.createElement('div');
	preview.className = 'vsword-mermaid-preview';

	// 编辑器（textarea 展开）
	const editor = doc.createElement('div');
	editor.className = 'vsword-mermaid-editor';
	editor.hidden = true;

	const textarea = doc.createElement('textarea');
	textarea.className = 'vsword-mermaid-source';
	textarea.spellcheck = false;
	textarea.setAttribute('aria-label', 'Mermaid 源码');

	editor.appendChild(textarea);
	dom.append(errBar, preview, editor);

	// ---- 内部状态 ----
	let editing = false;
	let destroyed = false;
	let current = getCodeBlockSource(node);
	// 保留最近一次成功 render 的 svg，切换错误状态时可选回退到 last-good。
	let lastGoodSvg = '';
	// 递增 render token：多次 keystroke 抢并发时，只让最新那次生效。
	let renderToken = 0;
	// 当前错误详情文本（供复制按钮取用）
	let currentErrorStack = '';
	// 当前错误关联的源码行号（1-based，null=解析不到）
	let currentErrorLine = null;
	// 当前错误分类：'runtime' = 加载失败（要 retry 按钮）；'parse' = mermaid 语法错误
	let currentErrorKind = null;

	function showSkeleton() {
		preview.textContent = '';
		const skel = doc.createElement('div');
		skel.className = 'vsword-mermaid-skeleton';
		skel.textContent = '正在加载 Mermaid 引擎…';
		preview.appendChild(skel);
	}

	function showEmpty() {
		preview.textContent = '';
		const hint = doc.createElement('div');
		hint.className = 'vsword-mermaid-placeholder';
		hint.textContent = 'Click to add mermaid diagram';
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
	 * 展示错误
	 * @param {unknown} err 原始错误对象（供 headline / stack / line 提取）
	 * @param {{ kind?: 'parse' | 'runtime', officialSvgHtml?: string | null, overrideHeadline?: string }} [opts]
	 */
	function showError(err, opts = {}) {
		const kind = opts.kind || 'parse';
		const officialSvgHtml = opts.officialSvgHtml || null;
		const headline = opts.overrideHeadline || formatErrorHeadline(err);
		errBar.hidden = false;
		errHeadline.textContent = headline;
		currentErrorStack = formatErrorStack(err) || headline;
		currentErrorLine = parseErrorLineNumber(err);
		currentErrorKind = kind;
		btnLocate.hidden = !(currentErrorLine && currentErrorLine > 0);
		btnRetry.hidden = kind !== 'runtime';
		dom.classList.add('has-error');
		preview.textContent = '';
		if (officialSvgHtml) {
			// mermaid 抛错时通常已经在 container 里塞了官方错误 SVG，直接接受它的 HTML。
			preview.innerHTML = officialSvgHtml;
			preview.classList.remove('is-stale');
		} else if (lastGoodSvg && kind === 'parse') {
			// 有 last-good 就复用（Q4=c 的辅助对照）；runtime 加载失败态不复用（意义不同）
			preview.innerHTML = lastGoodSvg;
			preview.classList.add('is-stale');
		} else {
			preview.appendChild(buildFallbackErrorSvg(doc, headline));
			preview.classList.remove('is-stale');
		}
	}

	function showSuccess(svgText) {
		lastGoodSvg = svgText;
		preview.classList.remove('is-stale');
		preview.innerHTML = svgText;
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
		if (mermaidIsEmpty(source)) {
			showEmpty();
			return;
		}
		const token = ++renderToken;
		// 若 mermaid 还没就绪，先显 skeleton；就绪即时 render
		if (!mermaidApi) {
			showSkeleton();
		}
		let api;
		try {
			api = await loadMermaid();
		} catch (err) {
			if (destroyed || token !== renderToken) return;
			showError(err, {
				kind: 'runtime',
				overrideHeadline: 'Mermaid runtime failed to load',
			});
			return;
		}
		if (destroyed || token !== renderToken) return;
		const themed = buildThemedSource(source, currentIsDark);
		const id = nextRenderId();
		try {
			// mermaid v11: render 返回 Promise<{ svg, bindFunctions? }>
			const result = await api.render(id, themed);
			if (destroyed || token !== renderToken) return;
			if (result && typeof result.svg === 'string') {
				showSuccess(result.svg);
				try { result.bindFunctions?.(preview); } catch { /* mindmap 交互绑定失败不阻塞展示 */ }
			} else {
				showError(new Error('Mermaid 返回空 SVG'), { kind: 'parse' });
			}
		} catch (err) {
			if (destroyed || token !== renderToken) return;
			// mermaid v11 在 render 失败后，会把官方错误 SVG 写进临时 iframe/body；
			// 无法可靠拿到 HTML 时退回自绘 fallback。
			showError(err, { kind: 'parse' });
		}
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
		const next = normalizeMermaidSource(textarea.value);
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
		// update() 会随后被 PM 触发，读回新 node 再 render。
	}

	function cancel() {
		if (!editing) return;
		editing = false;
		editor.hidden = true;
		dom.classList.remove('is-editing');
		textarea.value = current;
		render();
	}

	/** 定位光标到出错行：需要已进入编辑态。 */
	function locateErrorLine() {
		if (currentErrorLine == null || currentErrorLine <= 0) return;
		if (!editing) enterEdit();
		queueMicrotask(() => {
			try {
				textarea.focus();
				const off = offsetOfLine(textarea.value, currentErrorLine);
				textarea.selectionStart = off;
				textarea.selectionEnd = off;
			} catch { /* jsdom 下部分 selection API 可能 no-op */ }
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
		// 边打边预览
		render();
	});
	textarea.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			// 如果错误详情面板展开，第一下 Escape 只收面板；再一次才退出编辑。
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

	// 工具按钮
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
		resetMermaidLoaderCache();
		hideError();
		render();
	});

	// 注册到主题广播列表
	liveViews.add(render);

	// 首次渲染
	render();

	return {
		dom,
		// 非 atom code_block 也不暴露 contentDOM —— 我们要接管所有输入。
		update(nextNode) {
			if (nextNode.type.name !== 'code_block') return false;
			if (nextNode.attrs.language !== 'mermaid') return false;
			const nextSrc = getCodeBlockSource(nextNode);
			if (nextSrc !== current) {
				current = nextSrc;
				if (!editing) render();
			}
			return true;
		},
		stopEvent(event) {
			// 编辑器内部键盘/焦点走自己的逻辑，不让 PM 抢
			if (editing && editor.contains(event.target)) return true;
			// 错误 banner 上的交互也归 NodeView（复制/重试/定位/展开）
			if (errBar.contains(event.target)) return true;
			return false;
		},
		ignoreMutation() { return true; },
		selectNode() { dom.classList.add('is-selected'); },
		deselectNode() { dom.classList.remove('is-selected'); },
		destroy() {
			destroyed = true;
			liveViews.delete(render);
			preview.textContent = '';
			editor.remove();
		},
		// T-3.5b.3 测试探针（不进入 PM 契约，供 jsdom 单测断言）
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
			toggleErrorDetail,
		},
	};
}

// ---- 测试用：探针 -----------------------------------------------------------

export function _liveMermaidViewsCountForTest() { return liveViews.size; }
export function _resetMermaidStateForTest() {
	liveViews.clear();
	currentIsDark = false;
	mermaidPromise = null;
	mermaidApi = null;
	mermaidLoader = null;
	mermaidLoadError = null;
}
export function _lastMermaidLoadErrorForTest() { return mermaidLoadError; }

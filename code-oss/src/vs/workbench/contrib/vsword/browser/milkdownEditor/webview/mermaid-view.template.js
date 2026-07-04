// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b.2 — Mermaid NodeView for code_block[lang=mermaid].
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
} from './mermaid-view-helpers.mjs';

// ---- 模块状态 ---------------------------------------------------------------

/** 已挂载的 mermaid NodeView 实例集合，用于 themeChanged 广播。 */
const liveViews = new Set();

/** 当前生效的 isDark 值。默认 false（浅色）；host 首次 themeChanged 会覆盖。 */
let currentIsDark = false;

/** mermaid 懒加载单例（Q2=b）。第一次调用触发 import()，后续复用。 */
let mermaidPromise = null;
let mermaidApi = null;

/**
 * 允许构建脚本 / 测试注入自定义 loader（用于 esbuild 静态分析、或测试用 stub）。
 * 若不注入，走标准 `import('mermaid')`，esbuild 会把 mermaid 打进 chunk。
 */
let mermaidLoader = null;
export function _installMermaidLoader(loader) {
	mermaidLoader = loader;
	mermaidPromise = null;
	mermaidApi = null;
}

async function loadMermaid() {
	if (mermaidApi) return mermaidApi;
	if (mermaidPromise) return mermaidPromise;
	mermaidPromise = (async () => {
		const mod = mermaidLoader ? await mermaidLoader() : await import('mermaid');
		const api = mod?.default ?? mod;
		// startOnLoad=false：我们完全接管 render 时机，不让 mermaid 自己扫 DOM。
		try { api.initialize({ startOnLoad: false, securityLevel: 'strict' }); } catch { /* 老版本忽略 */ }
		mermaidApi = api;
		return api;
	})();
	return mermaidPromise;
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
	svg.setAttribute('viewBox', '0 0 240 80');
	svg.setAttribute('width', '240');
	svg.setAttribute('height', '80');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', message || 'Mermaid render error');
	const rect = doc.createElementNS(svgNs, 'rect');
	rect.setAttribute('width', '240'); rect.setAttribute('height', '80');
	rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', '#cc0000');
	rect.setAttribute('stroke-dasharray', '4 3'); rect.setAttribute('stroke-width', '1');
	svg.appendChild(rect);
	const text = doc.createElementNS(svgNs, 'text');
	text.setAttribute('x', '120'); text.setAttribute('y', '44');
	text.setAttribute('text-anchor', 'middle');
	text.setAttribute('fill', '#cc0000');
	text.setAttribute('font-family', 'monospace');
	text.setAttribute('font-size', '12');
	text.textContent = 'Mermaid ✗';
	svg.appendChild(text);
	return svg;
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

	// 顶部红条 banner（错误时显示）
	const errBar = doc.createElement('div');
	errBar.className = 'vsword-mermaid-error';
	errBar.hidden = true;

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
		hint.textContent = '空图 — 点击编辑';
		preview.appendChild(hint);
		errBar.hidden = true;
		dom.classList.remove('has-error');
	}

	function showError(message, officialSvgHtml) {
		errBar.hidden = false;
		errBar.textContent = message || 'Mermaid 渲染失败';
		dom.classList.add('has-error');
		preview.textContent = '';
		if (officialSvgHtml) {
			// mermaid 抛错时通常已经在 container 里塞了官方错误 SVG，直接接受它的 HTML。
			preview.innerHTML = officialSvgHtml;
		} else if (lastGoodSvg) {
			// 有 last-good 就复用（Q4=c 的辅助对照）
			preview.innerHTML = lastGoodSvg;
			preview.classList.add('is-stale');
		} else {
			preview.appendChild(buildFallbackErrorSvg(doc, message));
		}
	}

	function showSuccess(svgText) {
		lastGoodSvg = svgText;
		preview.classList.remove('is-stale');
		preview.innerHTML = svgText;
		errBar.hidden = true;
		errBar.textContent = '';
		dom.classList.remove('has-error');
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
			showError('Mermaid 引擎加载失败: ' + String(err && err.message || err));
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
				showError('Mermaid 返回空 SVG');
			}
		} catch (err) {
			if (destroyed || token !== renderToken) return;
			const message = extractMermaidError(err) || 'Mermaid 渲染失败';
			// mermaid v11 在 render 失败后，会把官方错误 SVG 写进临时 iframe/body；
			// 无法可靠拿到 HTML 时退回自绘 fallback。
			showError(message, null);
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
			return editing && editor.contains(event.target);
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
}

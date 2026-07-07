// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.1.b · TOC NodeView + 事务级集中重算 Plugin。
 *
 *  数据流：
 *    · createTocView(node, view, getPos)
 *        PM 每次实例化 toc_marker 时调用 → 构造 <nav.vsword-toc> DOM ·
 *        _rerender(extractHeadings(view.state.doc)) 一次 ·
 *        把自身加入模块级 liveTocViews Set
 *    · vswordTocRecomputePlugin（$prose 包装的单例 prosemirror Plugin）
 *        appendTransaction 里检测 doc 变化 + hash 去噪 →
 *        一次遍历 liveTocViews 广播 _rerender(newHeadings) →
 *        永远 return null（只做副作用，不产生新 tr）
 *    · handle.destroy(): 从 liveTocViews 摘除，Plugin 下一 tick 自然不再喂它
 *
 *  为什么单 Plugin 集中广播（PRD §8 风险 1）：
 *    每个 NodeView 各自订阅 EditorView.update 会退化成 O(N × doc.size)，多 TOC
 *    存在时性能塌方。集中广播只跑一次 extractHeadings，向 N 个 view 派发。
 *
 *  为什么 shallow-hash 去噪（PRD §4.6 · 决策 D-6）：
 *    heading list 变换等价性 = level | text.trim() 逐行相等；忽略 heading
 *    首尾空白差异（避免误敲空格触发全 TOC 重排），但保留内部差异。
 *
 *  D-12 UI 组件契约对齐（webview/ui-component.template.js）：
 *    NodeView 生命周期即 IMilkdownUIComponent 生命周期：
 *      mount(container)   ≡ 构造 NodeView + 加入 liveTocViews
 *      unmount()          ≡ NodeView destroy + 从 liveTocViews 移除
 *      refresh(state)     ≡ _rerender(headings)
 *    不新建独立 factory / registry（决策 D-12 明确排除过度设计）；
 *    单元测试直接 spy _rerender 覆盖 dispatch。
 *
 *  参考：
 *    · math-view.template.js（atom + stopEvent + ignoreMutation）
 *    · wikilink.template.js（$nodeSchema/$view 挂载模式）
 *    · roundtrip-tracker.template.js（Plugin appendTransaction 集中处理）
 *--------------------------------------------------------------------------------------------*/

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $view, $prose } from '@milkdown/utils';
import { tocNode } from './toc-node.mjs';
import { extractHeadings, slugify } from './outline-extractor.mjs';

// ---------------------------------------------------------------------------
// 模块级共享状态（单点广播源 · 多 TOC 共存）
// ---------------------------------------------------------------------------

/**
 * 当前挂载中的所有 TOC NodeView handle。widget 在构造 / destroy 里自行
 * 注册 / 摘除；集中重算 Plugin 只读这一个 Set。
 * @type {Set<{ _rerender: (headings: Array<any>) => void }>}
 */
export const liveTocViews = new Set();

/** 最近一次广播的 headings shallow-hash；用于事务级去噪。 */
let lastBroadcastHash = '';

/**
 * 测试专用：重置模块单例状态（每个 test suite 一份干净的 state）。
 * 生产路径不会调用；导出仅供 tocViewModeInterop.test.ts 使用。
 */
export function _resetTocModuleState() {
	liveTocViews.clear();
	lastBroadcastHash = '';
}

// ---------------------------------------------------------------------------
// shallow-hash（PRD §4.6 · 决策 D-6）
// ---------------------------------------------------------------------------

/**
 * 生成 heading 序列的 shallow-hash：`${level}|${text.trim()}` 逐行 '\n' join。
 * 语义：
 *   · 忽略每条 heading 首尾空白（trim 后同源即同 hash）
 *   · 保留内部空白差异（`'A  B' ≠ 'A B'`）
 *   · 顺序 / 层级敏感（`[H1 a, H2 b] ≠ [H2 b, H1 a]`）
 *
 * @param {Array<{level?: number, text?: string}>} headings
 * @returns {string}
 */
export function headingsShallowHash(headings) {
	if (!Array.isArray(headings)) { return ''; }
	return headings.map(h => {
		const level = Number(h?.level) || 1;
		const text = typeof h?.text === 'string' ? h.text.trim() : '';
		return `${level}|${text}`;
	}).join('\n');
}

// ---------------------------------------------------------------------------
// 点击跳转：slug → heading pos（PRD §4.7 · T-3.7c.1.c）
// ---------------------------------------------------------------------------

/**
 * 遍历 PM doc，找到第一个 `slugify(heading.textContent) === slug` 的 heading，
 * 返回该 heading 节点的 pos（PM 文档偏移）。
 * 未命中或 doc 不含 heading → 返回 null。
 *
 * 独立纯函数，方便单测：
 *   · 不依赖 EditorView（只吃 doc）
 *   · 无副作用（不改 selection、不 dispatch）
 *   · 与 outline-extractor.slugify 语义一致（决策 D-9：不额外定义 slug 规则）
 *
 * @param {import('@milkdown/prose/model').Node} doc - PM 根节点
 * @param {string} slug - `<a data-heading-id="slug">` 的目标 slug
 * @returns {number | null}
 */
export function resolveHeadingPos(doc, slug) {
	if (!doc || typeof doc.descendants !== 'function') { return null; }
	if (typeof slug !== 'string' || slug.length === 0) { return null; }
	// 同 outline-extractor：重名 heading 会在同一 base 上追加 `-1 / -2` 后缀。
	// 我们这里从 doc 顺序扫描，用同样的计数算法产生每个 heading 的最终 slug，
	// 命中 slug 时返回其 pos。
	const seen = new Map();
	let hit = null;
	doc.descendants((node, pos) => {
		if (hit !== null) { return false; }
		if (node?.type?.name !== 'heading') { return true; }
		const text = (node.textContent || '').trim();
		const level = Number(node.attrs?.level) || 1;
		const baseSlug = slugify(text) || `h${level}`;
		const count = seen.get(baseSlug) ?? 0;
		seen.set(baseSlug, count + 1);
		const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
		if (id === slug) { hit = pos; return false; }
		return false; // heading 内部不含子 heading
	});
	return hit;
}

// ---------------------------------------------------------------------------
// NodeView 工厂
// ---------------------------------------------------------------------------

/**
 * PM NodeView factory —— atom + interactive-children 变体：
 *   · dom：<nav class="vsword-toc"> 单根，contenteditable=false
 *   · 不设 contentDOM（atom 节点，无可编辑内容）
 *   · update：接受节点等价性变化但**不**驱动 DOM 重绘（DOM 重绘走 _rerender）
 *   · stopEvent + ignoreMutation：与 math-view / mermaid-view 一致；
 *     PM 不参与内部 UI 事件调度 / 突变
 *   · destroy：从 liveTocViews 摘除
 *
 * 生成的 DOM 结构：
 *   <nav class="vsword-toc" contenteditable="false" data-toc="placeholder">
 *     <ul class="vsword-toc-list">
 *       <li class="vsword-toc-item vsword-toc-level-N">
 *         <a href="#slug" data-heading-id="slug">text</a>
 *       </li>...
 *     </ul>
 *   </nav>
 * 空 heading 序列 → 单个 <p class="vsword-toc-empty">（决策 D-2）
 *
 * 层级由 class 表达（vsword-toc-level-N），本卡不做嵌套 <ul> —— 视觉延后
 * 到 UI 布局阶段再决定用 CSS 缩进还是重构成真嵌套（PRD §6 · 备注：结构
 * 类保持 flat 便于 c 卡添加点击跳转时 event.target.closest('a') 找 li）。
 *
 * @param {import('@milkdown/prose/model').Node} node - PM toc_marker 节点
 * @param {import('@milkdown/prose/view').EditorView} view - 主 EditorView
 * @param {() => number} _getPos - 位置访问器（本 NodeView 无需 pos）
 */
export function createTocView(node, view, _getPos) {
	const doc = view.dom.ownerDocument;
	const dom = doc.createElement('nav');
	dom.className = 'vsword-toc';
	dom.setAttribute('contenteditable', 'false');
	dom.setAttribute('data-toc', 'placeholder');

	/**
	 * 用当前 headings 序列重建 nav 内部 DOM。空序列 → <p.vsword-toc-empty>。
	 * @param {Array<{id?: string, level?: number, text?: string}>} headings
	 */
	function _rerender(headings) {
		// 清空既有子节点。textContent='' 比 while+remove 更快、也更清晰。
		dom.textContent = '';
		if (!Array.isArray(headings) || headings.length === 0) {
			const empty = doc.createElement('p');
			empty.className = 'vsword-toc-empty';
			empty.textContent = '（暂无标题）';
			dom.appendChild(empty);
			return;
		}
		const ul = doc.createElement('ul');
		ul.className = 'vsword-toc-list';
		for (const h of headings) {
			const level = Number(h?.level) || 1;
			const li = doc.createElement('li');
			li.className = `vsword-toc-item vsword-toc-level-${level}`;
			const a = doc.createElement('a');
			const id = typeof h?.id === 'string' ? h.id : '';
			a.setAttribute('href', `#${id}`);
			a.setAttribute('data-heading-id', id);
			a.textContent = typeof h?.text === 'string' ? h.text : '';
			li.appendChild(a);
			ul.appendChild(li);
		}
		dom.appendChild(ul);
	}

	// T-3.7c.1.c · 点击跳转（PRD §4.7 + AC-2）：
	//   · nav 上一次性委托 click（不给每个 <a> 单绑）；
	//   · target.closest('a[data-heading-id]') 拿 slug；
	//   · 走 resolveHeadingPos + view.dispatch(setSelection(pos+1).scrollIntoView())；
	//   · pos+1 = heading 内容开头（heading 本身是块，+1 落入 inline）；
	//   · 找不到 pos → fallback getElementById(slug).scrollIntoView()（预览态兜底）。
	//   · preventDefault + stopPropagation：屏蔽浏览器默认 `#hash` 导航破坏 SPA 路由。
	dom.addEventListener('click', (ev) => {
		const anchor = ev.target && typeof ev.target.closest === 'function'
			? ev.target.closest('a[data-heading-id]')
			: null;
		if (!anchor) { return; }
		ev.preventDefault();
		ev.stopPropagation();
		const slug = anchor.getAttribute('data-heading-id') || '';
		if (!slug) { return; }
		let hit = null;
		try { hit = resolveHeadingPos(view.state?.doc, slug); } catch { hit = null; }
		if (typeof hit === 'number' && hit >= 0) {
			try {
				const state = view.state;
				const $target = state.doc.resolve(Math.min(hit + 1, state.doc.content.size));
				// 复用当前 selection 的构造器：TextSelection.near 等价于 near-safe 选点，
				// 与 entry.template.js 的 revealHeading 分支一致，避免直接 import TextSelection
				// 造成 @milkdown/prose 双实例。
				const nextSel = state.selection.constructor.near($target);
				const tr = state.tr.setSelection(nextSel).scrollIntoView();
				view.dispatch(tr);
				if (typeof view.focus === 'function') { view.focus(); }
				return;
			} catch { /* 落到 fallback */ }
		}
		// fallback：预览态 / 只读态 / 找不到 heading pos
		try {
			const el = doc.getElementById && doc.getElementById(slug);
			if (el && typeof el.scrollIntoView === 'function') {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		} catch { /* noop */ }
	});

	const handle = {
		dom,
		_rerender,
		update(nextNode) {
			// atom 无 attrs 变化路径；同名 type 直接接受更新，DOM 由集中重算触发。
			return nextNode?.type?.name === node.type.name;
		},
		stopEvent() { return true; },
		ignoreMutation() { return true; },
		destroy() {
			liveTocViews.delete(handle);
		},
	};

	liveTocViews.add(handle);
	// 首次挂载立即渲染，避免闪一下空态；extractHeadings 兼容 doc.descendants，
	// 拿不到就退化为空 headings（_rerender 内部按空态兜底）。
	try {
		_rerender(extractHeadings(view.state.doc));
	} catch {
		_rerender([]);
	}
	return handle;
}

// ---------------------------------------------------------------------------
// 事务级集中重算 Plugin
// ---------------------------------------------------------------------------

const TOC_RECOMPUTE_KEY = new PluginKey('vsword-toc-recompute');

/**
 * 构造 vswordTocRecomputePlugin。参数化 extract 便于单测注入 spy。
 *
 * appendTransaction 契约（PRD §4.5）：
 *   1) newState.doc === oldState.doc → return null（无 doc 变更 · selection-only tr 不重算）
 *   2) liveTocViews.size === 0        → return null（无 TOC 无需广播）
 *   3) nextHash === lastBroadcastHash → return null（事务级去噪 · PRD §8 风险 2）
 *   4) 其余：遍历 liveTocViews 调 _rerender(newHeadings)，更新 lastBroadcastHash
 *   5) 永远 return null（副作用广播 · 不产生新 tr）
 *
 * Plugin 自身无 state —— 所有跨事务状态都放模块级 liveTocViews / lastBroadcastHash，
 * 便于单测直接 spy _rerender + 直接调 plugin.spec.appendTransaction。
 *
 * @param {(doc: any) => Array<{level?: number, text?: string, id?: string}>} extract
 *   heading 抽取器。生产用 extractHeadings；单测可注入 spy。
 * @returns {Plugin}
 */
export function createTocRecomputePlugin(extract = extractHeadings) {
	return new Plugin({
		key: TOC_RECOMPUTE_KEY,
		appendTransaction(_transactions, oldState, newState) {
			if (!newState) { return null; }
			if (oldState && newState.doc === oldState.doc) { return null; }
			if (liveTocViews.size === 0) { return null; }
			let headings;
			try { headings = extract(newState.doc); } catch { headings = []; }
			const nextHash = headingsShallowHash(headings);
			if (nextHash === lastBroadcastHash) { return null; }
			lastBroadcastHash = nextHash;
			for (const v of liveTocViews) {
				try { v._rerender(headings); } catch { /* 单 view 抛错不影响后续广播 */ }
			}
			return null;
		},
	});
}

// ---------------------------------------------------------------------------
// Milkdown 绑定
// ---------------------------------------------------------------------------

/**
 * $view 绑 toc_marker → createTocView。
 * factory 签名遵循 milkdown 6.x：`(ctx) => (node, view, getPos) => NodeView`。
 * 这里 ctx 未用，直接返回 createTocView 本尊。
 */
export const tocView = $view(tocNode.node, () => createTocView);

/**
 * 集中重算 Plugin 的 milkdown 挂载包装（$prose 参照 focus-mode /
 * wikilink-autocomplete / input-rules 的挂法）。
 */
export const vswordTocRecomputePlugin = $prose(() => createTocRecomputePlugin());

/** 便捷 bundle：entry.template.js 里 `.use(tocViewPlugins)` 一句挂完。 */
export const tocViewPlugins = [tocView, vswordTocRecomputePlugin];

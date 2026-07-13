// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.3.b · FindWidget UI 组件（IMilkdownUIComponent 契约）。
 *
 *  职责：
 *    · 持有 find/replace 的**真源 state**（find-plugin 里的 getFindState 通过闭包读它）
 *    · 拼装 widget DOM（input / 三 checkbox / 计数 / 上下按钮 / 关闭 / 替换行）
 *    · 处理用户输入 → computeMatches → setState({query, options, matches, activeIndex}) →
 *      对 EditorView 派发 `{recompute:true}` meta，触发 find-plugin 重算 DecorationSet
 *    · open() / openReplace() / close() 控制显隐 + `.vsword-hidden` class
 *    · setQuery(q) 允许外部（keymap）注入选中文本快速开找
 *    · getState() 暴露 {index,total} 供单测断言
 *    · dispose() 派发 vsword-ui-component-disposed sentinel event（AC-8 契约）
 *
 *  非目标（留给 c 卡）：
 *    · 真实 applyReplaceOne / applyReplaceAll 事务 —— helpers 已就绪，本卡先只把
 *      「替换」按钮绑到 no-op（reading gate 提前生效 · 拉出置灰）
 *    · reading mode 的 openReplace 拒绝 · 主题深浅色 CSS
 *
 *  与 find-plugin.template.js 的连接：
 *    · 本文件持有 `state`（模块内 closure）
 *    · entry.template.js 把 `getFindState = widget.getFindState` 传进 createFindPlugin
 *    · 每次 setState 内部会 `view.dispatch(view.state.tr.setMeta(findPluginKey, {recompute:true}))`
 *      → plugin 的 apply 重跑 computeMatches → DecorationSet 更新
 *
 *  DOM 契约：
 *    <div id="vsword-find-widget" class="vsword-find-widget vsword-hidden">
 *      <div class="vsword-find-row">
 *        <input class="vsword-find-input" />
 *        <button class="vsword-find-opt vsword-find-case">Aa</button>
 *        <button class="vsword-find-opt vsword-find-word">Ab</button>
 *        <button class="vsword-find-opt vsword-find-regex">.*</button>
 *        <span class="vsword-find-count">0 of 0</span>
 *        <button class="vsword-find-prev">↑</button>
 *        <button class="vsword-find-next">↓</button>
 *        <button class="vsword-find-close">✕</button>
 *      </div>
 *      <div class="vsword-replace-row vsword-hidden">
 *        <input class="vsword-replace-input" />
 *        <button class="vsword-replace-one">替换</button>
 *        <button class="vsword-replace-all">全部替换</button>
 *      </div>
 *    </div>
 *
 *  DOM markup 由本组件在 mount(container) 时 createElement 拼装 —— 与 mode-switch
 *  不同（那里 host HTML 硬编码骨架），因为 find widget 只在挂载后按需渲染，避免首
 *  帧闪现空条。
 *
 *  依据：docs/requirements/T-3.7c.3-find-replace-prd.md §4.2 / §4.7
 *--------------------------------------------------------------------------------------------*/

import { VSWORD_UI_COMPONENT_DISPOSED_EVENT } from './ui-component.mjs';
import { computeMatches, applyReplaceOne, applyReplaceAll } from './find-widget-helpers.mjs';
import { findPluginKey } from './find-plugin.mjs';

/**
 * @typedef {import('./find-widget-helpers.mjs').FindState} FindState
 * @typedef {import('./find-widget-helpers.mjs').FindOptions} FindOptions
 * @typedef {import('./find-widget-helpers.mjs').FindMatch} FindMatch
 */

/**
 * @typedef {Object} IFindWidgetComponent
 * @property {HTMLElement | null} el
 * @property {(container: HTMLElement) => void} mount
 * @property {() => void} unmount
 * @property {() => void} dispose
 * @property {() => void} open
 * @property {() => void} openReplace
 * @property {() => void} close
 * @property {() => boolean} isOpen
 * @property {(q: string) => void} setQuery
 * @property {() => { index: number, total: number }} getState
 * @property {() => FindState} getFindState        —— 提供给 find-plugin 的只读读取器
 */

/**
 * 默认 find state（widgetOpen=false → plugin.apply 恒返回 DecorationSet.empty）。
 * @returns {FindState}
 */
function makeInitialState() {
	return {
		widgetOpen: false,
		query: '',
		options: { caseSensitive: false, wholeWord: false, useRegex: false },
		matches: [],
		activeIndex: -1,
		invalidRegex: false,
		mode: 'wysiwyg',
	};
}

/**
 * 试编译一次 regex，只为了侦测 `useRegex + 非法 pattern` 情形。
 * useRegex=false 时永远返回 false（escapeRegExp 后不可能编译失败）。
 *
 * @param {string} query
 * @param {FindOptions} opts
 * @returns {boolean}
 */
function isInvalidRegex(query, opts) {
	if (!opts || !opts.useRegex) { return false; }
	if (typeof query !== 'string' || query.length === 0) { return false; }
	try { new RegExp(query, opts.caseSensitive ? 'g' : 'gi'); return false; }
	catch { return true; }
}

/**
 * 创建 FindWidget 组件。
 *
 * @param {Object} [deps]
 * @param {{ state: any, dispatch: (tr: any) => void, focus?: () => void } | null} [deps.getEditorView]
 *   —— 返回当前 EditorView。首次 mount 时 view 可能还没 attach，函数式取值以便后绑。
 * @param {() => string} [deps.getMode]
 *   —— 视图模式读取器（'reading' / 'wysiwyg' / 'source'）。用于 openReplace 拒绝 + no-op 替换。
 * @param {(partial: Partial<{open:boolean,query:string,replaceQuery:string,caseSensitive:boolean,wholeWord:boolean,regex:boolean,matchCount:number,activeIndex:number}>) => void} [deps.onStateChanged]
 *   —— T-3.7c.3.c2 · 状态变化广播（host 镜像消费）。widget 每次 open/close/输入/选项切换/
 *      上下匹配/替换/setQuery 内部 state 变更后调一次；未提供则完全 no-op。
 * @returns {IFindWidgetComponent}
 */
export function createFindWidget(deps) {
	const getView = (deps && typeof deps.getEditorView === 'function') ? deps.getEditorView : () => null;
	const getMode = (deps && typeof deps.getMode === 'function') ? deps.getMode : () => 'wysiwyg';
	const onStateChanged = (deps && typeof deps.onStateChanged === 'function') ? deps.onStateChanged : null;

	/** @type {FindState} */
	let state = makeInitialState();

	/** @type {HTMLElement | null} */
	let el = null;
	/** @type {HTMLElement | null} */
	let mountedContainer = null;
	/** @type {HTMLInputElement | null} */
	let findInputEl = null;
	/** @type {HTMLInputElement | null} */
	let replaceInputEl = null;
	/** @type {HTMLElement | null} */
	let replaceRowEl = null;
	/** @type {HTMLElement | null} */
	let countEl = null;
	/** @type {Array<{target: EventTarget, type: string, handler: any}>} */
	let listeners = [];

	/**
	 * T-3.7c.3.c2 · 把内部 state 折成 host FindState 形状后广播。
	 * 每次 state 有变更的操作末尾调用一次，作为唯一出口。
	 */
	function broadcast() {
		if (!onStateChanged) { return; }
		try {
			onStateChanged({
				open: !!state.widgetOpen,
				query: state.query || '',
				replaceQuery: replaceInputEl ? (replaceInputEl.value || '') : '',
				caseSensitive: !!state.options.caseSensitive,
				wholeWord: !!state.options.wholeWord,
				regex: !!state.options.useRegex,
				matchCount: state.matches.length,
				activeIndex: state.activeIndex,
			});
		} catch { /* onStateChanged 由 host 桥接，不应抛；防御一层 */ }
	}

	function bind(target, type, handler) {
		target.addEventListener(type, handler);
		listeners.push({ target, type, handler });
	}
	function unbindAll() {
		for (const { target, type, handler } of listeners) {
			try { target.removeEventListener(type, handler); } catch { /* noop */ }
		}
		listeners = [];
	}

	/**
	 * 向 EditorView 派发一次 recompute meta，触发 find-plugin 重画 DecorationSet。
	 * view 未就绪则静默跳过（首次 open 前 view 可能还没 create）。
	 */
	function kickPlugin() {
		const view = getView();
		if (!view || !view.state || typeof view.dispatch !== 'function') { return; }
		try {
			const tr = view.state.tr.setMeta(findPluginKey, { recompute: true });
			view.dispatch(tr);
		} catch { /* noop —— 单测里 view.dispatch 是 spy，可能抛 */ }
	}

	/**
	 * 重算 matches + activeIndex clamp，然后刷 UI 并 kickPlugin。
	 * 单入口是为了保证「state 变了 → 视图与 plugin 一定同步」。
	 */
	function recompute() {
		const view = getView();
		const doc = view && view.state ? view.state.doc : null;
		state.invalidRegex = isInvalidRegex(state.query, state.options);
		if (!state.widgetOpen || !state.query || state.invalidRegex || !doc) {
			state.matches = [];
			state.activeIndex = -1;
		} else {
			let matches = [];
			try { matches = computeMatches(doc, state.query, state.options); }
			catch { matches = []; }
			state.matches = matches;
			if (matches.length === 0) {
				state.activeIndex = -1;
			} else if (state.activeIndex < 0 || state.activeIndex >= matches.length) {
				state.activeIndex = 0;
			}
		}
		renderCount();
		kickPlugin();
		broadcast();
	}

	function renderCount() {
		if (!countEl) { return; }
		if (state.invalidRegex) {
			countEl.textContent = 'Invalid regex';
			if (findInputEl) { findInputEl.classList.add('vsword-find-error'); }
			return;
		}
		if (findInputEl) { findInputEl.classList.remove('vsword-find-error'); }
		if (!state.query) {
			countEl.textContent = '0 of 0';
			return;
		}
		const total = state.matches.length;
		if (total === 0) {
			countEl.textContent = 'No results';
			return;
		}
		const idx = state.activeIndex >= 0 ? state.activeIndex + 1 : 0;
		countEl.textContent = idx + ' of ' + total;
	}

	function renderOptionButtons() {
		if (!el) { return; }
		const map = { caseSensitive: '.vsword-find-case', wholeWord: '.vsword-find-word', useRegex: '.vsword-find-regex' };
		for (const key of Object.keys(map)) {
			const btn = el.querySelector(map[key]);
			if (!btn) { continue; }
			if (state.options[key]) { btn.classList.add('vsword-find-opt-on'); btn.setAttribute('aria-pressed', 'true'); }
			else { btn.classList.remove('vsword-find-opt-on'); btn.setAttribute('aria-pressed', 'false'); }
		}
	}

	function next() {
		if (state.matches.length === 0) { return; }
		state.activeIndex = (state.activeIndex + 1) % state.matches.length;
		renderCount();
		kickPlugin();
		broadcast();
	}
	function prev() {
		if (state.matches.length === 0) { return; }
		state.activeIndex = (state.activeIndex - 1 + state.matches.length) % state.matches.length;
		renderCount();
		kickPlugin();
		broadcast();
	}

	function setWidgetVisible(visible) {
		if (!el) { return; }
		if (visible) {
			el.classList.remove('vsword-hidden');
			el.classList.add('is-open');
			el.style.display = '';
			el.setAttribute('aria-hidden', 'false');
		} else {
			el.classList.add('vsword-hidden');
			el.classList.remove('is-open');
			// 双保险：即使主题/层叠把 .vsword-hidden 冲掉，也强制不占位
			el.style.display = 'none';
			el.setAttribute('aria-hidden', 'true');
		}
	}

	function open() {
		if (!el) { return; }
		state.widgetOpen = true;
		setWidgetVisible(true);
		if (replaceRowEl) {
			replaceRowEl.classList.add('vsword-hidden');
			replaceRowEl.style.display = 'none';
		}
		recompute();
		try { findInputEl?.focus(); findInputEl?.select?.(); } catch { /* noop */ }
	}

	function openReplace() {
		if (!el) { return; }
		state.widgetOpen = true;
		setWidgetVisible(true);
		const readOnly = getMode() === 'reading';
		if (replaceRowEl) {
			// reading mode 下允许显示但把 replace 按钮 disabled（c 卡再补真事务）；此卡先显示。
			replaceRowEl.classList.remove('vsword-hidden');
			replaceRowEl.style.display = '';
			replaceRowEl.classList.toggle('vsword-find-replace-disabled', readOnly);
			const btnOne = replaceRowEl.querySelector('.vsword-replace-one');
			const btnAll = replaceRowEl.querySelector('.vsword-replace-all');
			if (btnOne) { btnOne.toggleAttribute('disabled', readOnly); }
			if (btnAll) { btnAll.toggleAttribute('disabled', readOnly); }
		}
		recompute();
		try { findInputEl?.focus(); findInputEl?.select?.(); } catch { /* noop */ }
	}

	function close() {
		if (!el) { return; }
		state.widgetOpen = false;
		state.matches = [];
		state.activeIndex = -1;
		setWidgetVisible(false);
		if (replaceRowEl) {
			replaceRowEl.classList.add('vsword-hidden');
			replaceRowEl.style.display = 'none';
		}
		renderCount();
		kickPlugin();
		broadcast();
		// 把焦点交还给编辑器 —— 用户 Esc 后期望立即恢复打字。
		try { getView()?.focus?.(); } catch { /* noop */ }
	}

	function isOpen() { return !!state.widgetOpen; }

	function setQuery(q) {
		state.query = typeof q === 'string' ? q : '';
		if (findInputEl) { findInputEl.value = state.query; }
		recompute();
	}

	function getState() {
		return {
			index: state.activeIndex >= 0 ? state.activeIndex + 1 : 0,
			total: state.matches.length,
		};
	}

	function getFindState() {
		// 直接返回 mutable 引用即可 —— find-plugin.apply 只读它一次，不会持有。
		return state;
	}

	function buildDom(doc) {
		const wrap = doc.createElement('div');
		wrap.id = 'vsword-find-widget';
		wrap.className = 'vsword-find-widget vsword-hidden';
		wrap.style.display = 'none';
		wrap.setAttribute('aria-hidden', 'true');
		wrap.setAttribute('role', 'search');
		wrap.setAttribute('aria-label', '查找与替换');

		const findRow = doc.createElement('div');
		findRow.className = 'vsword-find-row';

		const input = doc.createElement('input');
		input.type = 'text';
		input.className = 'vsword-find-input';
		input.placeholder = '查找';
		input.setAttribute('aria-label', '查找');
		findRow.appendChild(input);

		function optBtn(cls, label, title) {
			const b = doc.createElement('button');
			b.type = 'button';
			b.className = 'vsword-find-opt ' + cls;
			b.textContent = label;
			b.title = title;
			b.setAttribute('aria-pressed', 'false');
			return b;
		}
		findRow.appendChild(optBtn('vsword-find-case', 'Aa', '区分大小写'));
		findRow.appendChild(optBtn('vsword-find-word', 'Ab', '全字匹配'));
		findRow.appendChild(optBtn('vsword-find-regex', '.*', '正则'));

		const count = doc.createElement('span');
		count.className = 'vsword-find-count';
		count.textContent = '0 of 0';
		findRow.appendChild(count);

		function iconBtn(cls, label, title) {
			const b = doc.createElement('button');
			b.type = 'button';
			b.className = cls;
			b.textContent = label;
			b.title = title;
			return b;
		}
		findRow.appendChild(iconBtn('vsword-find-prev', '↑', '上一个（Shift+Enter）'));
		findRow.appendChild(iconBtn('vsword-find-next', '↓', '下一个（Enter）'));
		findRow.appendChild(iconBtn('vsword-find-close', '✕', '关闭（Esc）'));

		wrap.appendChild(findRow);

		const replaceRow = doc.createElement('div');
		replaceRow.className = 'vsword-replace-row vsword-hidden';
		replaceRow.style.display = 'none';
		const replaceInput = doc.createElement('input');
		replaceInput.type = 'text';
		replaceInput.className = 'vsword-replace-input';
		replaceInput.placeholder = '替换为';
		replaceInput.setAttribute('aria-label', '替换为');
		replaceRow.appendChild(replaceInput);
		replaceRow.appendChild(iconBtn('vsword-replace-one', '替换', '替换当前匹配'));
		replaceRow.appendChild(iconBtn('vsword-replace-all', '全部替换', '替换所有匹配'));
		wrap.appendChild(replaceRow);

		return wrap;
	}

	function mount(container) {
		if (!container || typeof container.appendChild !== 'function') {
			throw new Error('createFindWidget.mount: container 必须是 DOM 元素');
		}
		if (el) { unmount(); }
		mountedContainer = container;
		const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
		if (!doc) { throw new Error('createFindWidget.mount: no ownerDocument'); }
		el = buildDom(doc);
		container.appendChild(el);
		findInputEl = el.querySelector('.vsword-find-input');
		replaceInputEl = el.querySelector('.vsword-replace-input');
		replaceRowEl = el.querySelector('.vsword-replace-row');
		countEl = el.querySelector('.vsword-find-count');

		// find input：edit → recompute
		if (findInputEl) {
			bind(findInputEl, 'input', () => {
				state.query = findInputEl.value || '';
				state.activeIndex = state.query ? 0 : -1;
				recompute();
			});
			// Enter / Shift+Enter：只在 input 有焦点时拦截。
			bind(findInputEl, 'keydown', (ev) => {
				if (ev.key === 'Enter' && !ev.isComposing) {
					ev.preventDefault();
					if (ev.shiftKey) { prev(); } else { next(); }
				} else if (ev.key === 'Escape') {
					ev.preventDefault();
					close();
				}
			});
		}
		if (replaceInputEl) {
			bind(replaceInputEl, 'input', () => { broadcast(); });
			bind(replaceInputEl, 'keydown', (ev) => {
				if (ev.key === 'Escape') { ev.preventDefault(); close(); }
			});
		}

		// 选项按钮：toggle → recompute
		const map = { caseSensitive: '.vsword-find-case', wholeWord: '.vsword-find-word', useRegex: '.vsword-find-regex' };
		for (const key of Object.keys(map)) {
			const btn = el.querySelector(map[key]);
			if (!btn) { continue; }
			bind(btn, 'click', () => {
				state.options = { ...state.options, [key]: !state.options[key] };
				renderOptionButtons();
				recompute();
			});
		}

		// 上/下/关闭
		const btnPrev = el.querySelector('.vsword-find-prev');
		const btnNext = el.querySelector('.vsword-find-next');
		const btnClose = el.querySelector('.vsword-find-close');
		if (btnPrev) { bind(btnPrev, 'click', () => prev()); }
		if (btnNext) { bind(btnNext, 'click', () => next()); }
		if (btnClose) { bind(btnClose, 'click', () => close()); }

		// 替换按钮：本卡（T-3.7c.3.c）真正执行 tr —— 调用 helpers 的
		// applyReplaceOne / applyReplaceAll。reading gate 三重保险：
		//   1) find-keymap 拦截 Ctrl+H 不呼出（read-only 二次防护）
		//   2) openReplace 里给 button 加 disabled 属性 + `.vsword-find-replace-disabled` class
		//   3) 本 handler 里 getMode()==='reading' 静默 return（即使 disabled 被 DOM 层绕过）
		//   4) helpers.applyReplaceOne/All 内部 _isReadOnly 兜底 return 0/-1
		const btnReplaceOne = el.querySelector('.vsword-replace-one');
		const btnReplaceAll = el.querySelector('.vsword-replace-all');
		function doReplace(kind) {
			if (getMode() === 'reading') { return; }
			const view = getView();
			if (!view || !view.state || typeof view.dispatch !== 'function') { return; }
			// 每次替换前把当前 mode 同步进 state —— helpers 里 _isReadOnly 依赖 state.mode。
			state.mode = getMode() || 'wysiwyg';
			const replacement = replaceInputEl ? (replaceInputEl.value || '') : '';
			if (kind === 'one') {
				const hint = applyReplaceOne(view, state, replacement);
				// doc 变了：重算 matches → clamp activeIndex 到 hint（-1 表示无匹配）
				if (hint >= 0) { state.activeIndex = hint; }
				recompute();
			} else if (kind === 'all') {
				applyReplaceAll(view, state, replacement);
				// 全部替换后原 matches 全失效；recompute 会拉出新的（应为 0）
				state.activeIndex = -1;
				recompute();
			}
			// 保留 vsword-find-replace 事件（host 状态服务化 c2 卡消费；本卡先广播 kind + total 供
			// 外部 spy）。event 不再是**唯一**执行途径 —— 事务由 helpers 已即时完成。
			try {
				el?.dispatchEvent(new (doc.defaultView?.CustomEvent || CustomEvent)('vsword-find-replace', {
					bubbles: true,
					detail: { kind, replacement, total: state.matches.length, activeIndex: state.activeIndex },
				}));
			} catch { /* noop */ }
		}
		if (btnReplaceOne) { bind(btnReplaceOne, 'click', () => doReplace('one')); }
		if (btnReplaceAll) { bind(btnReplaceAll, 'click', () => doReplace('all')); }

		renderOptionButtons();
		renderCount();
	}

	function unmount() {
		unbindAll();
		if (el && el.parentNode) {
			try { el.parentNode.removeChild(el); } catch { /* noop */ }
		}
		// unmount 语义：解绑事件 + 拆 DOM，但 el 引用仍保留（下次 mount 前不能再点）。
		// mode-switch 里 DOM 是骨架，unmount 后 el 保留；这里 DOM 是本组件生成，拆后
		// 把 el 拉平到 null 才符合语义（下次 mount 会重建）。
		el = null;
		findInputEl = null;
		replaceInputEl = null;
		replaceRowEl = null;
		countEl = null;
	}

	function dispose() {
		const container = mountedContainer;
		unmount();
		state = makeInitialState();
		mountedContainer = null;
		if (container && typeof container.dispatchEvent === 'function') {
			try {
				const Ctor = (container.ownerDocument && container.ownerDocument.defaultView && container.ownerDocument.defaultView.CustomEvent)
					|| (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
				if (Ctor) {
					container.dispatchEvent(new Ctor(VSWORD_UI_COMPONENT_DISPOSED_EVENT, {
						bubbles: true,
						detail: { component: 'find-widget' },
					}));
				}
			} catch { /* noop */ }
		}
	}

	return {
		get el() { return el; },
		mount,
		unmount,
		dispose,
		open,
		openReplace,
		close,
		isOpen,
		setQuery,
		getState,
		getFindState,
	};
}

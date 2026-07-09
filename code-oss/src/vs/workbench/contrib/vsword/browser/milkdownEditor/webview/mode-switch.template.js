// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown webview · ModeSwitchComponent（T-3.7b.d）
 *
 *  从 entry.template.js 剥离出的可复用组件，实现 IMilkdownUIComponent 契约。
 *  只承担「event wiring + aria-pressed 状态同步」两件事 —— DOM markup 由
 *  `milkdownEditorHtml.ts` 硬编码生成，本组件不重排。
 *
 *  T-3.12.3.b: 二级 focus/typewriter 双 toggle 合并为 substyle radiogroup (三选一互斥) —
 *  阅读模式下整块从 DOM 移除, 其他模式下渲染并从 stored substyle 恢复选中态.
 *
 *  DOM 契约（由 host HTML 保证）：
 *    <div id="milkdown-mode-switch" role="radiogroup">
 *      <button class="vsword-md-mode-btn" data-mode="realtime|reading|source" aria-pressed="…">…</button>
 *      × 3 (三态互斥)
 *    </div>
 *    <div id="milkdown-substyle-group" role="radiogroup">                        ← T-3.12.3.b 新增
 *      <button class="vsword-md-substyle-btn" data-substyle="normal|focus|typewriter" aria-pressed="…">…</button>
 *      × 3 (三选一互斥 · reading 模式下整块 detach)
 *    </div>
 *
 *  与 mode-controller.template.js 的关系：mode-controller 仍然拥有状态机 + 快捷键 +
 *  与 host 的 preferenceUpdate 协议。本组件只是把「点击 mode 按钮 → 调 controller.switchTo」/
 *  「点击 substyle radio → 调 controller.setSubstyle」的 event wiring 集中到一处.
 *
 *  为了避免重复绑（controller 内也有自己的 click listener），本卡 T-3.7b.d 走「controller
 *  接管点击」的路径 —— 组件的 onSetMode / onToggle* 回调保留，但在 entry.template.js
 *  的接线里选择只走 controller。测试里则把 deps 三个回调都绑到 spy，直接验组件自己的
 *  click → callback 语义。
 *
 *  参考：docs/requirements/T-3.7b-view-modes-prd.md §4.5 UI 组件契约。
 *--------------------------------------------------------------------------------------------*/

import { VSWORD_UI_COMPONENT_DISPOSED_EVENT } from './ui-component.mjs';

/**
 * @typedef {'realtime' | 'reading' | 'source'} ViewMode
 */

/**
 * @typedef {'normal' | 'focus' | 'typewriter'} Substyle
 */

/**
 * @typedef {Object} ModeSwitchState
 * @property {ViewMode} mode
 * @property {Substyle} substyle
 * @property {boolean} [focus]        — legacy · 从 substyle 派生 (兼容旧调用点).
 * @property {boolean} [typewriter]   — legacy · 从 substyle 派生 (兼容旧调用点).
 */

/**
 * 创建 ModeSwitchComponent（三态 mode radiogroup + substyle radiogroup 三选一）。
 *
 * @param {Object} deps
 * @param {(mode: ViewMode) => void} deps.onSetMode                    — 一级 radio 点击回调。
 * @param {(substyle: Substyle) => void} deps.onSetSubstyle            — 二级 substyle radio 点击回调。
 * @param {() => ModeSwitchState} deps.getState                        — mount 时回读状态, 同步 aria-pressed。
 * @returns {import('./ui-component.mjs').IMilkdownUIComponent & {
 *   updateAriaPressed: (state: ModeSwitchState) => void,
 *   applyModeVisibility: (mode: ViewMode) => void,
 * }}
 */
export function createModeSwitchComponent(deps) {
	if (!deps || typeof deps.onSetMode !== 'function'
		|| typeof deps.onSetSubstyle !== 'function' || typeof deps.getState !== 'function') {
		throw new Error('createModeSwitchComponent: deps 必须包含 onSetMode / onSetSubstyle / getState');
	}

	/** @type {HTMLElement | null} */
	let el = null;
	/** @type {HTMLElement | null} */
	let substyleGroupEl = null;
	/**
	 * 阅读模式下 substyle-group 从 DOM 移除, 但保留在此变量里以便切离 reading 时 re-attach.
	 * `parentEl` + `nextSibling` 记录 detach 前的插入点, re-attach 用 insertBefore 恢复原位.
	 * @type {{ parentEl: HTMLElement, nextSibling: Node | null } | null}
	 */
	let substyleAnchor = null;
	/** @type {HTMLElement | null} */
	let mountedContainer = null;
	/** @type {Array<{ btn: HTMLElement, handler: (ev: Event) => void }>} */
	let listeners = [];

	function bindClick(btn, handler) {
		btn.addEventListener('click', handler);
		listeners.push({ btn, handler });
	}

	function unbindAll() {
		for (const { btn, handler } of listeners) {
			try { btn.removeEventListener('click', handler); } catch { /* noop */ }
		}
		listeners = [];
	}

	function updateAriaPressed(state) {
		if (!el) return;
		const modeButtons = el.querySelectorAll('.vsword-md-mode-btn');
		const targetMode = state && typeof state.mode === 'string' ? state.mode : null;
		modeButtons.forEach(btn => {
			const isActive = btn.getAttribute('data-mode') === targetMode;
			btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
			if (btn.getAttribute('role') === 'radio') {
				btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
			}
		});
		if (substyleGroupEl) {
			// substyle 派生: 优先取 state.substyle; 否则从 legacy state.focus/typewriter 推断 (radio 语义).
			let targetSubstyle = state && typeof state.substyle === 'string' ? state.substyle : null;
			if (!targetSubstyle) {
				if (state && state.typewriter) targetSubstyle = 'typewriter';
				else if (state && state.focus) targetSubstyle = 'focus';
				else targetSubstyle = 'normal';
			}
			const substyleButtons = substyleGroupEl.querySelectorAll('.vsword-md-substyle-btn');
			substyleButtons.forEach(btn => {
				const isActive = btn.getAttribute('data-substyle') === targetSubstyle;
				btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
				if (btn.getAttribute('role') === 'radio') {
					btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
				}
			});
		}
	}

	/**
	 * 根据一级 mode 同步二级 substyle-group 的 DOM 存在性 (选项 A · DOM detach/re-attach).
	 * reading 模式下整块从 tree 移除; realtime/source 模式下 re-attach 回原位.
	 * @param {ViewMode} mode
	 */
	function applyModeVisibility(mode) {
		if (mode === 'reading') {
			// detach
			if (substyleGroupEl && substyleGroupEl.parentNode) {
				substyleAnchor = {
					parentEl: /** @type {HTMLElement} */ (substyleGroupEl.parentNode),
					nextSibling: substyleGroupEl.nextSibling,
				};
				substyleGroupEl.parentNode.removeChild(substyleGroupEl);
			}
		} else {
			// re-attach (幂等 · 已在 tree 上就跳过)
			if (substyleGroupEl && !substyleGroupEl.isConnected && substyleAnchor) {
				const { parentEl, nextSibling } = substyleAnchor;
				try {
					parentEl.insertBefore(substyleGroupEl, nextSibling);
				} catch {
					// nextSibling 可能已被 GC/其它插件移除 → 兜底 append 到 parent 末尾.
					parentEl.appendChild(substyleGroupEl);
				}
			}
		}
	}

	function mount(container) {
		if (!container || typeof container.querySelector !== 'function') {
			throw new Error('createModeSwitchComponent.mount: container 必须是 DOM 元素');
		}
		// 幂等：重复 mount 先 unmount。
		if (el) unmount();
		el = container.querySelector('#milkdown-mode-switch');
		substyleGroupEl = container.querySelector('#milkdown-substyle-group');
		substyleAnchor = null; // 每次 mount 重置 · 由 applyModeVisibility 首次 reading 切换时回填.
		mountedContainer = container;
		if (!el) {
			// 找不到骨架不算致命错，只是不 wire —— 让 host 有能力把 DOM 延后到组件之后。
			return;
		}
		const modeButtons = el.querySelectorAll('.vsword-md-mode-btn');
		modeButtons.forEach(btn => {
			const mode = btn.getAttribute('data-mode');
			if (mode !== 'realtime' && mode !== 'reading' && mode !== 'source') return;
			bindClick(btn, () => {
				try { deps.onSetMode(mode); } catch { /* upstream 错误自吞，避免影响其他按钮 */ }
			});
		});
		if (substyleGroupEl) {
			const substyleButtons = substyleGroupEl.querySelectorAll('.vsword-md-substyle-btn');
			substyleButtons.forEach(btn => {
				const sub = btn.getAttribute('data-substyle');
				if (sub !== 'normal' && sub !== 'focus' && sub !== 'typewriter') return;
				bindClick(btn, () => {
					try { deps.onSetSubstyle(sub); } catch { /* noop */ }
				});
			});
		}
		// mount 完成后按当前 state 刷 aria-pressed（unmount 期间外部状态可能已变化）。
		try {
			const currentState = deps.getState() || { mode: 'realtime', substyle: 'normal' };
			updateAriaPressed(currentState);
			// 若 mount 时已经处于 reading, 立即 detach substyle-group.
			applyModeVisibility(currentState.mode || 'realtime');
		} catch { /* noop */ }
	}

	function unmount() {
		unbindAll();
	}

	function dispose() {
		unmount();
		const container = mountedContainer;
		el = null;
		substyleGroupEl = null;
		substyleAnchor = null;
		mountedContainer = null;
		if (container && typeof container.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
			try {
				container.dispatchEvent(new CustomEvent(VSWORD_UI_COMPONENT_DISPOSED_EVENT, {
					bubbles: true,
					detail: { component: 'mode-switch' },
				}));
			} catch { /* noop */ }
		}
	}

	// 返回 IMilkdownUIComponent 契约 + 特有的 updateAriaPressed / applyModeVisibility。
	// el 用 getter 暴露，让外部读取时始终能拿到最新引用（unmount 后仍非 null，dispose 后置 null —— AC-8 断言用）。
	const component = {
		get el() { return el; },
		mount,
		unmount,
		dispose,
		updateAriaPressed,
		applyModeVisibility,
	};
	return component;
}

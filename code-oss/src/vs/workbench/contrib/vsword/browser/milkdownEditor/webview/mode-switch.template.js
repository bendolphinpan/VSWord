// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown webview · ModeSwitchComponent（T-3.7b.d）
 *
 *  从 entry.template.js 剥离出的可复用组件，实现 IMilkdownUIComponent 契约。
 *  只承担「event wiring + aria-pressed 状态同步」两件事 —— DOM markup 由
 *  `milkdownEditorHtml.ts` 硬编码生成，本组件不重排。
 *
 *  T-3.12.3.b: 二级 focus/typewriter 双 toggle 合并为 substyle radiogroup (三选一互斥).
 *  T-3.13.2: 阅读模式下 substyle-group **保留在 DOM 内** (旧 3.b 的 detach 已废弃),
 *  由 CSS + focus-mode plugin 分别渲染 dim / typewriter re-scroll — reading × normal
 *  / focus / typewriter 三档在 shell 上都是各自的值.
 *
 *  DOM 契约（由 host HTML 保证）：
 *    <div id="milkdown-mode-switch" role="radiogroup">
 *      <button class="vsword-md-mode-btn" data-mode="realtime|reading|source" aria-pressed="…">…</button>
 *      × 3 (三态互斥)
 *    </div>
 *    <div id="milkdown-substyle-group" role="radiogroup">                        ← T-3.12.3.b 新增
 *      <button class="vsword-md-substyle-btn" data-substyle="normal|focus|typewriter" aria-pressed="…">…</button>
 *      × 3 (三选一互斥 · T-3.13.2 起 reading 模式下保留在 DOM · 由 CSS + focus-mode plugin 渲染)
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
	/** @type {HTMLElement | null} */
	let mountedContainer = null;
	/** @type {Array<{ btn: HTMLElement, handler: (ev: Event) => void }>} */
	let listeners = [];

	/**
	 * 工具栏按钮：mousedown preventDefault 防止 contenteditable 失焦（切模式丢光标根因）。
	 * click 仍正常触发 mode/substyle 切换。
	 */
	function bindClick(btn, handler) {
		const onMouseDown = (ev) => {
			// 保留主/辅键默认行为以外的焦点：阻止按钮抢走 ProseMirror 焦点
			try { ev.preventDefault(); } catch { /* noop */ }
		};
		btn.addEventListener('mousedown', onMouseDown);
		btn.addEventListener('click', handler);
		listeners.push({ btn, handler, onMouseDown });
	}

	function unbindAll() {
		for (const entry of listeners) {
			const { btn, handler, onMouseDown } = entry;
			try { btn.removeEventListener('click', handler); } catch { /* noop */ }
			if (onMouseDown) {
				try { btn.removeEventListener('mousedown', onMouseDown); } catch { /* noop */ }
			}
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
	 * T-3.13.2 起 no-op: 阅读模式下 substyle-group 保留在 DOM 内, 由 CSS + focus-mode
	 * plugin 分别渲染 dim / typewriter re-scroll — reading × normal / focus / typewriter
	 * 三档在 shell 上都是各自的值.
	 *
	 * 保留函数签名 (向后兼容 entry.template.js 的调用点), 但不再执行任何 DOM 操作.
	 * 如果外部调用者已改造完成, 可以在后续任务里把这里连同调用点一起移除.
	 * @param {ViewMode} _mode
	 */
	function applyModeVisibility(_mode) {
		// no-op (T-3.13.2)
	}

	function mount(container) {
		if (!container || typeof container.querySelector !== 'function') {
			throw new Error('createModeSwitchComponent.mount: container 必须是 DOM 元素');
		}
		// 幂等：重复 mount 先 unmount。
		if (el) unmount();
		el = container.querySelector('#milkdown-mode-switch');
		substyleGroupEl = container.querySelector('#milkdown-substyle-group');
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
			// T-3.13.2: substyle-group 常驻 DOM, applyModeVisibility 为 no-op, 保留调用以承前.
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

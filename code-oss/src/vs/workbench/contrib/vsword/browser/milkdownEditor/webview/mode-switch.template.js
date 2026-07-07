// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown webview · ModeSwitchComponent（T-3.7b.d）
 *
 *  从 entry.template.js 剥离出的可复用组件，实现 IMilkdownUIComponent 契约。
 *  只承担「event wiring + aria-pressed 状态同步」两件事 —— DOM markup 由
 *  `milkdownEditorHtml.ts` 硬编码生成，本组件不重排。
 *
 *  DOM 契约（由 host HTML 保证）：
 *    <div id="milkdown-mode-switch">
 *      <button class="vsword-md-mode-btn" data-mode="realtime|reading|source" aria-pressed="…">…</button>
 *      × 3 (三态互斥)
 *    </div>
 *    <div id="milkdown-toggle-group">
 *      <button class="vsword-md-toggle-btn" data-toggle="focus|typewriter" aria-pressed="…">…</button>
 *      × 2 (双 toggle 独立)
 *    </div>
 *
 *  与 mode-controller.template.js 的关系：mode-controller 仍然拥有状态机 + 快捷键 +
 *  与 host 的 preferenceUpdate 协议。本组件只是把「点击 mode 按钮 → 调 controller.switchTo」/
 *  「点击 toggle 按钮 → 调 controller.setFocus/setTypewriter」的 event wiring 集中到一处。
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
 * @typedef {Object} ModeSwitchState
 * @property {ViewMode} mode
 * @property {boolean} focus
 * @property {boolean} typewriter
 */

/**
 * 创建 ModeSwitchComponent（三态 mode 按钮组 + focus/typewriter toggle 按钮组）。
 *
 * @param {Object} deps
 * @param {(mode: ViewMode) => void} deps.onSetMode                      — 三态按钮点击回调。
 * @param {() => void} deps.onToggleFocus                                 — focus toggle 点击回调。
 * @param {() => void} deps.onToggleTypewriter                            — typewriter toggle 点击回调。
 * @param {() => ModeSwitchState} deps.getState                           — mount 时回读状态，同步 aria-pressed。
 * @returns {import('./ui-component.mjs').IMilkdownUIComponent & { updateAriaPressed: (state: ModeSwitchState) => void }}
 */
export function createModeSwitchComponent(deps) {
	if (!deps || typeof deps.onSetMode !== 'function' || typeof deps.onToggleFocus !== 'function'
		|| typeof deps.onToggleTypewriter !== 'function' || typeof deps.getState !== 'function') {
		throw new Error('createModeSwitchComponent: deps 必须包含 onSetMode / onToggleFocus / onToggleTypewriter / getState');
	}

	/** @type {HTMLElement | null} */
	let el = null;
	/** @type {HTMLElement | null} */
	let toggleGroupEl = null;
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
		});
		if (toggleGroupEl) {
			const toggleButtons = toggleGroupEl.querySelectorAll('.vsword-md-toggle-btn');
			toggleButtons.forEach(btn => {
				const kind = btn.getAttribute('data-toggle');
				const on = (kind === 'focus') ? !!(state && state.focus)
					: (kind === 'typewriter') ? !!(state && state.typewriter)
						: false;
				btn.setAttribute('aria-pressed', on ? 'true' : 'false');
			});
		}
	}

	function mount(container) {
		if (!container || typeof container.querySelector !== 'function') {
			throw new Error('createModeSwitchComponent.mount: container 必须是 DOM 元素');
		}
		// 幂等：重复 mount 先 unmount。
		if (el) unmount();
		el = container.querySelector('#milkdown-mode-switch');
		toggleGroupEl = container.querySelector('#milkdown-toggle-group');
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
		if (toggleGroupEl) {
			const toggleButtons = toggleGroupEl.querySelectorAll('.vsword-md-toggle-btn');
			toggleButtons.forEach(btn => {
				const kind = btn.getAttribute('data-toggle');
				if (kind === 'focus') {
					bindClick(btn, () => { try { deps.onToggleFocus(); } catch { /* noop */ } });
				} else if (kind === 'typewriter') {
					bindClick(btn, () => { try { deps.onToggleTypewriter(); } catch { /* noop */ } });
				}
			});
		}
		// mount 完成后按当前 state 刷 aria-pressed（unmount 期间外部状态可能已变化）。
		try { updateAriaPressed(deps.getState() || { mode: 'realtime', focus: false, typewriter: false }); }
		catch { /* noop */ }
	}

	function unmount() {
		unbindAll();
	}

	function dispose() {
		unmount();
		const container = mountedContainer;
		el = null;
		toggleGroupEl = null;
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

	// 返回 IMilkdownUIComponent 契约 + 特有的 updateAriaPressed。el 用 getter 暴露，
	// 让外部读取时始终能拿到最新引用（unmount 后仍非 null，dispose 后置 null —— AC-8 断言用）。
	const component = {
		get el() { return el; },
		mount,
		unmount,
		dispose,
		updateAriaPressed,
	};
	return component;
}

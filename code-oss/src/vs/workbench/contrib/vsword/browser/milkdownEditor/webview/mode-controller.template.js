// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown mode controller (T-3.3.2 + T-3.10 + T-3.12.3.a).
 *
 *  Owns the two-level state machine:
 *    mode:      realtime | reading | source           (一级 tabbar · radio)
 *    substyle:  normal | focus | typewriter           (二级子菜单 · radio · v2 mutually exclusive)
 *
 *  Shell attributes reflect state so CSS + plugins can gate off them:
 *    .vsword-md-shell[data-mode="…"] [data-substyle="…"]
 *
 *  Semantics:
 *    - reading mode: substyle stored value preserved in memento; shell forces
 *      visual `data-substyle=normal` (阅读态自身即专注阅读体验, no overlay)
 *    - source mode:  substyle透传到 shell（stored + 视觉 · 但 CSS/plugins 无法
 *                    作用于 <textarea>, 结果是"选中了但看不到效果"）
 *    - realtime:     substyle stored 值直通视觉
 *
 *  Contract with the host (backward compatible):
 *    Boot:   post {preferenceRequest} → receive {preferenceResponse, mode, focus?, typewriter?}
 *    Change: post {preferenceUpdate, mode?, focus?, typewriter?}   fire-and-forget partials
 *    NOTE: substyle 不进协议 (PRD §8: "二级 substyle 走 webview 内部状态 + memento,
 *          不上协议层"). preferenceUpdate 里的 focus/typewriter 派生自 substyle,
 *          仅用于向老 host storage 保持向后兼容; webview 侧真实 source of truth
 *          是 localStorage key `vsword.milkdown.substyle`.
 *
 *  Keys:
 *    Ctrl+/           cycle mode      (realtime → reading → source → realtime)
 *    Ctrl+Shift+F     substyle → 'focus'      (若当前已 focus 则回 normal)
 *    Ctrl+Shift+T     substyle → 'typewriter' (若当前已 typewriter 则回 normal)
 *
 *  阅读模式下 Ctrl+Shift+F/T no-op (二级菜单 3.b 之后从 DOM 移除, 快捷键也失效).
 *--------------------------------------------------------------------------------------------*/

export const MODES = ['realtime', 'reading', 'source'];
export const DEFAULT_MODE = 'realtime';
export const SUBSTYLES = ['normal', 'focus', 'typewriter'];
export const DEFAULT_SUBSTYLE = 'normal';

/** Webview localStorage key for the persisted substyle radio value. */
export const VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY = 'vsword.milkdown.substyle';

function isValidMode(m) { return MODES.indexOf(m) !== -1; }
function isValidSubstyle(s) { return SUBSTYLES.indexOf(s) !== -1; }

/** Read the persisted substyle from webview localStorage; undefined if absent/invalid. */
function readStoredSubstyle() {
	try {
		const raw = window?.localStorage?.getItem?.(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY);
		if (isValidSubstyle(raw)) return raw;
	} catch { /* localStorage may be unavailable (SecurityError in some sandboxes) */ }
	return undefined;
}

/** Write the substyle to webview localStorage (best-effort, silent on failure). */
function writeStoredSubstyle(substyle) {
	try {
		window?.localStorage?.setItem?.(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY, substyle);
	} catch { /* noop */ }
}

/**
 * Derive substyle from legacy {focus?, typewriter?} preference bag.
 * Migration rule (PRD §4.2): both true → typewriter wins (v1 C-4 语义弱, typewriter is
 * the more actionable of the two); single true → that one; both off/absent → normal.
 */
function deriveSubstyleFromLegacyPref(pref, fallback) {
	if (!pref || typeof pref !== 'object') return fallback;
	const focus = pref.focus === 'on' || pref.focus === true;
	const typewriter = pref.typewriter === 'on' || pref.typewriter === true;
	if (typewriter) return 'typewriter';
	if (focus) return 'focus';
	// If pref explicitly says focus=off + typewriter=off (both present) → 'normal'.
	// If both fields absent → keep fallback (caller decides).
	const hasFocusField = pref.focus !== undefined;
	const hasTwField = pref.typewriter !== undefined;
	if (hasFocusField || hasTwField) return 'normal';
	return fallback;
}

export function createModeController(opts) {
	const {
		shell,                 // .vsword-md-shell root
		buttons,               // NodeList of mode buttons (data-mode=realtime|reading|source)
		toggleButtons,         // NodeList of legacy toggle buttons (data-toggle=focus|typewriter)
		                       //   T-3.12.3.b: substyle radio group 已上线 (substyleButtons), 本参数保留
		                       //   仅为让老 viewModes.test.ts (T-3.10 遗留 fixture) 断言仍能跑。生产 DOM
		                       //   已删除 #milkdown-toggle-group; 此分支运行期恒为 undefined NodeList。
		substyleButtons,       // NodeList of substyle radio buttons (data-substyle=normal|focus|typewriter)
		                       //   T-3.12.3.b 新增 · 生产环境由 entry.template.js 传入; 若未传则仅走 shell 属性更新。
		sourceTextarea,
		getMarkdown,
		setMarkdown,
		vscode,
		onModeChange,          // (mode, prevMode) => void
		// T-3.7b.d: 当上层用 ModeSwitchComponent 接管 click 派发时，把这里设为 false 关掉
		// controller 内部的 click listener，避免与 component 内的 handler 双触发。
		// aria-pressed 与 disabled 依旧由 applyDom() 更新（不影响现有 viewModes.test.ts）。
		wireButtons = true,
	} = opts;

	let currentMode = DEFAULT_MODE;
	/** @type {'normal' | 'focus' | 'typewriter'} */
	let substyle = DEFAULT_SUBSTYLE;
	let switching = false;
	let sourceInitialized = false;

	function applyDom() {
		if (!shell) return;
		shell.setAttribute('data-mode', currentMode);
		// PRD §4.3: 阅读模式下视觉强置 normal, stored 值保留在内部 substyle 变量.
		// 源码/实时预览下 substyle 直通到 shell (PRD §4.4 · 源码下 CSS 层不生效但属性透传).
		const visualSubstyle = currentMode === 'reading' ? 'normal' : substyle;
		shell.setAttribute('data-substyle', visualSubstyle);
		buttons?.forEach(btn => {
			const isActive = btn.getAttribute('data-mode') === currentMode;
			btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
			// role="radio" 场景下 aria-checked 与 aria-pressed 同源, 双写一手保 a11y 树一致.
			if (btn.getAttribute('role') === 'radio') {
				btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
			}
		});
		// T-3.12.3.b: substyle radio group aria-pressed 同步. reading 模式下二级菜单
		// 从 DOM 整块移除 (mode-switch component 负责 detach), 此时 substyleButtons
		// 若是 live NodeList 会自动收缩为空, forEach no-op; 若上层传的是 buttons 内的
		// 缓存快照, forEach 到 detached button 上 setAttribute 也是安全的 (只是无 CSS 效果).
		substyleButtons?.forEach(btn => {
			const kind = btn.getAttribute('data-substyle');
			const isActive = kind === substyle;
			btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
			if (btn.getAttribute('role') === 'radio') {
				btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
			}
		});
		// 兼容 T-3.12.3.b 落地前的老 DOM: `.vsword-md-toggle-btn[data-toggle=focus|typewriter]`.
		// aria-pressed 派生自 substyle radio, disabled 保留旧 source 屏蔽. 生产 DOM 已删除此块,
		// forEach 恒 no-op; 保留供 viewModes.test.ts (T-3.10 遗留 fixture) 断言.
		toggleButtons?.forEach(btn => {
			const kind = btn.getAttribute('data-toggle');
			const on = (kind === 'focus') ? substyle === 'focus'
				: (kind === 'typewriter') ? substyle === 'typewriter'
					: false;
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
			btn.toggleAttribute('disabled', currentMode === 'source');
		});
	}

	function switchTo(nextMode, opts2) {
		opts2 = opts2 || {};
		if (!isValidMode(nextMode) || nextMode === currentMode || switching) return;
		switching = true;
		const prevMode = currentMode;
		try {
			if (nextMode === 'source') {
				sourceTextarea.value = getMarkdown();
				sourceInitialized = true;
			}
			if (prevMode === 'source' && sourceInitialized) {
				setMarkdown(sourceTextarea.value, 'source-exit');
			}
			currentMode = nextMode;
			applyDom();
			if (typeof onModeChange === 'function') onModeChange(nextMode, prevMode);
			if (!opts2.silent && vscode) {
				vscode.postMessage({ type: 'preferenceUpdate', mode: nextMode });
			}
			if (nextMode === 'source') {
				requestAnimationFrame(() => sourceTextarea.focus());
			} else if (nextMode === 'realtime') {
				requestAnimationFrame(() => shell?.querySelector('.ProseMirror')?.focus?.());
			}
		} finally {
			switching = false;
		}
	}

	/**
	 * Set substyle to `next` (radio互斥). Emits partial preferenceUpdate (focus + typewriter
	 * derived) for backward compat with existing host storage. Persists to webview localStorage.
	 * Silent opts skip both host post AND localStorage write (used by applyPersistedPreference).
	 */
	function setSubstyle(next, opts2) {
		opts2 = opts2 || {};
		if (!isValidSubstyle(next)) return;
		if (next === substyle) return;
		substyle = next;
		applyDom();
		if (opts2.silent) return;
		writeStoredSubstyle(substyle);
		if (vscode) {
			// Backward-compat: host still stores focus/typewriter as separate 'on'|'off' bits.
			// Derive them from substyle so old-shape hosts keep working; new-shape hosts (if any)
			// can ignore these and consult the webview's own localStorage on next boot.
			vscode.postMessage({
				type: 'preferenceUpdate',
				focus: substyle === 'focus' ? 'on' : 'off',
				typewriter: substyle === 'typewriter' ? 'on' : 'off',
			});
		}
	}

	function cycle() {
		const idx = MODES.indexOf(currentMode);
		switchTo(MODES[(idx + 1) % MODES.length]);
	}

	// Wire mode buttons.
	if (wireButtons) {
		buttons?.forEach(btn => {
			btn.addEventListener('click', () => {
				const m = btn.getAttribute('data-mode');
				if (isValidMode(m)) switchTo(m);
			});
		});

		// T-3.12.3.b: substyle radio button click wiring. reading mode 下 DOM 已 detach,
		// listener 随 button 生命周期一起走; realtime/source 下点击 radio 触发 setSubstyle
		// (radio 互斥语义, 二次点已选项无副作用 · setSubstyle 内部 next === substyle 短路).
		substyleButtons?.forEach(btn => {
			btn.addEventListener('click', () => {
				if (currentMode === 'reading') return;
				const s = btn.getAttribute('data-substyle');
				if (isValidSubstyle(s)) setSubstyle(s);
			});
		});

		// Wire legacy toggle buttons (kept for T-3.12.3.b handoff period; substyle radio DOM
		// arrives in 3.b and this block becomes dead code then).
		toggleButtons?.forEach(btn => {
			btn.addEventListener('click', () => {
				if (currentMode === 'source') return;
				const kind = btn.getAttribute('data-toggle');
				if (kind === 'focus') {
					setSubstyle(substyle === 'focus' ? 'normal' : 'focus');
				} else if (kind === 'typewriter') {
					setSubstyle(substyle === 'typewriter' ? 'normal' : 'typewriter');
				}
			});
		});
	}

	// Keyboard shortcuts. Ctrl+/ cycles mode. Ctrl+Shift+F/T toggle substyle radio.
	// PRD §5.2: reading mode下两个快捷键 no-op (二级菜单不存在); source mode 沿用旧语义 no-op.
	window.addEventListener('keydown', event => {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (event.key === '/' && !event.shiftKey && !event.altKey) {
			event.preventDefault(); event.stopPropagation(); cycle(); return;
		}
		if (event.shiftKey && !event.altKey) {
			// Use event.code so it survives layout-dependent .key values.
			if (event.code === 'KeyF') {
				event.preventDefault(); event.stopPropagation();
				if (currentMode !== 'source' && currentMode !== 'reading') {
					setSubstyle(substyle === 'focus' ? 'normal' : 'focus');
				}
				return;
			}
			if (event.code === 'KeyT') {
				event.preventDefault(); event.stopPropagation();
				if (currentMode !== 'source' && currentMode !== 'reading') {
					setSubstyle(substyle === 'typewriter' ? 'normal' : 'typewriter');
				}
				return;
			}
		}
	}, true);

	// Bootstrap: read persisted substyle from webview localStorage (source of truth).
	// If absent, we wait for applyPersistedPreference() to migrate from legacy host pref.
	const bootStored = readStoredSubstyle();
	if (bootStored) substyle = bootStored;

	applyDom();

	return {
		getMode: () => currentMode,
		getSubstyle: () => substyle,
		/** @deprecated legacy shim: focus is now a substyle radio value. */
		isFocusOn: () => substyle === 'focus',
		/** @deprecated legacy shim: typewriter is now a substyle radio value. */
		isTypewriterOn: () => substyle === 'typewriter',
		switchTo,
		cycle,
		setSubstyle: (next) => setSubstyle(next),
		/** @deprecated legacy shim: setFocus(true) === setSubstyle('focus'); setFocus(false) turns off focus (→ 'normal') iff currently 'focus'. */
		setFocus: (on) => {
			if (on) setSubstyle('focus');
			else if (substyle === 'focus') setSubstyle('normal');
		},
		/** @deprecated legacy shim: setTypewriter(true) === setSubstyle('typewriter'); setTypewriter(false) turns off typewriter (→ 'normal') iff currently 'typewriter'. */
		setTypewriter: (on) => {
			if (on) setSubstyle('typewriter');
			else if (substyle === 'typewriter') setSubstyle('normal');
		},
		/**
		 * Apply the persisted preference bag. Silent — no host round-trip.
		 *
		 * Substyle source-of-truth precedence:
		 *   1. webview localStorage `vsword.milkdown.substyle` (already read at boot).
		 *   2. legacy {focus, typewriter} in the incoming pref bag → migrate to substyle
		 *      + persist to localStorage (one-time migration).
		 *   3. keep current default (normal).
		 */
		applyPersistedPreference(pref) {
			if (!pref || typeof pref !== 'object') return;
			// mode: unchanged from T-3.10 semantics.
			if (typeof pref.mode === 'string' && isValidMode(pref.mode) && pref.mode !== currentMode) {
				switchTo(pref.mode, { silent: true });
			}
			// substyle: only migrate from legacy fields if localStorage was empty at boot.
			const currentStored = readStoredSubstyle();
			if (!currentStored) {
				const migrated = deriveSubstyleFromLegacyPref(pref, substyle);
				if (migrated !== substyle) {
					setSubstyle(migrated, { silent: true });
				}
				// Persist the migrated value so subsequent boots hit localStorage directly.
				// Skip the write when derivation produced default 'normal' AND no legacy fields
				// were present (avoid writing a bogus 'normal' when host has literally nothing).
				if (migrated !== DEFAULT_SUBSTYLE || pref.focus !== undefined || pref.typewriter !== undefined) {
					writeStoredSubstyle(migrated);
				}
			}
			// If localStorage already had a valid substyle, ignore legacy focus/typewriter
			// on the incoming pref — webview localStorage wins.
		},
		/** Back-compat shim: older host payload was `{ mode }`. */
		applyPersistedMode(mode) {
			this.applyPersistedPreference({ mode });
		},
		getSourceValue: () => sourceTextarea.value,
		isSourceMode: () => currentMode === 'source',
		isReadingMode: () => currentMode === 'reading',
	};
}

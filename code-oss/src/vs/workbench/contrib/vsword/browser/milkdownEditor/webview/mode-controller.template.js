// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown mode controller (T-3.3.2 + T-3.10).
 *
 *  Owns the three-mode state machine plus two independent visual toggles:
 *    mode:        realtime | reading | source
 *    focus:       on | off        (dim non-active blocks; independent of mode · T-3.10 Q1=a)
 *    typewriter:  on | off        (recenter active block on line change · T-3.10 Q2=c)
 *
 *  Shell attributes reflect state so CSS + plugins can gate off them:
 *    .vsword-md-shell[data-mode="…"] [data-focus="on"] [data-typewriter="on"]
 *
 *  Contract with the host (backward compatible):
 *    Boot:   post {preferenceRequest} → receive {preferenceResponse, mode, focus?, typewriter?}
 *    Change: post {preferenceUpdate, mode?, focus?, typewriter?}   fire-and-forget partials
 *
 *  Keys:
 *    Ctrl+/           cycle mode      (realtime → reading → source → realtime)
 *    Ctrl+Shift+F     toggle focus
 *    Ctrl+Shift+T     toggle typewriter
 *
 *  Source mode disables focus/typewriter visually (there's no selection in a
 *  <textarea> to anchor them to) but does NOT flip the stored preference — it
 *  is restored the moment the user leaves source mode.
 *--------------------------------------------------------------------------------------------*/

export const MODES = ['realtime', 'reading', 'source'];
export const DEFAULT_MODE = 'realtime';

function isValidMode(m) { return MODES.indexOf(m) !== -1; }
function coerceBool(v, fallback) {
	if (typeof v === 'boolean') return v;
	if (v === 'on'  || v === 'true'  || v === 1) return true;
	if (v === 'off' || v === 'false' || v === 0) return false;
	return fallback;
}

export function createModeController(opts) {
	const {
		shell,                 // .vsword-md-shell root
		buttons,               // NodeList of mode buttons (data-mode=realtime|reading|source)
		toggleButtons,         // NodeList of toggle buttons (data-toggle=focus|typewriter) — optional
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
	let focusOn = false;
	let typewriterOn = false;
	let switching = false;
	let sourceInitialized = false;

	function applyDom() {
		if (!shell) return;
		shell.setAttribute('data-mode', currentMode);
		// Source mode blanks out focus/typewriter visuals but keeps the stored bit intact.
		const visualFocus = focusOn && currentMode !== 'source';
		const visualTypewriter = typewriterOn && currentMode !== 'source';
		shell.setAttribute('data-focus', visualFocus ? 'on' : 'off');
		shell.setAttribute('data-typewriter', visualTypewriter ? 'on' : 'off');
		buttons?.forEach(btn => {
			const isActive = btn.getAttribute('data-mode') === currentMode;
			btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
		});
		toggleButtons?.forEach(btn => {
			const kind = btn.getAttribute('data-toggle');
			const on = (kind === 'focus') ? focusOn : (kind === 'typewriter') ? typewriterOn : false;
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

	function setToggle(kind, next, opts2) {
		opts2 = opts2 || {};
		const wanted = !!next;
		if (kind === 'focus') {
			if (focusOn === wanted) return;
			focusOn = wanted;
		} else if (kind === 'typewriter') {
			if (typewriterOn === wanted) return;
			typewriterOn = wanted;
		} else {
			return;
		}
		applyDom();
		if (!opts2.silent && vscode) {
			const payload = { type: 'preferenceUpdate' };
			payload[kind] = wanted ? 'on' : 'off';
			vscode.postMessage(payload);
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

		// Wire toggle buttons.
		toggleButtons?.forEach(btn => {
			btn.addEventListener('click', () => {
				if (currentMode === 'source') return;
				const kind = btn.getAttribute('data-toggle');
				if (kind === 'focus') setToggle('focus', !focusOn);
				else if (kind === 'typewriter') setToggle('typewriter', !typewriterOn);
			});
		});
	}

	// Keyboard shortcuts. Ctrl+/ cycles mode (existing). Ctrl+Shift+F / T flip toggles.
	window.addEventListener('keydown', event => {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (event.key === '/' && !event.shiftKey && !event.altKey) {
			event.preventDefault(); event.stopPropagation(); cycle(); return;
		}
		if (event.shiftKey && !event.altKey) {
			// Use event.code so it survives layout-dependent .key values.
			if (event.code === 'KeyF') {
				event.preventDefault(); event.stopPropagation();
				if (currentMode !== 'source') setToggle('focus', !focusOn);
				return;
			}
			if (event.code === 'KeyT') {
				event.preventDefault(); event.stopPropagation();
				if (currentMode !== 'source') setToggle('typewriter', !typewriterOn);
				return;
			}
		}
	}, true);

	applyDom();

	return {
		getMode: () => currentMode,
		isFocusOn: () => focusOn,
		isTypewriterOn: () => typewriterOn,
		switchTo,
		cycle,
		setFocus: (on) => setToggle('focus', on),
		setTypewriter: (on) => setToggle('typewriter', on),
		/** Apply the persisted preference bag. Silent — no host round-trip. */
		applyPersistedPreference(pref) {
			if (!pref || typeof pref !== 'object') return;
			if (typeof pref.mode === 'string' && isValidMode(pref.mode) && pref.mode !== currentMode) {
				switchTo(pref.mode, { silent: true });
			}
			const nextFocus = coerceBool(pref.focus, focusOn);
			if (nextFocus !== focusOn) setToggle('focus', nextFocus, { silent: true });
			const nextTypewriter = coerceBool(pref.typewriter, typewriterOn);
			if (nextTypewriter !== typewriterOn) setToggle('typewriter', nextTypewriter, { silent: true });
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

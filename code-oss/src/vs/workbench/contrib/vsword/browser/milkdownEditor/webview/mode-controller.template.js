// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown mode controller (T-3.3.2).
 *
 *  Owns the three-mode state machine:
 *    - realtime  → Milkdown WYSIWYG editing (default)
 *    - reading   → non-editable, focus mode active, layout unchanged (Q2=a+c)
 *    - source    → raw markdown textarea, byte-identical round-trip
 *
 *  Contract with the host:
 *    - On boot: post {preferenceRequest} → receive {preferenceResponse, mode}
 *    - On user switch: post {preferenceUpdate, mode}   (fire-and-forget global preference)
 *
 *  Multi-window independence: mode state is per-webview memory. Two windows on the same file
 *  can hold different modes; only the "last window that switched" bumps the global default
 *  for future opens. Content synchronization goes through WorkingCopy and is orthogonal.
 *
 *  Ctrl+/ cycles: realtime → reading → source → realtime.
 *--------------------------------------------------------------------------------------------*/

export const MODES = ['realtime', 'reading', 'source'];
export const DEFAULT_MODE = 'realtime';

function isValidMode(m) {
	return MODES.indexOf(m) !== -1;
}

export function createModeController(opts) {
	const {
		shell,          // .vsword-md-shell root element
		buttons,        // NodeList of .vsword-md-mode-btn
		sourceTextarea, // #milkdown-source
		getMarkdown,    // () => string (serialize from editor)
		setMarkdown,    // (md, reason) => void (recreate editor with new md)
		vscode,         // acquireVsCodeApi() result or undefined
		onModeChange,   // optional (mode, prevMode) => void hook (focus-mode uses it)
	} = opts;

	let currentMode = DEFAULT_MODE;
	let switching = false;
	// Guard against typing-driven autosaves for the very first paint after mode entry.
	let sourceInitialized = false;

	function applyDom(mode) {
		if (shell) shell.setAttribute('data-mode', mode);
		buttons.forEach(btn => {
			const isActive = btn.getAttribute('data-mode') === mode;
			btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
		});
	}

	function switchTo(nextMode, opts2) {
		opts2 = opts2 || {};
		if (!isValidMode(nextMode) || nextMode === currentMode || switching) return;
		switching = true;
		const prevMode = currentMode;
		try {
			// realtime → source : flush current editor markdown into textarea
			if (nextMode === 'source') {
				const md = getMarkdown();
				sourceTextarea.value = md;
				sourceInitialized = true;
			}
			// source → any : pull textarea back into editor if content changed
			if (prevMode === 'source' && sourceInitialized) {
				const md = sourceTextarea.value;
				setMarkdown(md, 'source-exit');
			}
			currentMode = nextMode;
			applyDom(nextMode);
			if (typeof onModeChange === 'function') onModeChange(nextMode, prevMode);
			// Persist unless this switch came from the initial preferenceResponse.
			if (!opts2.silent && vscode) {
				vscode.postMessage({ type: 'preferenceUpdate', mode: nextMode });
			}
			// Give focus to the appropriate surface.
			if (nextMode === 'source') {
				requestAnimationFrame(() => sourceTextarea.focus());
			} else if (nextMode === 'realtime') {
				requestAnimationFrame(() => {
					const pm = shell.querySelector('.ProseMirror');
					pm?.focus?.();
				});
			}
		} finally {
			switching = false;
		}
	}

	function cycle() {
		const idx = MODES.indexOf(currentMode);
		switchTo(MODES[(idx + 1) % MODES.length]);
	}

	// Wire button clicks.
	buttons.forEach(btn => {
		btn.addEventListener('click', () => {
			const m = btn.getAttribute('data-mode');
			if (isValidMode(m)) switchTo(m);
		});
	});

	// Keyboard: Ctrl+/ (or Cmd+/) cycles modes.
	window.addEventListener('keydown', event => {
		if ((event.ctrlKey || event.metaKey) && event.key === '/' && !event.shiftKey && !event.altKey) {
			event.preventDefault();
			event.stopPropagation();
			cycle();
		}
	}, true);

	return {
		getMode: () => currentMode,
		switchTo,
		cycle,
		applyPersistedMode(mode) {
			// Called after preferenceResponse arrives. Skip persistence write.
			if (isValidMode(mode) && mode !== currentMode) {
				switchTo(mode, { silent: true });
			}
		},
		getSourceValue: () => sourceTextarea.value,
		isSourceMode: () => currentMode === 'source',
		isReadingMode: () => currentMode === 'reading',
	};
}

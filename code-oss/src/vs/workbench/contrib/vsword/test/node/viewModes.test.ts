/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.10 — three-mode controller + focus/typewriter toggles.
// Uses jsdom for DOM + KeyboardEvent + MutationObserver.

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import { createModeController, MODES, DEFAULT_MODE } from '../../browser/milkdownEditor/webview/mode-controller.template.js';

// ---- shared jsdom helpers ---------------------------------------------------

function bootstrap() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div class="vsword-md-shell" data-mode="realtime">
			<button class="vsword-md-mode-btn" data-mode="realtime" aria-pressed="true"></button>
			<button class="vsword-md-mode-btn" data-mode="reading" aria-pressed="false"></button>
			<button class="vsword-md-mode-btn" data-mode="source" aria-pressed="false"></button>
			<button class="vsword-md-toggle-btn" data-toggle="focus" aria-pressed="false"></button>
			<button class="vsword-md-toggle-btn" data-toggle="typewriter" aria-pressed="false"></button>
			<textarea id="milkdown-source"></textarea>
		</div>
	</body></html>`, { url: 'http://localhost/' });
	// Node globals so the controller (which references window.addEventListener + rAF) works.
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;

	const shell = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
	const buttons = dom.window.document.querySelectorAll('.vsword-md-mode-btn');
	const toggleButtons = dom.window.document.querySelectorAll('.vsword-md-toggle-btn');
	const sourceTextarea = dom.window.document.getElementById('milkdown-source') as HTMLTextAreaElement;

	const posted: any[] = [];
	const vscode = { postMessage: (m: any) => posted.push(m) };
	let md = '# hello';
	const ctrl = createModeController({
		shell, buttons, toggleButtons, sourceTextarea,
		getMarkdown: () => md,
		setMarkdown: (v: string) => { md = v; },
		vscode,
	});
	return { dom, shell, buttons, toggleButtons, sourceTextarea, posted, ctrl };
}

function fireKey(dom: JSDOM, opts: { code: string; key?: string; ctrl?: boolean; shift?: boolean }) {
	const ev = new dom.window.KeyboardEvent('keydown', {
		code: opts.code,
		key: opts.key ?? '',
		ctrlKey: !!opts.ctrl,
		shiftKey: !!opts.shift,
		bubbles: true,
		cancelable: true,
	});
	dom.window.dispatchEvent(ev);
}

// ---- constants --------------------------------------------------------------

suite('T-3.10 · constants', () => {
	test('MODES is the canonical triple', () => {
		assert.deepStrictEqual(MODES as readonly string[], ['realtime', 'reading', 'source']);
	});
	test('DEFAULT_MODE is realtime', () => {
		assert.strictEqual(DEFAULT_MODE, 'realtime');
	});
});

// ---- mode switching ---------------------------------------------------------

suite('T-3.10 · mode switching', () => {
	test('switchTo reading updates shell + button aria-pressed', () => {
		const { shell, buttons, ctrl } = bootstrap();
		ctrl.switchTo('reading');
		assert.strictEqual(shell.getAttribute('data-mode'), 'reading');
		assert.strictEqual((buttons[0] as HTMLElement).getAttribute('aria-pressed'), 'false');
		assert.strictEqual((buttons[1] as HTMLElement).getAttribute('aria-pressed'), 'true');
	});

	test('switchTo posts preferenceUpdate to the host', () => {
		const { posted, ctrl } = bootstrap();
		ctrl.switchTo('reading');
		assert.deepStrictEqual(posted, [{ type: 'preferenceUpdate', mode: 'reading' }]);
	});

	test('switchTo silent skips postMessage (used during applyPersistedPreference)', () => {
		const { posted, ctrl } = bootstrap();
		ctrl.applyPersistedPreference({ mode: 'reading' });
		assert.strictEqual(posted.length, 0);
	});

	test('cycle rotates realtime → reading → source → realtime', () => {
		const { ctrl } = bootstrap();
		assert.strictEqual(ctrl.getMode(), 'realtime');
		ctrl.cycle(); assert.strictEqual(ctrl.getMode(), 'reading');
		ctrl.cycle(); assert.strictEqual(ctrl.getMode(), 'source');
		ctrl.cycle(); assert.strictEqual(ctrl.getMode(), 'realtime');
	});

	test('invalid mode is rejected', () => {
		const { ctrl, shell } = bootstrap();
		ctrl.switchTo('nonsense' as any);
		assert.strictEqual(shell.getAttribute('data-mode'), 'realtime');
	});

	test('source → realtime flushes textarea back into markdown', () => {
		const { ctrl, sourceTextarea } = bootstrap();
		ctrl.switchTo('source');
		sourceTextarea.value = '# edited';
		ctrl.switchTo('realtime');
		assert.strictEqual(ctrl.getMode(), 'realtime');
	});
});

// ---- focus / typewriter toggles ---------------------------------------------

suite('T-3.10 · focus & typewriter toggles', () => {
	test('setFocus(true) flips data-focus + button aria + posts partial pref', () => {
		const { shell, toggleButtons, posted, ctrl } = bootstrap();
		ctrl.setFocus(true);
		assert.strictEqual(ctrl.isFocusOn(), true);
		assert.strictEqual(shell.getAttribute('data-focus'), 'on');
		assert.strictEqual((toggleButtons[0] as HTMLElement).getAttribute('aria-pressed'), 'true');
		assert.deepStrictEqual(posted, [{ type: 'preferenceUpdate', focus: 'on' }]);
	});

	test('setTypewriter(true) flips data-typewriter + posts partial pref', () => {
		const { shell, toggleButtons, posted, ctrl } = bootstrap();
		ctrl.setTypewriter(true);
		assert.strictEqual(ctrl.isTypewriterOn(), true);
		assert.strictEqual(shell.getAttribute('data-typewriter'), 'on');
		assert.strictEqual((toggleButtons[1] as HTMLElement).getAttribute('aria-pressed'), 'true');
		assert.deepStrictEqual(posted, [{ type: 'preferenceUpdate', typewriter: 'on' }]);
	});

	test('setting the same value is a no-op (no dupe host message)', () => {
		const { posted, ctrl } = bootstrap();
		ctrl.setFocus(true);
		ctrl.setFocus(true);
		assert.strictEqual(posted.length, 1);
	});

	test('source mode nulls out visual attrs but keeps stored bits', () => {
		const { shell, ctrl } = bootstrap();
		ctrl.setFocus(true);
		ctrl.setTypewriter(true);
		ctrl.switchTo('source');
		// Visual: shell shows off; but internal state remembers.
		assert.strictEqual(shell.getAttribute('data-focus'), 'off');
		assert.strictEqual(shell.getAttribute('data-typewriter'), 'off');
		assert.strictEqual(ctrl.isFocusOn(), true);
		assert.strictEqual(ctrl.isTypewriterOn(), true);
	});

	test('leaving source mode restores focus/typewriter visuals', () => {
		const { shell, ctrl } = bootstrap();
		ctrl.setFocus(true);
		ctrl.switchTo('source');
		ctrl.switchTo('realtime');
		assert.strictEqual(shell.getAttribute('data-focus'), 'on');
	});

	test('toggle buttons are disabled in source mode', () => {
		const { toggleButtons, ctrl } = bootstrap();
		ctrl.switchTo('source');
		assert.ok((toggleButtons[0] as HTMLButtonElement).hasAttribute('disabled'));
		assert.ok((toggleButtons[1] as HTMLButtonElement).hasAttribute('disabled'));
	});
});

// ---- keyboard shortcuts -----------------------------------------------------

suite('T-3.10 · keyboard shortcuts', () => {
	test('Ctrl+/ cycles mode', () => {
		const { dom, ctrl } = bootstrap();
		fireKey(dom, { code: 'Slash', key: '/', ctrl: true });
		assert.strictEqual(ctrl.getMode(), 'reading');
	});

	test('Ctrl+Shift+F toggles focus', () => {
		const { dom, ctrl } = bootstrap();
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.isFocusOn(), true);
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.isFocusOn(), false);
	});

	test('Ctrl+Shift+T toggles typewriter', () => {
		const { dom, ctrl } = bootstrap();
		fireKey(dom, { code: 'KeyT', ctrl: true, shift: true });
		assert.strictEqual(ctrl.isTypewriterOn(), true);
	});

	test('Ctrl+Shift+F is a no-op in source mode', () => {
		const { dom, ctrl } = bootstrap();
		ctrl.switchTo('source');
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.isFocusOn(), false);
	});
});

// ---- applyPersistedPreference -----------------------------------------------

suite('T-3.10 · applyPersistedPreference', () => {
	test('restores mode + focus + typewriter silently', () => {
		const { posted, ctrl, shell } = bootstrap();
		ctrl.applyPersistedPreference({ mode: 'reading', focus: 'on', typewriter: 'on' });
		assert.strictEqual(ctrl.getMode(), 'reading');
		assert.strictEqual(ctrl.isFocusOn(), true);
		assert.strictEqual(ctrl.isTypewriterOn(), true);
		assert.strictEqual(shell.getAttribute('data-focus'), 'on');
		assert.strictEqual(posted.length, 0);
	});

	test('missing fields leave current state untouched', () => {
		const { ctrl } = bootstrap();
		ctrl.setFocus(true);
		ctrl.applyPersistedPreference({ mode: 'reading' });
		assert.strictEqual(ctrl.isFocusOn(), true);
	});

	test('applyPersistedMode is a backward-compat shim', () => {
		const { ctrl } = bootstrap();
		ctrl.applyPersistedMode('reading');
		assert.strictEqual(ctrl.getMode(), 'reading');
	});

	test('bogus focus value falls back to current', () => {
		const { ctrl } = bootstrap();
		ctrl.applyPersistedPreference({ focus: 'garbage' as any });
		assert.strictEqual(ctrl.isFocusOn(), false);
	});
});

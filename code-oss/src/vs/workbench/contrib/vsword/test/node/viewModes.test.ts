/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.10 + T-3.12.3.a — three-mode controller + substyle radio (normal | focus | typewriter).
// Uses jsdom for DOM + KeyboardEvent + MutationObserver.
//
// PRD: docs/plans/003-phase3-mode-orthogonality.md
// v2 拍板: focus & typewriter 合并为 substyle radio (三选一 · 互斥). 阅读模式下视觉强置 normal
// (stored 保留); 源码模式下 substyle 直通 shell (CSS/plugins 无法生效 → "选中了但看不到").

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
	createModeController,
	MODES,
	DEFAULT_MODE,
	SUBSTYLES,
	DEFAULT_SUBSTYLE,
	VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY,
} from '../../browser/milkdownEditor/webview/mode-controller.template.js';

// ---- shared jsdom helpers ---------------------------------------------------

function bootstrap(opts?: { localStorage?: Record<string, string> }) {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div class="vsword-md-shell" data-mode="realtime" data-substyle="normal">
			<button class="vsword-md-mode-btn" data-mode="realtime" aria-pressed="true"></button>
			<button class="vsword-md-mode-btn" data-mode="reading" aria-pressed="false"></button>
			<button class="vsword-md-mode-btn" data-mode="source" aria-pressed="false"></button>
			<button class="vsword-md-toggle-btn" data-toggle="focus" aria-pressed="false"></button>
			<button class="vsword-md-toggle-btn" data-toggle="typewriter" aria-pressed="false"></button>
			<textarea id="milkdown-source"></textarea>
		</div>
	</body></html>`, { url: 'http://localhost/' });
	// Seed localStorage BEFORE we install the window global so the controller's boot-time
	// read hits the correct state.
	if (opts?.localStorage) {
		for (const [k, v] of Object.entries(opts.localStorage)) {
			dom.window.localStorage.setItem(k, v);
		}
	}
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
	test('SUBSTYLES is the canonical triple (T-3.12.3.a)', () => {
		assert.deepStrictEqual(SUBSTYLES as readonly string[], ['normal', 'focus', 'typewriter']);
	});
	test('DEFAULT_SUBSTYLE is normal', () => {
		assert.strictEqual(DEFAULT_SUBSTYLE, 'normal');
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

// ---- substyle radio (T-3.12.3.a) --------------------------------------------

suite('T-3.12.3.a · substyle radio', () => {
	test('setSubstyle("focus") flips data-substyle + toggle-btn aria + posts partial pref', () => {
		const { shell, toggleButtons, posted, ctrl } = bootstrap();
		ctrl.setSubstyle('focus');
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
		assert.strictEqual(shell.getAttribute('data-substyle'), 'focus');
		assert.strictEqual((toggleButtons[0] as HTMLElement).getAttribute('aria-pressed'), 'true');
		assert.strictEqual((toggleButtons[1] as HTMLElement).getAttribute('aria-pressed'), 'false');
		// Backward-compat host pref bag: focus='on', typewriter='off' (derived from substyle).
		assert.deepStrictEqual(posted, [{ type: 'preferenceUpdate', focus: 'on', typewriter: 'off' }]);
	});

	test('setSubstyle("typewriter") after focus flips exclusively (radio互斥)', () => {
		const { shell, toggleButtons, ctrl } = bootstrap();
		ctrl.setSubstyle('focus');
		ctrl.setSubstyle('typewriter');
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		assert.strictEqual(shell.getAttribute('data-substyle'), 'typewriter');
		// focus btn: off (radio互斥); typewriter btn: on.
		assert.strictEqual((toggleButtons[0] as HTMLElement).getAttribute('aria-pressed'), 'false');
		assert.strictEqual((toggleButtons[1] as HTMLElement).getAttribute('aria-pressed'), 'true');
	});

	test('setSubstyle same value is a no-op (no dupe host message)', () => {
		const { posted, ctrl } = bootstrap();
		ctrl.setSubstyle('focus');
		ctrl.setSubstyle('focus');
		assert.strictEqual(posted.length, 1);
	});

	test('setSubstyle persists to webview localStorage', () => {
		const { dom, ctrl } = bootstrap();
		ctrl.setSubstyle('typewriter');
		assert.strictEqual(dom.window.localStorage.getItem(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY), 'typewriter');
	});

	test('reading mode: shell forces data-substyle=normal but stored substyle is preserved', () => {
		const { shell, ctrl } = bootstrap();
		ctrl.setSubstyle('focus');
		ctrl.switchTo('reading');
		// Visual: shell shows normal; but internal state remembers.
		assert.strictEqual(shell.getAttribute('data-substyle'), 'normal');
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
	});

	test('leaving reading mode restores visual substyle from stored', () => {
		const { shell, ctrl } = bootstrap();
		ctrl.setSubstyle('focus');
		ctrl.switchTo('reading');
		ctrl.switchTo('realtime');
		assert.strictEqual(shell.getAttribute('data-substyle'), 'focus');
	});

	test('source mode: substyle 透传到 shell (选中但视觉不生效)', () => {
		// PRD §4.4: 源码下 substyle 保留在 shell 属性 (CSS 层不作用于 textarea，视觉 no-op).
		const { shell, ctrl } = bootstrap();
		ctrl.setSubstyle('focus');
		ctrl.switchTo('source');
		assert.strictEqual(shell.getAttribute('data-substyle'), 'focus');
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
	});
});

// ---- legacy setFocus/setTypewriter shim (兼容 entry.template.js + viewModeMatrix.test.ts) --

suite('T-3.12.3.a · legacy focus/typewriter shim', () => {
	test('setFocus(true) === setSubstyle("focus")', () => {
		const { shell, ctrl } = bootstrap();
		ctrl.setFocus(true);
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
		assert.strictEqual(shell.getAttribute('data-substyle'), 'focus');
		assert.strictEqual(ctrl.isFocusOn(), true);
	});

	test('setTypewriter(true) === setSubstyle("typewriter")', () => {
		const { shell, ctrl } = bootstrap();
		ctrl.setTypewriter(true);
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		assert.strictEqual(shell.getAttribute('data-substyle'), 'typewriter');
		assert.strictEqual(ctrl.isTypewriterOn(), true);
	});

	test('setFocus(true) after setTypewriter(true) 覆盖 (radio互斥 · v1 叠加语义已废)', () => {
		const { ctrl } = bootstrap();
		ctrl.setTypewriter(true);
		ctrl.setFocus(true);
		// v2: radio互斥 → focus wins, typewriter 自动关.
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
		assert.strictEqual(ctrl.isFocusOn(), true);
		assert.strictEqual(ctrl.isTypewriterOn(), false);
	});

	test('setFocus(false) 只在当前是 focus 时归零到 normal', () => {
		const { ctrl } = bootstrap();
		ctrl.setSubstyle('typewriter');
		ctrl.setFocus(false); // 当前非 focus → no-op
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		ctrl.setSubstyle('focus');
		ctrl.setFocus(false); // 当前是 focus → 归零
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});

	test('source mode: legacy toggle buttons remain disabled', () => {
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

	test('Ctrl+Shift+F 在 realtime 下切换 substyle focus ⇄ normal', () => {
		const { dom, ctrl } = bootstrap();
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});

	test('Ctrl+Shift+T 在 realtime 下切换 substyle typewriter ⇄ normal', () => {
		const { dom, ctrl } = bootstrap();
		fireKey(dom, { code: 'KeyT', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		fireKey(dom, { code: 'KeyT', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});

	test('Ctrl+Shift+F 在 focus 下切到 focus + Ctrl+Shift+T 切到 typewriter (radio互斥)', () => {
		const { dom, ctrl } = bootstrap();
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
		fireKey(dom, { code: 'KeyT', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
	});

	test('Ctrl+Shift+F 在 source 下 no-op', () => {
		const { dom, ctrl } = bootstrap();
		ctrl.switchTo('source');
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});

	test('Ctrl+Shift+F 在 reading 下 no-op (PRD §5.2)', () => {
		const { dom, ctrl } = bootstrap();
		ctrl.switchTo('reading');
		fireKey(dom, { code: 'KeyF', ctrl: true, shift: true });
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});
});

// ---- applyPersistedPreference + memento migration ---------------------------

suite('T-3.10 · applyPersistedPreference', () => {
	test('restores mode silently (legacy 单 mode payload)', () => {
		const { posted, ctrl, shell } = bootstrap();
		ctrl.applyPersistedPreference({ mode: 'reading' });
		assert.strictEqual(ctrl.getMode(), 'reading');
		assert.strictEqual(shell.getAttribute('data-mode'), 'reading');
		assert.strictEqual(posted.length, 0);
	});

	test('applyPersistedMode is a backward-compat shim', () => {
		const { ctrl } = bootstrap();
		ctrl.applyPersistedMode('reading');
		assert.strictEqual(ctrl.getMode(), 'reading');
	});
});

// ---- T-3.12.3.a memento migration (PRD §6 AC-5, 风险 §11 覆盖 4 起始态) -----

suite('T-3.12.3.a · substyle memento migration', () => {
	test('起始态 1: localStorage 空 + legacy pref 空 → substyle=normal, 不写 localStorage', () => {
		const { dom, ctrl } = bootstrap();
		// Boot 已发生, localStorage 应仍为空.
		assert.strictEqual(dom.window.localStorage.getItem(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY), null);
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
		// applyPersistedPreference 传入没有 focus/typewriter 字段 → localStorage 仍不写.
		ctrl.applyPersistedPreference({ mode: 'realtime' });
		assert.strictEqual(dom.window.localStorage.getItem(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY), null);
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});

	test('起始态 2: localStorage 空 + legacy focus=on → 迁移到 substyle=focus + 写 localStorage', () => {
		const { dom, ctrl } = bootstrap();
		ctrl.applyPersistedPreference({ focus: 'on', typewriter: 'off' });
		assert.strictEqual(ctrl.getSubstyle(), 'focus');
		assert.strictEqual(dom.window.localStorage.getItem(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY), 'focus');
	});

	test('起始态 3: localStorage 空 + legacy typewriter=on → 迁移到 substyle=typewriter', () => {
		const { dom, ctrl } = bootstrap();
		ctrl.applyPersistedPreference({ focus: 'off', typewriter: 'on' });
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		assert.strictEqual(dom.window.localStorage.getItem(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY), 'typewriter');
	});

	test('起始态 4: localStorage 空 + legacy focus=on + typewriter=on → typewriter 胜出', () => {
		// v1 C-4 (focus + typewriter 叠加) 在 v2 语义弱, 迁移时 typewriter 胜 (PRD §4.2).
		const { dom, ctrl } = bootstrap();
		ctrl.applyPersistedPreference({ focus: 'on', typewriter: 'on' });
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		assert.strictEqual(dom.window.localStorage.getItem(VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY), 'typewriter');
	});

	test('localStorage 已有 substyle → boot 直读, 忽略 legacy pref', () => {
		const { ctrl } = bootstrap({ localStorage: { [VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY]: 'typewriter' } });
		// Boot 已从 localStorage 读到 typewriter.
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
		// 老 host 又发来 legacy pref → 忽略, webview localStorage 胜出.
		ctrl.applyPersistedPreference({ focus: 'on', typewriter: 'off' });
		assert.strictEqual(ctrl.getSubstyle(), 'typewriter');
	});

	test('localStorage 里的非法值 → 忽略, 落回 default normal', () => {
		const { ctrl } = bootstrap({ localStorage: { [VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY]: 'garbage' } });
		assert.strictEqual(ctrl.getSubstyle(), 'normal');
	});

	test('迁移写 localStorage 但 silent (不发 host preferenceUpdate)', () => {
		const { posted, ctrl } = bootstrap();
		ctrl.applyPersistedPreference({ focus: 'on' });
		// applyPersistedPreference 全流程 silent → 无 host 消息.
		assert.strictEqual(posted.length, 0);
	});
});

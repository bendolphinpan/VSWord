/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.d · ModeSwitchComponent 单元测试（AC-8：UI 组件契约验证）
//
// 覆盖 DoD §6 ≥ 4 case（本文件落地 6 case）：
//   1. mount 后 component.el 指向 container 内的 #milkdown-mode-switch
//   2. mount 后点 realtime 按钮触发 onSetMode('realtime')；同理 reading/source
//   3. unmount 后点击不再触发回调，但 component.el 仍非 null
//   4. dispose 后触发 vsword-ui-component-disposed sentinel event，component.el === null
//   5. focus/typewriter 按钮点击分别触发 onToggleFocus / onToggleTypewriter
//   6. updateAriaPressed({mode:'reading'}) 后对应按钮 aria-pressed="true"，其余为 "false"
//
// 单测策略：jsdom + document.createElement 手搓一个含 #milkdown-mode-switch +
// #milkdown-toggle-group 骨架的 container，不加载真实 Milkdown。走 test/node/。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
// @ts-ignore — .template.js 是纯 JS 模块，运行期靠 esbuild bundle 解析。
import { createModeSwitchComponent } from '../../browser/milkdownEditor/webview/mode-switch.template.js';
// @ts-ignore
import { VSWORD_UI_COMPONENT_DISPOSED_EVENT } from '../../browser/milkdownEditor/webview/ui-component.template.js';

// ---------------------------------------------------------------------------
// jsdom 骨架
// ---------------------------------------------------------------------------

function bootstrap(): {
	dom: JSDOM;
	container: HTMLElement;
	calls: {
		mode: Array<'realtime' | 'reading' | 'source'>;
		focus: number;
		typewriter: number;
	};
	state: { mode: 'realtime' | 'reading' | 'source'; focus: boolean; typewriter: boolean };
} {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div class="vsword-md-shell" data-mode="realtime">
			<div id="milkdown-mode-switch" role="group" aria-label="Editor mode">
				<button class="vsword-md-mode-btn" data-mode="realtime" type="button" aria-pressed="true">实时渲染</button>
				<button class="vsword-md-mode-btn" data-mode="reading" type="button" aria-pressed="false">阅读模式</button>
				<button class="vsword-md-mode-btn" data-mode="source" type="button" aria-pressed="false">源码模式</button>
			</div>
			<div id="milkdown-toggle-group" role="group" aria-label="View toggles">
				<button class="vsword-md-toggle-btn" data-toggle="focus" type="button" aria-pressed="false">Focus</button>
				<button class="vsword-md-toggle-btn" data-toggle="typewriter" type="button" aria-pressed="false">Typewriter</button>
			</div>
		</div>
	</body></html>`, { url: 'http://localhost/' });
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore — createModeSwitchComponent 的 dispose 里用 CustomEvent。
	globalThis.CustomEvent = dom.window.CustomEvent;

	const container = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
	const calls: { mode: Array<'realtime' | 'reading' | 'source'>; focus: number; typewriter: number } = {
		mode: [],
		focus: 0,
		typewriter: 0,
	};
	const state = { mode: 'realtime' as 'realtime' | 'reading' | 'source', focus: false, typewriter: false };
	return { dom, container, calls, state };
}

function makeComponent(bootstrapResult: ReturnType<typeof bootstrap>) {
	const { calls, state } = bootstrapResult;
	return createModeSwitchComponent({
		onSetMode: (m: 'realtime' | 'reading' | 'source') => { calls.mode.push(m); },
		onToggleFocus: () => { calls.focus++; },
		onToggleTypewriter: () => { calls.typewriter++; },
		getState: () => ({ mode: state.mode, focus: state.focus, typewriter: state.typewriter }),
	});
}

function clickById(dom: JSDOM, root: HTMLElement, selector: string) {
	const btn = root.querySelector(selector) as HTMLElement | null;
	if (!btn) throw new Error(`missing button: ${selector}`);
	btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// suites
// ---------------------------------------------------------------------------

suite('T-3.7b.d · ModeSwitchComponent · IMilkdownUIComponent 契约', () => {

	test('1. mount 后 component.el 指向 container 内的 #milkdown-mode-switch', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		const expected = boot.container.querySelector('#milkdown-mode-switch');
		assert.ok(expected, '骨架里必须有 #milkdown-mode-switch');
		assert.strictEqual(component.el, expected, 'component.el 应指向骨架里的 #milkdown-mode-switch');
	});

	test('2. mount 后点三个 mode 按钮分别触发 onSetMode', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="realtime"]');
		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="reading"]');
		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="source"]');

		assert.deepStrictEqual(boot.calls.mode, ['realtime', 'reading', 'source'], '三个按钮点击顺序回调应齐全');
	});

	test('3. unmount 后点击不再触发回调，但 component.el 仍非 null（DOM 保留）', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);
		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="reading"]');
		assert.strictEqual(boot.calls.mode.length, 1, 'mount 期间点击应记入');

		component.unmount();
		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="source"]');
		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="realtime"]');

		assert.strictEqual(boot.calls.mode.length, 1, 'unmount 后点击不应再触发回调');
		assert.notStrictEqual(component.el, null, 'unmount 后 component.el 仍应非 null（DOM 复用）');
	});

	test('4. dispose 触发 vsword-ui-component-disposed sentinel event，且 component.el === null', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		const events: Array<{ type: string; detail: unknown }> = [];
		boot.container.addEventListener(VSWORD_UI_COMPONENT_DISPOSED_EVENT, (ev: Event) => {
			events.push({ type: ev.type, detail: (ev as CustomEvent).detail });
		});

		component.dispose();

		assert.strictEqual(events.length, 1, 'sentinel event 应派发一次');
		assert.strictEqual(events[0].type, VSWORD_UI_COMPONENT_DISPOSED_EVENT);
		assert.strictEqual(component.el, null, 'dispose 后 component.el 必须为 null');

		// dispose 后再点击也不应触发回调（幂等 unmount）
		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="reading"]');
		assert.strictEqual(boot.calls.mode.length, 0, 'dispose 后点击不应触发回调');
	});

	test('5. focus / typewriter 按钮点击分别触发 onToggleFocus / onToggleTypewriter', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		clickById(boot.dom, boot.container, '.vsword-md-toggle-btn[data-toggle="focus"]');
		clickById(boot.dom, boot.container, '.vsword-md-toggle-btn[data-toggle="focus"]');
		clickById(boot.dom, boot.container, '.vsword-md-toggle-btn[data-toggle="typewriter"]');

		assert.strictEqual(boot.calls.focus, 2, 'focus 点击两次');
		assert.strictEqual(boot.calls.typewriter, 1, 'typewriter 点击一次');
	});

	test('6. updateAriaPressed({mode:"reading"}) 后 reading 按钮 aria-pressed="true"，其余 "false"', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		component.updateAriaPressed({ mode: 'reading', focus: true, typewriter: false });

		const btnRealtime = boot.container.querySelector('.vsword-md-mode-btn[data-mode="realtime"]') as HTMLElement;
		const btnReading = boot.container.querySelector('.vsword-md-mode-btn[data-mode="reading"]') as HTMLElement;
		const btnSource = boot.container.querySelector('.vsword-md-mode-btn[data-mode="source"]') as HTMLElement;
		const btnFocus = boot.container.querySelector('.vsword-md-toggle-btn[data-toggle="focus"]') as HTMLElement;
		const btnTypewriter = boot.container.querySelector('.vsword-md-toggle-btn[data-toggle="typewriter"]') as HTMLElement;

		assert.strictEqual(btnRealtime.getAttribute('aria-pressed'), 'false', 'realtime 按钮必须 false');
		assert.strictEqual(btnReading.getAttribute('aria-pressed'), 'true', 'reading 按钮必须 true');
		assert.strictEqual(btnSource.getAttribute('aria-pressed'), 'false', 'source 按钮必须 false');
		assert.strictEqual(btnFocus.getAttribute('aria-pressed'), 'true', 'focus toggle 反映 state.focus=true');
		assert.strictEqual(btnTypewriter.getAttribute('aria-pressed'), 'false', 'typewriter toggle 反映 state.typewriter=false');
	});

	test('7. mount(container) 幂等：重复 mount 事件不叠加', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);
		component.mount(boot.container); // 幂等

		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="reading"]');
		assert.strictEqual(boot.calls.mode.length, 1, '重复 mount 后点击应只回调一次（旧监听已解绑）');
	});
});

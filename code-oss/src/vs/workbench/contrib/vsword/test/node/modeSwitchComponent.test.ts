/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.d · ModeSwitchComponent 单元测试（AC-8：UI 组件契约验证）
// T-3.12.3.b 更新：二级 focus/typewriter 双 toggle → substyle radiogroup（三选一互斥）
//
// 覆盖 case：
//   1. mount 后 component.el 指向 container 内的 #milkdown-mode-switch
//   2. mount 后点三个 mode 按钮分别触发 onSetMode
//   3. unmount 后点击不再触发回调，但 component.el 仍非 null
//   4. dispose 触发 vsword-ui-component-disposed sentinel event，component.el === null
//   5. substyle radiogroup 三按钮点击分别触发 onSetSubstyle('normal'|'focus'|'typewriter')
//   6. updateAriaPressed({mode:'reading', substyle:'focus'}) 后正确按钮 aria-pressed=true
//   7. mount 幂等：重复 mount 事件不叠加
//   8. applyModeVisibility('reading') / ('realtime') 是 no-op (T-3.13.2):
//      substyle-group 在 DOM 内保持不动, 三档视觉由 CSS + focus-mode plugin 分别渲染.
//
// 单测策略：jsdom + document.createElement 手搓一个含 #milkdown-mode-switch +
// #milkdown-substyle-group 骨架的 container，不加载真实 Milkdown。走 test/node/。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
// @ts-ignore — .template.js 是纯 JS 模块，运行期靠 esbuild bundle 解析。
import { createModeSwitchComponent } from '../../browser/milkdownEditor/webview/mode-switch.template.js';
// @ts-ignore
import { VSWORD_UI_COMPONENT_DISPOSED_EVENT } from '../../browser/milkdownEditor/webview/ui-component.template.js';

// ---------------------------------------------------------------------------
// jsdom 骨架
// ---------------------------------------------------------------------------

type ViewMode = 'realtime' | 'reading' | 'source';
type Substyle = 'normal' | 'focus' | 'typewriter';

function bootstrap(): {
	dom: JSDOM;
	container: HTMLElement;
	calls: {
		mode: ViewMode[];
		substyle: Substyle[];
	};
	state: { mode: ViewMode; substyle: Substyle };
} {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div class="vsword-md-shell" data-mode="realtime" data-substyle="normal">
			<header class="vsword-md-toolbar">
				<div id="milkdown-mode-switch" role="radiogroup" aria-label="预览模式">
					<button class="vsword-md-mode-btn" data-mode="realtime" role="radio" aria-pressed="true" aria-checked="true">实时渲染</button>
					<button class="vsword-md-mode-btn" data-mode="reading" role="radio" aria-pressed="false" aria-checked="false">阅读模式</button>
					<button class="vsword-md-mode-btn" data-mode="source" role="radio" aria-pressed="false" aria-checked="false">源码模式</button>
				</div>
				<div id="milkdown-substyle-group" role="radiogroup" aria-label="专注策略">
					<button class="vsword-md-substyle-btn" data-substyle="normal" role="radio" aria-pressed="true" aria-checked="true">普通</button>
					<button class="vsword-md-substyle-btn" data-substyle="focus" role="radio" aria-pressed="false" aria-checked="false">Focus</button>
					<button class="vsword-md-substyle-btn" data-substyle="typewriter" role="radio" aria-pressed="false" aria-checked="false">Typewriter</button>
				</div>
				<span class="sentinel-after-substyle">锚点</span>
			</header>
		</div>
	</body></html>`, { url: 'http://localhost/' });
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore — createModeSwitchComponent 的 dispose 里用 CustomEvent。
	globalThis.CustomEvent = dom.window.CustomEvent;

	const container = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
	const calls: { mode: ViewMode[]; substyle: Substyle[] } = { mode: [], substyle: [] };
	const state = { mode: 'realtime' as ViewMode, substyle: 'normal' as Substyle };
	return { dom, container, calls, state };
}

function makeComponent(bootstrapResult: ReturnType<typeof bootstrap>) {
	const { calls, state } = bootstrapResult;
	return createModeSwitchComponent({
		onSetMode: (m: ViewMode) => { calls.mode.push(m); },
		onSetSubstyle: (s: Substyle) => { calls.substyle.push(s); },
		getState: () => ({ mode: state.mode, substyle: state.substyle }),
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

suite('T-3.7b.d + T-3.12.3.b · ModeSwitchComponent · IMilkdownUIComponent 契约', () => {

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

	test('5. substyle radio 三按钮点击分别触发 onSetSubstyle', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		clickById(boot.dom, boot.container, '.vsword-md-substyle-btn[data-substyle="focus"]');
		clickById(boot.dom, boot.container, '.vsword-md-substyle-btn[data-substyle="typewriter"]');
		clickById(boot.dom, boot.container, '.vsword-md-substyle-btn[data-substyle="normal"]');

		assert.deepStrictEqual(boot.calls.substyle, ['focus', 'typewriter', 'normal'], 'substyle 点击顺序回调应齐全');
	});

	test('6. updateAriaPressed({mode:"reading", substyle:"focus"}) 正确同步双 radiogroup', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		component.updateAriaPressed({ mode: 'reading', substyle: 'focus' });

		const btnRealtime = boot.container.querySelector('.vsword-md-mode-btn[data-mode="realtime"]') as HTMLElement;
		const btnReading = boot.container.querySelector('.vsword-md-mode-btn[data-mode="reading"]') as HTMLElement;
		const btnSource = boot.container.querySelector('.vsword-md-mode-btn[data-mode="source"]') as HTMLElement;
		const btnNormal = boot.container.querySelector('.vsword-md-substyle-btn[data-substyle="normal"]') as HTMLElement;
		const btnFocus = boot.container.querySelector('.vsword-md-substyle-btn[data-substyle="focus"]') as HTMLElement;
		const btnTypewriter = boot.container.querySelector('.vsword-md-substyle-btn[data-substyle="typewriter"]') as HTMLElement;

		assert.strictEqual(btnRealtime.getAttribute('aria-pressed'), 'false');
		assert.strictEqual(btnReading.getAttribute('aria-pressed'), 'true');
		assert.strictEqual(btnSource.getAttribute('aria-pressed'), 'false');
		assert.strictEqual(btnReading.getAttribute('aria-checked'), 'true', 'role=radio 时 aria-checked 也需同步');

		assert.strictEqual(btnNormal.getAttribute('aria-pressed'), 'false');
		assert.strictEqual(btnFocus.getAttribute('aria-pressed'), 'true', '三选一互斥：只有 focus 按下');
		assert.strictEqual(btnTypewriter.getAttribute('aria-pressed'), 'false');
	});

	test('7. mount(container) 幂等：重复 mount 事件不叠加', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);
		component.mount(boot.container); // 幂等

		clickById(boot.dom, boot.container, '.vsword-md-mode-btn[data-mode="reading"]');
		assert.strictEqual(boot.calls.mode.length, 1, '重复 mount 后点击应只回调一次（旧监听已解绑）');
	});

	test('8. applyModeVisibility(\'reading\') / (\'realtime\') 是 no-op (T-3.13.2): substyle-group 保持在 DOM 内', () => {
		const boot = bootstrap();
		const component = makeComponent(boot);
		component.mount(boot.container);

		// 初始：substyle-group 在 DOM 里，紧邻 sentinel-after-substyle 之前。
		const initialParent = boot.container.querySelector('.vsword-md-toolbar') as HTMLElement;
		const substyleGroup = boot.container.querySelector('#milkdown-substyle-group') as HTMLElement;
		const sentinel = boot.container.querySelector('.sentinel-after-substyle') as HTMLElement;
		assert.ok(substyleGroup, '初始骨架应有 #milkdown-substyle-group');
		assert.strictEqual(substyleGroup.parentNode, initialParent, '初始 parent 应为 toolbar');
		assert.strictEqual(substyleGroup.nextElementSibling, sentinel, '初始 nextElementSibling 应为 sentinel');

		// T-3.13.2: 切 reading 不再 detach.
		boot.state.mode = 'reading';
		component.applyModeVisibility('reading');
		const stillThere = boot.container.querySelector('#milkdown-substyle-group') as HTMLElement;
		assert.strictEqual(stillThere, substyleGroup, 'reading 下 substyle-group 应保留在 DOM 内 (T-3.13.2)');
		assert.strictEqual(stillThere.parentNode, initialParent, 'reading 下 parent 不变');
		assert.strictEqual(stillThere.nextElementSibling, sentinel, 'reading 下 nextElementSibling 不变');

		// 切回 realtime 仍是 no-op, DOM 结构不变.
		boot.state.mode = 'realtime';
		component.applyModeVisibility('realtime');
		const afterBack = boot.container.querySelector('#milkdown-substyle-group') as HTMLElement;
		assert.strictEqual(afterBack, substyleGroup, 'realtime 回切 substyle-group 引用不变');
		assert.strictEqual(afterBack.parentNode, initialParent, 'parent 恢复不变');
		assert.strictEqual(afterBack.nextElementSibling, sentinel, 'nextElementSibling 恢复不变');

		// 幂等：realtime 再调 applyModeVisibility('realtime') 不重复插入.
		component.applyModeVisibility('realtime');
		const nodes = boot.container.querySelectorAll('#milkdown-substyle-group');
		assert.strictEqual(nodes.length, 1, '重复调用应幂等, DOM 里始终只有一份 substyle-group');
	});
});

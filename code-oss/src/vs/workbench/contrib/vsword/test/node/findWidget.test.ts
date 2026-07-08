/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.b · FindWidget UI 组件 + keymap plugin 单元测试。
//
// 覆盖 DoD §3 ≥ 8 case（本文件落地 13 case），验证：
//   1. createFindWidget 返回的 IFindWidgetComponent 契约完整（9 个方法）
//   2. mount(container) 后 el 挂到 container 内且 DOM 结构齐全
//   3. unmount 后 DOM 脱离 · dispose 派发 vsword-ui-component-disposed
//   4. open() 移除 .vsword-hidden · close() 重新加回 · openReplace 露 replace 行
//   5. input 事件更新 query · 触发 view.dispatch({recompute:true})
//   6. 三 checkbox click → toggle .vsword-find-opt-on class + dispatch
//   7. 计数显示：无 query → "0 of 0" · matches=0 → "No results" · idx/total → "N of M"
//   8. useRegex 非法 → "Invalid regex" + input 上 .vsword-find-error
//   9. openReplace 在 reading mode 下把 replace 按钮 disabled
//  10. createFindKeymap: Ctrl+F 触发 widget.open · Ctrl+H 触发 openReplace · Escape 关
//  11. keymap 在 widget 关闭时 Escape 不拦截（返回 false）
//  12. Enter / Shift+Enter 在 input 内触发 next / prev（widget input 责任）
//  13. setQuery + getState 反映 index/total 语义
//
// 单测策略：jsdom + document.createElement 骨架 · 用 fake PM view（mock doc.descendants）
// 让 computeMatches 拿到真结果。走 test/node/。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
// @ts-ignore — .template.js 是纯 JS 模块，esbuild 会在 bundle 时把 ./xxx.mjs 重写。
import { createFindWidget } from '../../browser/milkdownEditor/webview/find-widget.template.js';
// @ts-ignore
import { createFindKeymap } from '../../browser/milkdownEditor/webview/find-keymap.template.js';
// @ts-ignore
import { VSWORD_UI_COMPONENT_DISPOSED_EVENT } from '../../browser/milkdownEditor/webview/ui-component.template.js';

// ---------------------------------------------------------------------------
// jsdom 骨架 + fake PM view
// ---------------------------------------------------------------------------

interface MockDoc {
	descendants(fn: (node: { isText: boolean; text?: string }, pos: number) => boolean | void): void;
}

/** doc 里塞若干 text 段落，pos 顺序递增。 */
function makeDoc(segments: Array<{ pos: number; text: string }>): MockDoc {
	return {
		descendants(fn) {
			for (const seg of segments) {
				fn({ isText: true, text: seg.text }, seg.pos);
			}
		},
	};
}

interface FakeView {
	state: { doc: MockDoc | null; tr: { setMeta: (key: unknown, val: unknown) => any } };
	dispatched: Array<{ meta: Map<unknown, unknown> }>;
	dispatch: (tr: any) => void;
	focus?: () => void;
	focusedCount: number;
}

function makeView(doc: MockDoc | null): FakeView {
	const view: FakeView = {
		focusedCount: 0,
		dispatched: [],
		focus() { view.focusedCount++; },
		state: {
			doc,
			get tr() {
				const meta = new Map<unknown, unknown>();
				const tr = {
					meta,
					setMeta(key: unknown, val: unknown) { meta.set(key, val); return tr; },
				};
				return tr;
			},
		} as any,
		dispatch(tr: any) { view.dispatched.push({ meta: tr.meta }); },
	};
	return view;
}

interface Boot {
	dom: JSDOM;
	container: HTMLElement;
	view: FakeView;
	mode: { current: 'wysiwyg' | 'reading' | 'source' };
}

function bootstrap(docSegments?: Array<{ pos: number; text: string }>): Boot {
	const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="vsword-md-shell"></div></body></html>`, {
		url: 'http://localhost/',
	});
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore
	globalThis.CustomEvent = dom.window.CustomEvent;
	// @ts-ignore — jsdom KeyboardEvent 挂全局，keymap 单测 handleKeyDown 才能 new。
	globalThis.KeyboardEvent = dom.window.KeyboardEvent;

	const container = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
	const view = makeView(docSegments ? makeDoc(docSegments) : makeDoc([]));
	const mode = { current: 'wysiwyg' as 'wysiwyg' | 'reading' | 'source' };
	return { dom, container, view, mode };
}

function makeWidget(boot: Boot) {
	return createFindWidget({
		getEditorView: () => boot.view,
		getMode: () => boot.mode.current,
	} as any);
}

function fireEvent(dom: JSDOM, target: EventTarget, type: string, init?: EventInit) {
	target.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true, ...(init || {}) }));
}
function fireInput(dom: JSDOM, input: HTMLInputElement, value: string) {
	input.value = value;
	fireEvent(dom, input, 'input');
}
function fireClick(dom: JSDOM, target: EventTarget) {
	target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// createFindWidget · IFindWidgetComponent 契约
// ---------------------------------------------------------------------------

suite('T-3.7c.3.b · createFindWidget · 契约完整性', () => {
	test('1. 返回对象暴露 9 个方法 + el getter', () => {
		const boot = bootstrap();
		const w = makeWidget(boot);
		for (const key of ['mount', 'unmount', 'dispose', 'open', 'openReplace', 'close', 'isOpen', 'setQuery', 'getState', 'getFindState'] as const) {
			assert.strictEqual(typeof (w as any)[key], 'function', `方法 ${key} 缺失`);
		}
		assert.strictEqual(w.el, null, 'mount 前 el 应为 null');
	});
});

// ---------------------------------------------------------------------------
// mount / unmount / dispose · DOM 生命周期
// ---------------------------------------------------------------------------

suite('T-3.7c.3.b · mount / unmount / dispose', () => {
	test('2. mount 后 container 里出现 #vsword-find-widget + 关键子元素', () => {
		const boot = bootstrap();
		const w = makeWidget(boot);
		w.mount(boot.container);

		const wrap = boot.container.querySelector('#vsword-find-widget') as HTMLElement | null;
		assert.ok(wrap, '骨架应存在');
		assert.strictEqual(w.el, wrap, 'component.el 指向 wrap');
		assert.ok(wrap!.classList.contains('vsword-hidden'), '默认隐藏');
		assert.ok(wrap!.querySelector('.vsword-find-input'), 'find input 存在');
		assert.ok(wrap!.querySelector('.vsword-find-case'), 'case 按钮存在');
		assert.ok(wrap!.querySelector('.vsword-find-word'), 'word 按钮存在');
		assert.ok(wrap!.querySelector('.vsword-find-regex'), 'regex 按钮存在');
		assert.ok(wrap!.querySelector('.vsword-find-count'), '计数存在');
		assert.ok(wrap!.querySelector('.vsword-find-prev'), 'prev 存在');
		assert.ok(wrap!.querySelector('.vsword-find-next'), 'next 存在');
		assert.ok(wrap!.querySelector('.vsword-find-close'), 'close 存在');
		assert.ok(wrap!.querySelector('.vsword-replace-row'), 'replace row 存在（默认隐藏）');
		assert.ok(wrap!.querySelector('.vsword-replace-input'), 'replace input 存在');
		assert.ok(wrap!.querySelector('.vsword-replace-one'), '替换 按钮存在');
		assert.ok(wrap!.querySelector('.vsword-replace-all'), '全部替换 按钮存在');
	});

	test('3. unmount 后 DOM 被摘除且 el === null · dispose 派发 sentinel event', () => {
		const boot = bootstrap();
		const w = makeWidget(boot);
		w.mount(boot.container);
		assert.ok(boot.container.querySelector('#vsword-find-widget'));
		w.unmount();
		assert.strictEqual(boot.container.querySelector('#vsword-find-widget'), null, 'unmount 后 DOM 应移除');
		assert.strictEqual(w.el, null, 'unmount 后 el 为 null');

		// re-mount → dispose 也能派发 sentinel
		w.mount(boot.container);
		const events: Array<CustomEvent> = [];
		boot.container.addEventListener(VSWORD_UI_COMPONENT_DISPOSED_EVENT, ((ev: Event) => { events.push(ev as CustomEvent); }) as EventListener);
		w.dispose();
		assert.strictEqual(events.length, 1, 'dispose 应派发一次 sentinel');
		assert.strictEqual((events[0] as any).detail.component, 'find-widget');
		assert.strictEqual(w.el, null, 'dispose 后 el === null');
	});
});

// ---------------------------------------------------------------------------
// open / close / openReplace · 显隐
// ---------------------------------------------------------------------------

suite('T-3.7c.3.b · open / close / openReplace', () => {
	test('4. open() 移除 .vsword-hidden · close() 加回 · isOpen 反映', () => {
		const boot = bootstrap();
		const w = makeWidget(boot);
		w.mount(boot.container);

		assert.strictEqual(w.isOpen(), false, '初始关闭');
		w.open();
		assert.strictEqual(w.isOpen(), true, 'open 后 isOpen=true');
		assert.strictEqual(w.el!.classList.contains('vsword-hidden'), false, 'open 后 hidden 移除');

		w.close();
		assert.strictEqual(w.isOpen(), false, 'close 后 isOpen=false');
		assert.ok(w.el!.classList.contains('vsword-hidden'), 'close 后 hidden 加回');
		assert.strictEqual(boot.view.focusedCount, 1, 'close 应把焦点还给 view');
	});

	test('5. openReplace() 露 .vsword-replace-row · open() 会藏回', () => {
		const boot = bootstrap();
		const w = makeWidget(boot);
		w.mount(boot.container);

		const replaceRow = w.el!.querySelector('.vsword-replace-row') as HTMLElement;
		assert.ok(replaceRow.classList.contains('vsword-hidden'), '初始 replace row 隐藏');

		w.openReplace();
		assert.strictEqual(replaceRow.classList.contains('vsword-hidden'), false, 'openReplace 后 replace row 显示');

		w.open(); // 从 replace 模式切回 find 模式
		assert.ok(replaceRow.classList.contains('vsword-hidden'), 'open 后 replace row 又隐藏');
	});

	test('6. reading mode 下 openReplace 把 replace/replaceAll 按钮 disabled', () => {
		const boot = bootstrap();
		boot.mode.current = 'reading';
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.openReplace();

		const btnOne = w.el!.querySelector('.vsword-replace-one') as HTMLButtonElement;
		const btnAll = w.el!.querySelector('.vsword-replace-all') as HTMLButtonElement;
		assert.strictEqual(btnOne.hasAttribute('disabled'), true, '替换 按钮 disabled');
		assert.strictEqual(btnAll.hasAttribute('disabled'), true, '全部替换 按钮 disabled');
		const row = w.el!.querySelector('.vsword-replace-row') as HTMLElement;
		assert.ok(row.classList.contains('vsword-find-replace-disabled'), '灰化 class');
	});
});

// ---------------------------------------------------------------------------
// input / options / 计数
// ---------------------------------------------------------------------------

suite('T-3.7c.3.b · input · options · 计数', () => {
	test('7. input 事件更新 query · dispatch recompute meta 到 view', () => {
		const boot = bootstrap([{ pos: 1, text: 'foo bar foo' }]);
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.open();

		// open() 本身会 kickPlugin 一次
		const openDispatchCount = boot.view.dispatched.length;
		assert.ok(openDispatchCount >= 1, 'open 会触发一次 recompute dispatch');

		const input = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		fireInput(boot.dom, input, 'foo');

		assert.ok(boot.view.dispatched.length > openDispatchCount, 'input 触发新 dispatch');
		// getState → index=1 total=2
		const s = w.getState();
		assert.strictEqual(s.total, 2, '两处 foo');
		assert.strictEqual(s.index, 1, 'activeIndex 归 0 → 显示 1');
	});

	test('8. 三 checkbox click → toggle .vsword-find-opt-on class', () => {
		const boot = bootstrap();
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.open();

		const caseBtn = w.el!.querySelector('.vsword-find-case') as HTMLButtonElement;
		const wordBtn = w.el!.querySelector('.vsword-find-word') as HTMLButtonElement;
		const regexBtn = w.el!.querySelector('.vsword-find-regex') as HTMLButtonElement;

		fireClick(boot.dom, caseBtn);
		assert.ok(caseBtn.classList.contains('vsword-find-opt-on'), 'case on');
		fireClick(boot.dom, caseBtn);
		assert.strictEqual(caseBtn.classList.contains('vsword-find-opt-on'), false, 'case 再点 off');

		fireClick(boot.dom, wordBtn);
		assert.ok(wordBtn.classList.contains('vsword-find-opt-on'), 'word on');
		fireClick(boot.dom, regexBtn);
		assert.ok(regexBtn.classList.contains('vsword-find-opt-on'), 'regex on');
	});

	test('9. 计数显示：无 query → "0 of 0" · matches=0 → "No results" · idx/total → "N of M"', () => {
		const boot = bootstrap([{ pos: 1, text: 'alpha beta alpha beta alpha' }]);
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.open();

		const countEl = w.el!.querySelector('.vsword-find-count') as HTMLElement;
		assert.strictEqual(countEl.textContent, '0 of 0', '空 query 显示 0 of 0');

		const input = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		fireInput(boot.dom, input, 'zzz');
		assert.strictEqual(countEl.textContent, 'No results', '无匹配显示 No results');

		fireInput(boot.dom, input, 'alpha');
		assert.strictEqual(countEl.textContent, '1 of 3', '3 处 alpha · active=0 → 1 of 3');

		// 上/下按钮
		const btnNext = w.el!.querySelector('.vsword-find-next') as HTMLButtonElement;
		fireClick(boot.dom, btnNext);
		assert.strictEqual(countEl.textContent, '2 of 3');
		fireClick(boot.dom, btnNext);
		assert.strictEqual(countEl.textContent, '3 of 3');
		fireClick(boot.dom, btnNext); // 回绕
		assert.strictEqual(countEl.textContent, '1 of 3');

		const btnPrev = w.el!.querySelector('.vsword-find-prev') as HTMLButtonElement;
		fireClick(boot.dom, btnPrev);
		assert.strictEqual(countEl.textContent, '3 of 3', 'prev 回绕到最后');
	});

	test('10. useRegex 非法 → "Invalid regex" + input.vsword-find-error class', () => {
		const boot = bootstrap([{ pos: 1, text: 'anything' }]);
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.open();

		const regexBtn = w.el!.querySelector('.vsword-find-regex') as HTMLButtonElement;
		fireClick(boot.dom, regexBtn);

		const input = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		fireInput(boot.dom, input, '(unbalanced');

		const countEl = w.el!.querySelector('.vsword-find-count') as HTMLElement;
		assert.strictEqual(countEl.textContent, 'Invalid regex', '文案');
		assert.ok(input.classList.contains('vsword-find-error'), '红边框 class');

		// 修正回合法：文案 + class 复原
		fireInput(boot.dom, input, 'a');
		assert.notStrictEqual(countEl.textContent, 'Invalid regex', '恢复后不再是 Invalid regex');
		assert.strictEqual(input.classList.contains('vsword-find-error'), false, 'error class 清');
	});
});

// ---------------------------------------------------------------------------
// setQuery + getState · input keydown（Enter / Shift+Enter）
// ---------------------------------------------------------------------------

suite('T-3.7c.3.b · setQuery + input keydown', () => {
	test('11. setQuery 更新 input.value + 触发 recompute', () => {
		const boot = bootstrap([{ pos: 1, text: 'zebra apple zebra' }]);
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.open();

		w.setQuery('zebra');
		const input = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		assert.strictEqual(input.value, 'zebra');
		const s = w.getState();
		assert.strictEqual(s.total, 2);
		assert.strictEqual(s.index, 1);
	});

	test('12. input Enter → next · Shift+Enter → prev · Escape → close', () => {
		const boot = bootstrap([{ pos: 1, text: 'x y x y x' }]);
		const w = makeWidget(boot);
		w.mount(boot.container);
		w.open();

		const input = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		fireInput(boot.dom, input, 'x');
		assert.strictEqual(w.getState().index, 1);

		input.dispatchEvent(new boot.dom.window.KeyboardEvent('keydown', {
			key: 'Enter', bubbles: true, cancelable: true,
		}));
		assert.strictEqual(w.getState().index, 2, 'Enter 应触发 next');

		input.dispatchEvent(new boot.dom.window.KeyboardEvent('keydown', {
			key: 'Enter', shiftKey: true, bubbles: true, cancelable: true,
		}));
		assert.strictEqual(w.getState().index, 1, 'Shift+Enter 应触发 prev');

		input.dispatchEvent(new boot.dom.window.KeyboardEvent('keydown', {
			key: 'Escape', bubbles: true, cancelable: true,
		}));
		assert.strictEqual(w.isOpen(), false, 'Escape 应关闭 widget');
	});
});

// ---------------------------------------------------------------------------
// createFindKeymap · Plugin handleKeyDown
// ---------------------------------------------------------------------------

interface WidgetSpy {
	openCount: number;
	openReplaceCount: number;
	closeCount: number;
	open: () => void;
	openReplace: () => void;
	close: () => void;
	isOpen: () => boolean;
	__isOpen: boolean;
}
function makeWidgetSpy(startOpen = false): WidgetSpy {
	const spy: WidgetSpy = {
		openCount: 0,
		openReplaceCount: 0,
		closeCount: 0,
		__isOpen: startOpen,
		open() { spy.openCount++; spy.__isOpen = true; },
		openReplace() { spy.openReplaceCount++; spy.__isOpen = true; },
		close() { spy.closeCount++; spy.__isOpen = false; },
		isOpen() { return spy.__isOpen; },
	};
	return spy;
}

suite('T-3.7c.3.b · createFindKeymap · Plugin handleKeyDown', () => {
	test('13. Ctrl+F → widget.open · Ctrl+H → widget.openReplace · Escape 打开时关闭 · 关闭时透传', () => {
		bootstrap();
		const spy = makeWidgetSpy();
		const plugin: any = createFindKeymap(spy);
		const handle = plugin.spec.props.handleKeyDown;

		const ev = (opts: any) => {
			let prevented = false;
			return {
				preventDefault() { prevented = true; },
				get __prevented() { return prevented; },
				...opts,
			};
		};

		// Ctrl+F
		const e1 = ev({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false });
		assert.strictEqual(handle(null, e1), true, 'Ctrl+F 应返回 true 拦截');
		assert.strictEqual(spy.openCount, 1);
		assert.strictEqual(e1.__prevented, true, 'preventDefault 应被调');

		// Cmd+F（Mac 兼容）
		const e2 = ev({ key: 'F', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false });
		assert.strictEqual(handle(null, e2), true, 'Cmd+F 应返回 true');
		assert.strictEqual(spy.openCount, 2);

		// Ctrl+H
		const e3 = ev({ key: 'h', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false });
		assert.strictEqual(handle(null, e3), true);
		assert.strictEqual(spy.openReplaceCount, 1);

		// Escape 时 widget 打开 → close
		const e4 = ev({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
		assert.strictEqual(handle(null, e4), true, 'widget open 时 Escape 拦截');
		assert.strictEqual(spy.closeCount, 1);

		// Escape 时 widget 关闭 → 返回 false 让其他 plugin 处理
		const e5 = ev({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
		assert.strictEqual(handle(null, e5), false, 'widget closed 时 Escape 不拦截');
		assert.strictEqual(spy.closeCount, 1, 'close 不应再被调');

		// 无 modifier 的 F 键 → 透传
		const e6 = ev({ key: 'f', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
		assert.strictEqual(handle(null, e6), false, '裸 f 键应透传');

		// Ctrl+Shift+F → 透传（避免撞 VS Code 全局搜索）
		const e7 = ev({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false });
		assert.strictEqual(handle(null, e7), false, 'Ctrl+Shift+F 应透传');
	});

	test('14. createFindKeymap(null) 应抛错 · handleKeyDown 内部 widget 方法抛错时静默 return true', () => {
		assert.throws(() => createFindKeymap(null as any), /widget/);

		const throwing = {
			open() { throw new Error('boom'); },
			openReplace() { throw new Error('boom'); },
			close() { throw new Error('boom'); },
			isOpen() { return true; },
		};
		const plugin: any = createFindKeymap(throwing);
		const handle = plugin.spec.props.handleKeyDown;
		const ev = { key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, preventDefault() { } };
		// 就算 widget.open 抛了 error 也不能把 PM view 拖挂 —— 内部 try/catch 吞掉。
		assert.doesNotThrow(() => assert.strictEqual(handle(null, ev), true));
	});
});

// ---------------------------------------------------------------------------
// T-3.7c.3.c · reading mode 二次防护 + 替换按钮真事务
// ---------------------------------------------------------------------------

suite('T-3.7c.3.c · createFindKeymap · reading mode Ctrl+H 二次防护', () => {
	test('15. reading mode → Ctrl+H 拦截但 openReplace 不被调（no-op）', () => {
		bootstrap();
		const spy = makeWidgetSpy();
		const plugin: any = createFindKeymap(spy, { getMode: () => 'reading' });
		const handle = plugin.spec.props.handleKeyDown;

		let prevented = false;
		const e = {
			key: 'h', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false,
			preventDefault() { prevented = true; },
		};
		// reading 下**仍返回 true**（拦截冒泡，避免 Ctrl+H 撞 shell 默认），但 openReplace 不被调
		assert.strictEqual(handle(null, e), true, 'reading 下 Ctrl+H 仍拦截');
		assert.strictEqual(spy.openReplaceCount, 0, 'reading 下 openReplace 不被调');
		assert.strictEqual(prevented, true, '仍 preventDefault 避免冒泡');
	});

	test('16. wysiwyg mode → Ctrl+H 正常呼出替换栏', () => {
		bootstrap();
		const spy = makeWidgetSpy();
		const plugin: any = createFindKeymap(spy, { getMode: () => 'wysiwyg' });
		const handle = plugin.spec.props.handleKeyDown;

		const e = { key: 'h', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, preventDefault() { } };
		assert.strictEqual(handle(null, e), true);
		assert.strictEqual(spy.openReplaceCount, 1);
	});

	test('17. getMode 抛错 → fallback wysiwyg · openReplace 仍被调', () => {
		bootstrap();
		const spy = makeWidgetSpy();
		const plugin: any = createFindKeymap(spy, { getMode: () => { throw new Error('boom'); } });
		const handle = plugin.spec.props.handleKeyDown;

		const e = { key: 'h', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, preventDefault() { } };
		assert.strictEqual(handle(null, e), true);
		assert.strictEqual(spy.openReplaceCount, 1, 'getMode 抛错时 fallback wysiwyg → 正常呼出');
	});
});

// ---------------------------------------------------------------------------
// T-3.7c.3.c · widget 替换按钮 → 真事务
// ---------------------------------------------------------------------------

/**
 * 强化版 fake view：state.tr 支持 replaceWith / delete 的 fluent 链，
 * 并把每步累加到 __replacements 里以便断言。
 */
function makeRichView(docSegments: Array<{ pos: number; text: string }>) {
	const view: any = {
		dispatched: [] as any[],
		focusedCount: 0,
		focus() { view.focusedCount++; },
		state: {
			doc: makeDoc(docSegments),
			schema: { text: (t: string) => ({ text: t }) },
		},
		dispatch(tr: any) { view.dispatched.push(tr); },
	};
	// state.tr 需要既支持 recompute meta（setMeta）又支持 replaceWith/delete
	// 用 lazy getter：同一次 dispatch 前多次访问返回同一个 tr。
	let cached: any = null;
	Object.defineProperty(view.state, 'tr', {
		configurable: true,
		get() {
			if (cached) { return cached; }
			cached = {
				__replacements: [] as any[],
				__meta: new Map<any, any>(),
				setMeta(k: any, v: any) { this.__meta.set(k, v); return this; },
				replaceWith(from: number, to: number, node: any) {
					this.__replacements.push({ from, to, text: node.text, op: 'replace' });
					return this;
				},
				delete(from: number, to: number) {
					this.__replacements.push({ from, to, text: '', op: 'delete' });
					return this;
				},
			};
			return cached;
		},
	});
	const origDispatch = view.dispatch.bind(view);
	view.dispatch = (tr: any) => { origDispatch(tr); cached = null; };
	return view;
}

suite('T-3.7c.3.c · widget 替换按钮 → applyReplaceOne / All 真事务', () => {
	test('18. 点「替换」按钮 → view.dispatch 被调 · tr 里有 1 条 replaceWith', () => {
		const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="vsword-md-shell"></div></body></html>`, { url: 'http://localhost/' });
		// @ts-ignore
		globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.CustomEvent = dom.window.CustomEvent;
		const container = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
		const richView = makeRichView([{ pos: 1, text: 'foo bar foo' }]);
		const w = createFindWidget({ getEditorView: () => richView, getMode: () => 'wysiwyg' } as any);
		w.mount(container);
		w.openReplace();

		const findInput = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		findInput.value = 'foo';
		findInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		assert.strictEqual(w.getState().total, 2, '两处 foo');

		const replaceInput = w.el!.querySelector('.vsword-replace-input') as HTMLInputElement;
		replaceInput.value = 'BAR';

		// 记下点击**前**的 dispatched.length —— openReplace 会 kickPlugin 一次
		const before = richView.dispatched.length;
		const btnOne = w.el!.querySelector('.vsword-replace-one') as HTMLButtonElement;
		btnOne.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

		// 「替换」会 dispatch 两次：一次是替换 tr，另一次是 recompute meta
		const replaceTr = richView.dispatched.find((tr: any) => tr.__replacements && tr.__replacements.length > 0);
		assert.ok(replaceTr, '应存在一个含 replaceWith 的 tr');
		assert.strictEqual(replaceTr.__replacements.length, 1);
		assert.strictEqual(replaceTr.__replacements[0].text, 'BAR');
		assert.ok(richView.dispatched.length > before, 'dispatch 应至少多一次');
	});

	test('19. 点「全部替换」→ tr 里有 N 条 replaceWith（反向 · 单 tr）', () => {
		const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="vsword-md-shell"></div></body></html>`, { url: 'http://localhost/' });
		// @ts-ignore
		globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.CustomEvent = dom.window.CustomEvent;
		const container = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
		const richView = makeRichView([{ pos: 1, text: 'x y x y x' }]);
		const w = createFindWidget({ getEditorView: () => richView, getMode: () => 'wysiwyg' } as any);
		w.mount(container);
		w.openReplace();

		const findInput = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		findInput.value = 'x';
		findInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		assert.strictEqual(w.getState().total, 3);

		const replaceInput = w.el!.querySelector('.vsword-replace-input') as HTMLInputElement;
		replaceInput.value = 'Z';

		const btnAll = w.el!.querySelector('.vsword-replace-all') as HTMLButtonElement;
		btnAll.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

		const replaceTr = richView.dispatched.find((tr: any) => tr.__replacements && tr.__replacements.length >= 3);
		assert.ok(replaceTr, '应存在含 3 条 replace 的 tr');
		assert.strictEqual(replaceTr.__replacements.length, 3);
		// 反向：第一条应是最后一个 match（pos 最大）
		assert.ok(replaceTr.__replacements[0].from > replaceTr.__replacements[2].from, '反向遍历');
	});

	test('20. reading mode → 点「替换」不 dispatch replace tr（三重保险最外层）', () => {
		const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="vsword-md-shell"></div></body></html>`, { url: 'http://localhost/' });
		// @ts-ignore
		globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.CustomEvent = dom.window.CustomEvent;
		const container = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
		const richView = makeRichView([{ pos: 1, text: 'foo bar foo' }]);
		const w = createFindWidget({ getEditorView: () => richView, getMode: () => 'reading' } as any);
		w.mount(container);
		w.openReplace();

		const findInput = w.el!.querySelector('.vsword-find-input') as HTMLInputElement;
		findInput.value = 'foo';
		findInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		const replaceInput = w.el!.querySelector('.vsword-replace-input') as HTMLInputElement;
		replaceInput.value = 'BAR';

		const btnOne = w.el!.querySelector('.vsword-replace-one') as HTMLButtonElement;
		btnOne.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

		// reading 下 doReplace() 静默 return，没有含 __replacements 的 tr
		const hasReplaceTr = richView.dispatched.some((tr: any) => tr.__replacements && tr.__replacements.length > 0);
		assert.strictEqual(hasReplaceTr, false, 'reading 模式下不应产生 replace tr');
	});
});

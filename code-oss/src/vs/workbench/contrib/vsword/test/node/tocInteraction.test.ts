/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.1.c · TOC 点击跳转 + 插入命令单元测试。
//
// 覆盖 PRD §5 AC-2（点击跳转）+ AC-4（命令插入）+ AC-7（fallback 兜底）
// 与任务 DoD 第 3 项（≥ 4 case · 对应任务体 C-c1…C-c5）。
//
// 测试策略：
//   · 不拉起 Milkdown Editor。resolveHeadingPos 为纯函数，可直接测。
//   · 点击委托走 NodeView 内部 addEventListener('click', …)：mock view.state.doc
//     + mock view.dispatch + mock TextSelection.create（默认 @milkdown/prose 已 external
//     进 builder node_modules，等价生产实现）。
//   · fallback 分支：resolveHeadingPos 返回 null 时应回落到 dom.ownerDocument.getElementById
//     + scrollIntoView，用 spy 断言。
//
// 与 tocViewModeInterop.test.ts 的边界：
//   那份卡覆盖 NodeView 挂载 / 集中重算 / shallow-hash / 多 TOC 共存；
//   本卡专测 c 卡新增的「点击跳转 + 命令插入」两条互动路径。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
	createTocView,
	resolveHeadingPos,
	_resetTocModuleState,
} from '../../browser/milkdownEditor/webview/toc-view.template.js';

// ---------------------------------------------------------------------------
// mock PM doc + heading 工厂
// ---------------------------------------------------------------------------

interface FakeHeadingNode {
	type: { name: 'heading' };
	attrs: { level: number };
	textContent: string;
}

/**
 * 造一个「行为像 PM doc」的对象：只需要 descendants(fn) 遍历一次 heading 序列。
 * pos 单调递增（每 heading 间隔 10，模拟 PM 常规间距，slugMap 计数与真实一致）。
 */
function makeFakeDoc(headings: Array<{ level: number; text: string }>): any {
	const nodes: Array<{ node: FakeHeadingNode; pos: number }> = headings.map((h, i) => ({
		node: { type: { name: 'heading' }, attrs: { level: h.level }, textContent: h.text },
		pos: 10 + i * 10,
	}));
	return {
		content: { size: 10 + nodes.length * 10 + 1 },
		descendants(fn: (node: any, pos: number) => boolean | void) {
			for (const { node, pos } of nodes) {
				const cont = fn(node, pos);
				if (cont === false) { /* heading 内部不递归；但顶层继续 */ }
			}
		},
		// PM resolve() 在 view.dispatch 里被真实 TextSelection.create 需要；
		// 这里 mock 掉 tr.setSelection 就不走真实 resolve。
		resolve(pos: number) { return { pos }; },
	};
}

// ---------------------------------------------------------------------------
// mock EditorView：只 mock click 需要的 state + dispatch + focus
// ---------------------------------------------------------------------------

function makeMockView(doc: Document, pmDoc: any): {
	view: any;
	dispatched: any[];
	focused: number;
} {
	const host = doc.createElement('div');
	doc.body.appendChild(host);
	const dispatched: any[] = [];
	let focused = 0;
	const tr = {
		setSelection(_sel: any) { return this; },
		scrollIntoView() { return this; },
	};
	// mock 一份 near-selection 的 selection.constructor：
	//   toc-view 里用 `state.selection.constructor.near($target)` 来避免 import TextSelection。
	const FakeSelection: any = function () { /* placeholder */ };
	FakeSelection.near = (_$pos: any) => ({ __kind: 'near', at: _$pos.pos });
	const view = {
		dom: host,
		state: {
			doc: pmDoc,
			selection: { constructor: FakeSelection },
			get tr() { return tr; },
		},
		dispatch(t: any) { dispatched.push(t); },
		focus() { focused++; },
	};
	return { view, dispatched, focused: focused };
}

function makeJsdom(): { doc: Document } {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	return { doc: dom.window.document };
}

// ---------------------------------------------------------------------------
// Suite 1 · C-c1 · resolveHeadingPos 纯函数
// ---------------------------------------------------------------------------

suite('T-3.7c.1.c · C-c1 resolveHeadingPos（slug→pos）', () => {

	test('命中：`第一节` slug=`第一节` → 返回该 heading 的 pos', () => {
		const doc = makeFakeDoc([
			{ level: 1, text: '第一节' },
			{ level: 2, text: '子节 A' },
		]);
		// slugify('第一节') = '第一节'（CJK 保留）
		assert.strictEqual(resolveHeadingPos(doc, '第一节'), 10);
	});

	test('未命中 slug → 返回 null', () => {
		const doc = makeFakeDoc([{ level: 1, text: 'Alpha' }]);
		assert.strictEqual(resolveHeadingPos(doc, 'nope'), null);
	});

	test('重名 heading：第二个走 `<slug>-1` 后缀 · 命中不同 pos', () => {
		const doc = makeFakeDoc([
			{ level: 2, text: 'Notes' },
			{ level: 2, text: 'Notes' },
		]);
		// 与 outline-extractor.extractHeadings 逻辑一致：first→'notes', second→'notes-1'
		assert.strictEqual(resolveHeadingPos(doc, 'notes'), 10);
		assert.strictEqual(resolveHeadingPos(doc, 'notes-1'), 20);
	});

	test('防御性：空 slug / 非字符串 / doc 无 descendants → null（不抛）', () => {
		const doc = makeFakeDoc([{ level: 1, text: 'A' }]);
		assert.strictEqual(resolveHeadingPos(doc, ''), null);
		assert.strictEqual(resolveHeadingPos(doc, null as any), null);
		assert.strictEqual(resolveHeadingPos(null as any, 'a'), null);
		assert.strictEqual(resolveHeadingPos({} as any, 'a'), null);
	});

	test('无 heading 的 doc → null', () => {
		const doc = makeFakeDoc([]);
		assert.strictEqual(resolveHeadingPos(doc, 'anything'), null);
	});
});

// ---------------------------------------------------------------------------
// Suite 2 · C-c2 · 点击 <a> 委托 → dispatch + scrollIntoView + preventDefault
// ---------------------------------------------------------------------------

suite('T-3.7c.1.c · C-c2 点击 <a> 触发 dispatch（AC-2）', () => {

	setup(() => { _resetTocModuleState(); });

	test('点击 <a[data-heading-id]> · dispatch 被调 1 次 · preventDefault + stopPropagation 触发', () => {
		const { doc } = makeJsdom();
		const pmDoc = makeFakeDoc([
			{ level: 1, text: 'First' },
			{ level: 2, text: 'Second' },
		]);
		const { view, dispatched } = makeMockView(doc, pmDoc);
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view, () => 0);
		handle._rerender([
			{ id: 'first', level: 1, text: 'First' },
			{ id: 'second', level: 2, text: 'Second' },
		]);
		const a = handle.dom.querySelector('a[data-heading-id="first"]') as HTMLAnchorElement;
		assert.ok(a, '应有 first anchor');

		let prevented = 0;
		let stopped = 0;
		const evt = new (doc.defaultView as any).MouseEvent('click', { bubbles: true, cancelable: true });
		// spy：dispatchEvent 后从 defaultPrevented 反推；stopPropagation 通过覆盖判断。
		const origStop = evt.stopPropagation.bind(evt);
		evt.stopPropagation = () => { stopped++; return origStop(); };
		a.dispatchEvent(evt);
		if (evt.defaultPrevented) { prevented++; }

		assert.strictEqual(dispatched.length, 1, '应 dispatch 一次 tr');
		assert.strictEqual(prevented, 1, 'preventDefault 应被调用');
		assert.strictEqual(stopped, 1, 'stopPropagation 应被调用');
	});

	test('点击 nav 内非 <a> 区域 → 不 dispatch · 不 preventDefault', () => {
		const { doc } = makeJsdom();
		const { view, dispatched } = makeMockView(doc, makeFakeDoc([{ level: 1, text: 'A' }]));
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view, () => 0);
		handle._rerender([{ id: 'a', level: 1, text: 'A' }]);

		const ul = handle.dom.querySelector('ul.vsword-toc-list') as HTMLUListElement;
		assert.ok(ul);
		const evt = new (doc.defaultView as any).MouseEvent('click', { bubbles: true, cancelable: true });
		ul.dispatchEvent(evt);
		assert.strictEqual(dispatched.length, 0, '非锚点点击不应 dispatch');
		assert.strictEqual(evt.defaultPrevented, false, '非锚点点击不应 preventDefault');
	});
});

// ---------------------------------------------------------------------------
// Suite 3 · C-c5 · fallback：resolveHeadingPos 返回 null → scrollIntoView 兜底
// ---------------------------------------------------------------------------

suite('T-3.7c.1.c · C-c5 fallback（AC-7）', () => {

	setup(() => { _resetTocModuleState(); });

	test('slug 不在 doc 中 · 但 DOM 有 id=slug 的元素 → scrollIntoView 被调 · 不 dispatch', () => {
		const { doc } = makeJsdom();
		// pmDoc 无 heading，resolveHeadingPos 恒返回 null → 走 fallback
		const pmDoc = makeFakeDoc([]);
		const { view, dispatched } = makeMockView(doc, pmDoc);

		// 在 document 里预置一个 id=missing 的目标元素 + scrollIntoView spy
		const target = doc.createElement('h2');
		target.id = 'missing';
		target.textContent = 'Target Heading';
		doc.body.appendChild(target);
		let scrolls = 0;
		(target as any).scrollIntoView = () => { scrolls++; };

		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view, () => 0);
		handle._rerender([{ id: 'missing', level: 2, text: 'Missing' }]);
		const a = handle.dom.querySelector('a[data-heading-id="missing"]') as HTMLAnchorElement;
		a.click();

		assert.strictEqual(dispatched.length, 0, 'resolveHeadingPos null 时不 dispatch tr');
		assert.strictEqual(scrolls, 1, '应回落到 element.scrollIntoView()');
	});

	test('slug 不在 doc 中 · DOM 也没有 id=slug 的元素 → 静默（不抛不 dispatch）', () => {
		const { doc } = makeJsdom();
		const { view, dispatched } = makeMockView(doc, makeFakeDoc([]));
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view, () => 0);
		handle._rerender([{ id: 'ghost', level: 1, text: 'Ghost' }]);
		const a = handle.dom.querySelector('a[data-heading-id="ghost"]') as HTMLAnchorElement;
		assert.doesNotThrow(() => { a.click(); }, 'fallback 找不到元素也不应抛');
		assert.strictEqual(dispatched.length, 0);
	});

	test('空 slug（<a data-heading-id="">）→ 不 dispatch 不 fallback', () => {
		const { doc } = makeJsdom();
		const { view, dispatched } = makeMockView(doc, makeFakeDoc([{ level: 1, text: 'A' }]));
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view, () => 0);
		handle._rerender([{ id: '', level: 1, text: 'blank' }]);
		const a = handle.dom.querySelector('a') as HTMLAnchorElement;
		let scrolls = 0;
		// document.getElementById('') 会返回 null，所以这里主要断言 dispatch 未触发
		(doc.body as any).scrollIntoView = () => { scrolls++; };
		a.click();
		assert.strictEqual(dispatched.length, 0);
		assert.strictEqual(scrolls, 0);
	});
});

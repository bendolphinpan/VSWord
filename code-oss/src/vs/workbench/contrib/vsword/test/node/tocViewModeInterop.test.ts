/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.1.b · TOC NodeView + 事务级集中重算 Plugin 单元测试。
//
// 覆盖 PRD §5 AC-1（渲染）+ AC-3（自动重算）+ AC-6（多 TOC 共存）+ AC-8（UI 组件契约）
// 与 DoD 第 4 项（≥ 6 case · 对应任务体 C1–C6）。
//
// 测试策略：
//   · 不拉起 Milkdown Editor（那需要全套 plugin 依赖 + katex 等 webview-only 模块）。
//   · 用 jsdom 提供 document / element；用 mock EditorView + mock PM state 直接
//     驱动 createTocView 与 createTocRecomputePlugin。
//   · Plugin 内部无 state —— 直接调 plugin.spec.appendTransaction(txs, oldState, newState)
//     即可覆盖广播 / 去噪 / 空态所有分支，与生产路径行为等价。
//   · headingsShallowHash 由 C3 / C4 直接断言。C6 通过 _rerender spy 计数覆盖去噪。
//
// 关键约束（PRD §4.5 · §8）：
//   · 严禁每个 NodeView 各自订阅 EditorView.update —— 本单测通过读 Plugin 单例
//     调用 _rerender 的次数（"两个 TOC 各调一次"）保证集中广播语义。
//   · shallow-hash 语义：level | text.trim() 逐行 '\n' join，忽略首尾空白（D-6）。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
	createTocView,
	createTocRecomputePlugin,
	headingsShallowHash,
	liveTocViews,
	_resetTocModuleState,
} from '../../browser/milkdownEditor/webview/toc-view.template.js';

// ---------------------------------------------------------------------------
// jsdom + mock EditorView / state 工具
// ---------------------------------------------------------------------------

interface MockDoc {
	// 用于 extractHeadings 兜底：Plugin 的 extract 参数在测试里直接 mock，
	// 但 createTocView 首帧渲染会走真 extractHeadings；给它一个 no-op descendants
	// 即可退化为空 headings（真 extract 会返回 []）。
	descendants?: (fn: (node: any, pos: number) => any) => void;
}

interface MockState {
	doc: MockDoc;
}

interface MockView {
	dom: HTMLElement;
	state: MockState;
}

function makeJsdom(): { doc: Document; win: any } {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	return { doc: dom.window.document, win: dom.window };
}

function makeMockView(doc: Document): MockView {
	const host = doc.createElement('div');
	doc.body.appendChild(host);
	return {
		dom: host,
		state: { doc: { descendants: () => { /* no headings */ } } },
	};
}

function makeMockState(doc: MockDoc): MockState {
	return { doc };
}

// ---------------------------------------------------------------------------
// Suite 1 · shallow-hash（C3 · C4 · D-6）
// ---------------------------------------------------------------------------

suite('T-3.7c.1.b · headingsShallowHash（PRD §4.6 · 决策 D-6）', () => {

	test('C3a · 相同 heading 序列 hash 相等', () => {
		const a = [{ level: 1, text: '标题一' }, { level: 2, text: '子节' }];
		const b = [{ level: 1, text: '标题一' }, { level: 2, text: '子节' }];
		assert.strictEqual(headingsShallowHash(a), headingsShallowHash(b));
	});

	test('C3b · text 变化 → hash 变化', () => {
		const a = [{ level: 1, text: '标题一' }];
		const b = [{ level: 1, text: '标题二' }];
		assert.notStrictEqual(headingsShallowHash(a), headingsShallowHash(b));
	});

	test('C3c · level 变化 → hash 变化', () => {
		const a = [{ level: 1, text: '同名' }];
		const b = [{ level: 2, text: '同名' }];
		assert.notStrictEqual(headingsShallowHash(a), headingsShallowHash(b));
	});

	test('C4 · 首尾空白忽略（D-6）：`  标题  ` 与 `标题` hash 相等', () => {
		const a = [{ level: 1, text: '  标题  ' }];
		const b = [{ level: 1, text: '标题' }];
		assert.strictEqual(headingsShallowHash(a), headingsShallowHash(b));
	});

	test('C4b · 内部空白差异保留：`A  B` 与 `A B` hash 不等', () => {
		const a = [{ level: 1, text: 'A  B' }];
		const b = [{ level: 1, text: 'A B' }];
		assert.notStrictEqual(headingsShallowHash(a), headingsShallowHash(b));
	});

	test('空数组 / 非数组 → 空串（不抛）', () => {
		assert.strictEqual(headingsShallowHash([]), '');
		assert.strictEqual(headingsShallowHash(null as any), '');
		assert.strictEqual(headingsShallowHash(undefined as any), '');
	});

	test('缺失 level / text 时按 level=1 / text="" 兜底', () => {
		const h = headingsShallowHash([{}] as any);
		assert.strictEqual(h, '1|');
	});
});

// ---------------------------------------------------------------------------
// Suite 2 · C1 · 单 TOC · 3 heading 渲染
// ---------------------------------------------------------------------------

suite('T-3.7c.1.b · C1 单 TOC · 3 heading（AC-1 渲染）', () => {

	setup(() => { _resetTocModuleState(); });

	test('_rerender 生成 3 个 <li> · slug + level + text 正确', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view as any, () => 0);
		// 直接调 _rerender 驱动，避免依赖 extractHeadings 真实 PM 遍历
		handle._rerender([
			{ id: 'first', level: 1, text: '第一节' },
			{ id: 'second', level: 2, text: '子节 A' },
			{ id: 'third', level: 3, text: '深入' },
		]);
		const nav = handle.dom;
		assert.strictEqual(nav.tagName.toLowerCase(), 'nav');
		assert.ok(nav.classList.contains('vsword-toc'));
		assert.strictEqual(nav.getAttribute('contenteditable'), 'false');
		const ul = nav.querySelector('ul.vsword-toc-list');
		assert.ok(ul, '应有 <ul.vsword-toc-list>');
		const items = ul!.querySelectorAll('li.vsword-toc-item');
		assert.strictEqual(items.length, 3);
		// 逐项断言：class 含 level-N · a[href="#slug"] · data-heading-id · textContent
		const [l1, l2, l3] = Array.from(items) as HTMLElement[];
		assert.ok(l1.classList.contains('vsword-toc-level-1'));
		assert.ok(l2.classList.contains('vsword-toc-level-2'));
		assert.ok(l3.classList.contains('vsword-toc-level-3'));
		const a1 = l1.querySelector('a')!;
		assert.strictEqual(a1.getAttribute('href'), '#first');
		assert.strictEqual(a1.getAttribute('data-heading-id'), 'first');
		assert.strictEqual(a1.textContent, '第一节');
		assert.strictEqual(l3.querySelector('a')!.textContent, '深入');
	});

	test('handle 满足 NodeView 契约：dom / update / stopEvent / ignoreMutation / destroy', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const node = { type: { name: 'toc_marker' } } as any;
		const handle = createTocView(node, view as any, () => 0);
		assert.ok(handle.dom instanceof (doc.defaultView as any).HTMLElement);
		assert.strictEqual(typeof handle.update, 'function');
		assert.strictEqual(handle.update({ type: { name: 'toc_marker' } } as any), true, 'update 应返回 true');
		assert.strictEqual(handle.update({ type: { name: 'paragraph' } } as any), false, '类型不同应返回 false');
		assert.strictEqual(handle.stopEvent(), true);
		assert.strictEqual(handle.ignoreMutation(), true);
		// destroy 应把自己从 liveTocViews 摘除
		assert.ok(liveTocViews.has(handle));
		handle.destroy();
		assert.ok(!liveTocViews.has(handle));
	});
});

// ---------------------------------------------------------------------------
// Suite 3 · C2 · 空 heading（决策 D-2）
// ---------------------------------------------------------------------------

suite('T-3.7c.1.b · C2 空 heading（决策 D-2）', () => {

	setup(() => { _resetTocModuleState(); });

	test('_rerender([]) 渲染单个 <p.vsword-toc-empty>', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view as any, () => 0);
		handle._rerender([]);
		const nav = handle.dom;
		assert.strictEqual(nav.querySelector('ul'), null, '空态不应有 <ul>');
		const empty = nav.querySelector('p.vsword-toc-empty');
		assert.ok(empty, '空态应有 <p.vsword-toc-empty>');
		assert.ok((empty!.textContent || '').length > 0, '空态提示应有文案（复用旧 CSS token）');
	});

	test('非数组入参（防御性 · 视同空态）', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view as any, () => 0);
		handle._rerender(null as any);
		assert.ok(handle.dom.querySelector('p.vsword-toc-empty'));
	});
});

// ---------------------------------------------------------------------------
// Suite 4 · C5 · 多 TOC 共存（AC-6）
// ---------------------------------------------------------------------------

suite('T-3.7c.1.b · C5 多 TOC 共存（PRD §5 AC-6）', () => {

	setup(() => { _resetTocModuleState(); });

	test('2 个 NodeView 都注册进 liveTocViews · 一次 dispatch 各 _rerender 一次 · destroy 后正确摘除', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const node = { type: { name: 'toc_marker' } } as any;
		const h1 = createTocView(node, view as any, () => 0);
		const h2 = createTocView(node, view as any, () => 10);
		assert.strictEqual(liveTocViews.size, 2);

		// spy _rerender：保留原实现（不修改），只计数
		let n1 = 0; let n2 = 0;
		const orig1 = h1._rerender; h1._rerender = (h: any) => { n1++; return orig1.call(h1, h); };
		const orig2 = h2._rerender; h2._rerender = (h: any) => { n2++; return orig2.call(h2, h); };

		const headings = [{ id: 'x', level: 1, text: 'X' }];
		const plugin = createTocRecomputePlugin(() => headings);
		const oldDoc: any = {};
		const newDoc: any = {};
		const res = plugin.spec.appendTransaction!([{ docChanged: true } as any], makeMockState(oldDoc) as any, makeMockState(newDoc) as any);
		assert.strictEqual(res, null, 'appendTransaction 应始终 return null（仅副作用广播）');
		assert.strictEqual(n1, 1, 'h1 应恰好 _rerender 一次');
		assert.strictEqual(n2, 1, 'h2 应恰好 _rerender 一次');

		// 各自 DOM 都更新到最新 heading
		assert.strictEqual(h1.dom.querySelectorAll('li.vsword-toc-item').length, 1);
		assert.strictEqual(h2.dom.querySelectorAll('li.vsword-toc-item').length, 1);

		// destroy h1 后 Set 只剩 h2
		h1.destroy();
		assert.strictEqual(liveTocViews.size, 1);
		assert.ok(liveTocViews.has(h2));
		assert.ok(!liveTocViews.has(h1));
	});
});

// ---------------------------------------------------------------------------
// Suite 5 · C6 · 事务级去噪（PRD §8 风险 2）
// ---------------------------------------------------------------------------

suite('T-3.7c.1.b · C6 事务级去噪（相同 hash 只广播一次）', () => {

	setup(() => { _resetTocModuleState(); });

	test('相同 headings 二次 dispatch · _rerender 只调 1 次（不含首帧构造）', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view as any, () => 0);
		let calls = 0;
		const orig = handle._rerender;
		handle._rerender = (h: any) => { calls++; return orig.call(handle, h); };

		const headings = [{ id: 'a', level: 1, text: 'A' }];
		const plugin = createTocRecomputePlugin(() => headings);

		// 第 1 次 dispatch：doc 变了，hash 首次算出 → 广播
		plugin.spec.appendTransaction!([{} as any], makeMockState({} as any) as any, makeMockState({} as any) as any);
		assert.strictEqual(calls, 1, '首次 doc 变化应广播 1 次');

		// 第 2 次 dispatch：doc 又变了（对象不同），但 hash 相同 → 应去噪
		plugin.spec.appendTransaction!([{} as any], makeMockState({} as any) as any, makeMockState({} as any) as any);
		assert.strictEqual(calls, 1, '相同 hash 不应再广播（PRD §8 风险 2 去噪）');

		// 换 heading 内容 → hash 变 → 再广播 1 次
		const plugin2 = createTocRecomputePlugin(() => [{ id: 'b', level: 1, text: 'B' }]);
		plugin2.spec.appendTransaction!([{} as any], makeMockState({} as any) as any, makeMockState({} as any) as any);
		assert.strictEqual(calls, 2, 'hash 变化应再广播 1 次');
	});

	test('doc 未变（selection-only tr）→ return null 且不广播', () => {
		const { doc } = makeJsdom();
		const view = makeMockView(doc);
		const handle = createTocView({ type: { name: 'toc_marker' } } as any, view as any, () => 0);
		let calls = 0;
		const orig = handle._rerender;
		handle._rerender = (h: any) => { calls++; return orig.call(handle, h); };

		const sameDoc: any = { descendants: () => { /* noop */ } };
		const plugin = createTocRecomputePlugin(() => [{ id: 'a', level: 1, text: 'A' }]);
		const oldSt = makeMockState(sameDoc);
		const newSt = makeMockState(sameDoc); // 同一 doc 引用
		const res = plugin.spec.appendTransaction!([{} as any], oldSt as any, newSt as any);
		assert.strictEqual(res, null);
		assert.strictEqual(calls, 0, 'doc 未变不应触发 _rerender');
	});

	test('liveTocViews 为空 → return null 且不调用 extract', () => {
		_resetTocModuleState();
		let extractCalls = 0;
		const plugin = createTocRecomputePlugin(() => { extractCalls++; return []; });
		const res = plugin.spec.appendTransaction!([{} as any], makeMockState({} as any) as any, makeMockState({} as any) as any);
		assert.strictEqual(res, null);
		assert.strictEqual(extractCalls, 0, '无 TOC 不应做 extract（节流）');
	});
});

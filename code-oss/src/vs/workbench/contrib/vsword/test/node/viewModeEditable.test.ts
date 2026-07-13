/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.c · VSWord Milkdown editable 切换器（reading 真只读）单元测试
//
// 覆盖 DoD §5 ≥ 3 case（本文件落地 5 case）：
//   1. apply('reading') → editable() 返回 false
//   2. apply('realtime') → editable() 返回 true
//   3. apply('source')   → editable() 返回 true（reading 唯一真只读，其余全部可编辑）
//   4. sessionReady=false 时 apply 塞进 pendingMode；setSessionReady(true) 立即 replay
//   5. apply 里对活体 EditorView 调 setProps({editable})；仅 composing 时才空 tr flush
//
// 被测代码 = `view-mode-editable.template.js` 里的纯函数 `createViewModeApplier`。
// 它设计上不 import 任何 @milkdown/*，可直接在 node 里跑，无需 jsdom / Milkdown mock。
// editorViewCtx / editorViewOptionsCtx 传成 Symbol 就够；editor.action 接一个 fake ctx。

import * as assert from 'assert';
// @ts-ignore — .template.js 是纯 JS 模块，无 .d.ts，运行期靠 esbuild bundle 解析。
import { createViewModeApplier } from '../../browser/milkdownEditor/webview/view-mode-editable.template.js';

// ---------------------------------------------------------------------------
// mock 基础
// ---------------------------------------------------------------------------

interface FakeView {
	state: {
		tr: { __tr: true };
		selection: { from: number; to: number; constructor: { between?: Function; near?: Function } };
		doc: { content: { size: number }; resolve: (pos: number) => unknown };
	};
	composing: boolean;
	setProps: (props: { editable: () => boolean }) => void;
	dispatch: (tr: unknown) => void;
	focus: () => void;
	dom: { focus: () => void };
	__setPropsCalls: Array<{ editable: () => boolean }>;
	__dispatchCalls: unknown[];
}

function makeFakeView(opts?: { composing?: boolean }): FakeView {
	const setPropsCalls: Array<{ editable: () => boolean }> = [];
	const dispatchCalls: unknown[] = [];
	return {
		state: {
			tr: { __tr: true },
			selection: {
				from: 1,
				to: 1,
				constructor: {},
			},
			doc: {
				content: { size: 10 },
				resolve: (pos: number) => ({ pos }),
			},
		},
		composing: !!opts?.composing,
		setProps: (props) => { setPropsCalls.push(props); },
		dispatch: (tr) => { dispatchCalls.push(tr); },
		focus: () => { /* noop */ },
		dom: { focus: () => { /* noop */ } },
		__setPropsCalls: setPropsCalls,
		__dispatchCalls: dispatchCalls,
	};
}

interface FakeCtx {
	get: (slice: symbol) => unknown;
	update: (slice: symbol, updater: (prev: unknown) => unknown) => void;
	__slices: Map<symbol, unknown>;
}

function makeFakeCtx(viewCtxKey: symbol, optionsCtxKey: symbol, view: FakeView | null): FakeCtx {
	const slices = new Map<symbol, unknown>();
	slices.set(optionsCtxKey, {}); // 初始 editorViewOptionsCtx = 空 options
	if (view) slices.set(viewCtxKey, view);
	return {
		get: (slice) => slices.get(slice),
		update: (slice, updater) => {
			const prev = slices.get(slice);
			slices.set(slice, updater(prev));
		},
		__slices: slices,
	};
}

interface FakeEditor {
	action: (fn: (ctx: FakeCtx) => void) => void;
	__actionCallCount: number;
	__lastCtx: FakeCtx | null;
}

function makeFakeEditor(ctx: FakeCtx): FakeEditor {
	const editor = {
		__actionCallCount: 0,
		__lastCtx: null as FakeCtx | null,
		action(fn: (c: FakeCtx) => void) {
			editor.__actionCallCount++;
			editor.__lastCtx = ctx;
			fn(ctx);
		},
	};
	return editor;
}

// ---------------------------------------------------------------------------
// suites
// ---------------------------------------------------------------------------

suite('T-3.7b.c · createViewModeApplier · reading editable 切换', () => {

	test('apply("reading") → editable() 返回 false', () => {
		const viewCtxKey = Symbol('editorViewCtx');
		const optionsCtxKey = Symbol('editorViewOptionsCtx');
		const view = makeFakeView();
		const ctx = makeFakeCtx(viewCtxKey, optionsCtxKey, view);
		const editor = makeFakeEditor(ctx);
		const applier = createViewModeApplier({
			getEditor: () => editor,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});

		applier.setSessionReady(true);
		applier.apply('reading');

		assert.strictEqual(editor.__actionCallCount, 1, 'editor.action 应被调用一次');
		assert.strictEqual(view.__setPropsCalls.length, 1, 'view.setProps 应被调用一次');
		const editable = view.__setPropsCalls[0].editable;
		assert.strictEqual(typeof editable, 'function', 'editable 必须是函数（Milkdown 每次 focus/keydown 调用取值）');
		assert.strictEqual(editable(), false, 'reading 模式 editable() 必须返回 false');
		// ctx.update 也应写进 slice
		const opts = ctx.__slices.get(optionsCtxKey) as { editable?: () => boolean };
		assert.strictEqual(typeof opts.editable, 'function', 'editorViewOptionsCtx.editable 必须也被更新');
		assert.strictEqual(opts.editable!(), false);
	});

	test('apply("realtime") → editable() 返回 true', () => {
		const viewCtxKey = Symbol();
		const optionsCtxKey = Symbol();
		const view = makeFakeView();
		const ctx = makeFakeCtx(viewCtxKey, optionsCtxKey, view);
		const editor = makeFakeEditor(ctx);
		const applier = createViewModeApplier({
			getEditor: () => editor,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});

		applier.setSessionReady(true);
		applier.apply('realtime');

		const editable = view.__setPropsCalls[0].editable;
		assert.strictEqual(editable(), true, 'realtime 模式 editable() 必须返回 true');
	});

	test('apply("source") → editable() 返回 true（非 reading 全部可编辑）', () => {
		const viewCtxKey = Symbol();
		const optionsCtxKey = Symbol();
		const view = makeFakeView();
		const ctx = makeFakeCtx(viewCtxKey, optionsCtxKey, view);
		const editor = makeFakeEditor(ctx);
		const applier = createViewModeApplier({
			getEditor: () => editor,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});

		applier.setSessionReady(true);
		applier.apply('source');

		assert.strictEqual(view.__setPropsCalls[0].editable(), true, 'source 模式 editable() 返回 true');
	});

	test('sessionReady=false 时 apply 塞进 pendingMode，setSessionReady(true) 立即 replay', () => {
		const viewCtxKey = Symbol();
		const optionsCtxKey = Symbol();
		const view = makeFakeView();
		const ctx = makeFakeCtx(viewCtxKey, optionsCtxKey, view);
		const editor = makeFakeEditor(ctx);
		const applier = createViewModeApplier({
			getEditor: () => editor,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});

		// 未 ready → editor.action 不应被调用
		applier.apply('reading');
		assert.strictEqual(editor.__actionCallCount, 0, '未 ready 时 editor.action 不该被调用');
		assert.strictEqual(applier.getPending(), 'reading', 'pendingMode 应是 reading');
		assert.strictEqual(view.__setPropsCalls.length, 0);

		// ready → replay
		applier.setSessionReady(true);
		assert.strictEqual(editor.__actionCallCount, 1, 'setSessionReady(true) 应触发 replay');
		assert.strictEqual(view.__setPropsCalls.length, 1);
		assert.strictEqual(view.__setPropsCalls[0].editable(), false, 'replay 后 editable 是 reading 版本');
		assert.strictEqual(applier.getPending(), null, 'replay 消费掉 pendingMode');
		assert.strictEqual(applier.getLastApplied(), 'reading');
	});

	test('apply 对活体 view 调 setProps；仅 composing 时空 tr flush（避免切模式丢光标）', () => {
		const viewCtxKey = Symbol();
		const optionsCtxKey = Symbol();
		// 非 composing：不得空 tr（会打乱 selection/焦点）
		const viewIdle = makeFakeView({ composing: false });
		const ctxIdle = makeFakeCtx(viewCtxKey, optionsCtxKey, viewIdle);
		const editorIdle = makeFakeEditor(ctxIdle);
		const applierIdle = createViewModeApplier({
			getEditor: () => editorIdle,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});
		applierIdle.setSessionReady(true);
		applierIdle.apply('reading');
		assert.strictEqual(viewIdle.__setPropsCalls.length, 1, 'setProps 调用一次');
		assert.strictEqual(viewIdle.__dispatchCalls.length, 0, '非 composing 不 dispatch 空 tr');

		// composing：才 flush
		const viewComposing = makeFakeView({ composing: true });
		const ctxComposing = makeFakeCtx(viewCtxKey, optionsCtxKey, viewComposing);
		const editorComposing = makeFakeEditor(ctxComposing);
		const applierComposing = createViewModeApplier({
			getEditor: () => editorComposing,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});
		applierComposing.setSessionReady(true);
		applierComposing.apply('reading');
		assert.strictEqual(viewComposing.__setPropsCalls.length, 1, 'composing 时 setProps 一次');
		assert.strictEqual(viewComposing.__dispatchCalls.length, 1, 'composing 时 dispatch 一次强制 flush');
		assert.strictEqual(viewComposing.__dispatchCalls[0], viewComposing.state.tr, 'dispatch 传的应是 view.state.tr');
	});

	test('后续切换：reading → realtime → reading，每次 editable 语义正确', () => {
		const viewCtxKey = Symbol();
		const optionsCtxKey = Symbol();
		const view = makeFakeView();
		const ctx = makeFakeCtx(viewCtxKey, optionsCtxKey, view);
		const editor = makeFakeEditor(ctx);
		const applier = createViewModeApplier({
			getEditor: () => editor,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});
		applier.setSessionReady(true);

		applier.apply('reading');
		applier.apply('realtime');
		applier.apply('reading');

		assert.strictEqual(view.__setPropsCalls.length, 3, '三次 apply → 三次 setProps');
		assert.strictEqual(view.__setPropsCalls[0].editable(), false);
		assert.strictEqual(view.__setPropsCalls[1].editable(), true);
		assert.strictEqual(view.__setPropsCalls[2].editable(), false);
		assert.strictEqual(applier.getLastApplied(), 'reading');
	});

	test('editor 未就绪（getEditor 返 null）→ 挂 pending 不报错', () => {
		const viewCtxKey = Symbol();
		const optionsCtxKey = Symbol();
		const applier = createViewModeApplier({
			getEditor: () => null,
			editorViewCtx: viewCtxKey,
			editorViewOptionsCtx: optionsCtxKey,
		});

		applier.setSessionReady(true);
		applier.apply('reading'); // 不应抛
		assert.strictEqual(applier.getPending(), 'reading', 'editor 缺席时 mode 挂 pending');
		assert.strictEqual(applier.getLastApplied(), null);
	});
});

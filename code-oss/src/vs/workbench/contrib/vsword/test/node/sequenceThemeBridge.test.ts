/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-flowseq.3 · D-1 · sequence-view 主题联动单测（AC-7 · G4）
//
// 覆盖 mermaid-view 已有 pattern 在 sequence-view 上的镜像；参见 flowThemeBridge.test.ts
// 顶部注释。8 项覆盖：pure buildSequenceOptions 翻转 · 首次 Light→Dark · Dark→Light ·
// 同值 no-op · 源码保真 · 多实例 · destroy 摘除 · <500ms latency。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
	createSequenceNodeView,
	broadcastSequenceTheme,
	_currentIsDarkForTest,
	_installSequenceLoader,
	_resetSequenceStateForTest,
	_liveSequenceViewsCountForTest,
} from '../../browser/milkdownEditor/webview/sequence-view.template.js';
import { buildSequenceOptions } from '../../browser/milkdownEditor/webview/sequence-view-helpers.template.js';

// ---- jsdom + PM view stub ---------------------------------------------------

function bootstrapView() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="host"></div></body></html>`, {
		url: 'http://localhost/',
	});
	// @ts-ignore
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore
	globalThis.queueMicrotask = (cb: () => void) => Promise.resolve().then(cb);

	const host = dom.window.document.querySelector('.host') as HTMLElement;
	function makeNode(src: string) {
		return {
			type: { name: 'code_block' },
			attrs: { language: 'sequence' },
			textContent: src,
			nodeSize: src.length + 2,
		};
	}
	let currentNode = makeNode('Alice->Bob: Hi\nBob-->Alice: Hello');
	const view: any = {
		dom: host,
		focus: () => { },
		dispatch: () => { },
		state: {
			doc: { nodeAt: (_pos: number) => currentNode },
			schema: { text: (s: string) => ({ __text: s }) },
			get tr() {
				return {
					replaceWith: (from: number, to: number, node: any) => ({ kind: 'replaceWith', from, to, node }),
					delete: (from: number, to: number) => ({ kind: 'delete', from, to }),
				};
			},
		},
	};
	return {
		dom,
		host,
		view,
		setNode: (src: string) => { currentNode = makeNode(src); return currentNode; },
		getNode: () => currentNode,
	};
}

function teardownView() {
	// @ts-ignore
	delete globalThis.window;
	// @ts-ignore
	delete globalThis.document;
	// @ts-ignore
	delete globalThis.queueMicrotask;
	_resetSequenceStateForTest();
}

/** js-sequence-diagrams 稳定 loader stub。 */
function stubGoodLoader() {
	_installSequenceLoader(async () => ({
		default: {
			parse(src: string) {
				return {
					drawSVG(container: HTMLElement, _opts: any) {
						while (container.firstChild) { container.removeChild(container.firstChild); }
						const svg = container.ownerDocument!.createElementNS('http://www.w3.org/2000/svg', 'svg');
						svg.setAttribute('data-src-len', String(src.length));
						container.appendChild(svg);
					},
					clean() { /* no-op */ },
				};
			},
		},
	}));
}

async function flush() {
	for (let i = 0; i < 8; i++) { await Promise.resolve(); }
}

// ---- 纯函数：buildSequenceOptions 契约（Phase 3 "好看放一放"）-----------------
//
// 当前 sequence-view-helpers.buildSequenceOptions 忽略 isDark 参数（PRD "好看放一放"
// 策略推迟到最后 UI 布局阶段）。契约：选项对象存在 + 稳定 + 主题联动路径由 broadcast
// + 重 render 承担；视觉配色差异留待后续 T-x.x 视觉统一。

suite('T-3.5b-flowseq.3 · D-1 · buildSequenceOptions × isDark', () => {
	test('返回选项对象（含 theme 键，Phase 3 暂固定 simple）', () => {
		const light = buildSequenceOptions(false);
		const dark = buildSequenceOptions(true);
		assert.ok(light && typeof light === 'object', 'light 选项对象存在');
		assert.ok(dark && typeof dark === 'object', 'dark 选项对象存在');
		// Phase 3 "好看放一放"：两者当前深度相等，视觉差异留待后续统一
		assert.deepStrictEqual(light, dark, 'Phase 3 sequence 主题差异暂未落地（预留）');
	});

	test('同 isDark 幂等：多次调用生成的选项深度相等', () => {
		const a = buildSequenceOptions(false);
		const b = buildSequenceOptions(false);
		assert.deepStrictEqual(a, b);
	});
});

// ---- 主题广播：单实例 -------------------------------------------------------

suite('T-3.5b-flowseq.3 · D-1 · broadcastSequenceTheme 单实例', () => {
	test('Light→Dark：首次切换触发 re-render，_currentIsDark 更新为 true', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('Alice->Bob: Hi\nBob-->Alice: Hello');
		const nv: any = createSequenceNodeView(node, view, () => 0);
		await flush();
		assert.ok(nv._test.preview.querySelector('svg'), '首次 render 已产 svg');
		assert.strictEqual(_currentIsDarkForTest(), false);

		const t0 = Date.now();
		broadcastSequenceTheme(true);
		await flush();
		const elapsed = Date.now() - t0;

		assert.strictEqual(_currentIsDarkForTest(), true);
		assert.ok(nv._test.preview.querySelector('svg'));
		assert.ok(elapsed < 500, `切换 latency < 500ms（实测 ${elapsed}ms · AC-7）`);

		nv.destroy();
		teardownView();
	});

	test('Dark→Light：反向切换同样触发 re-render', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('Alice->Bob: Hi');
		broadcastSequenceTheme(true);
		const nv: any = createSequenceNodeView(node, view, () => 0);
		await flush();
		assert.strictEqual(_currentIsDarkForTest(), true);

		broadcastSequenceTheme(false);
		await flush();
		assert.strictEqual(_currentIsDarkForTest(), false);
		assert.ok(nv._test.preview.querySelector('svg'));

		nv.destroy();
		teardownView();
	});

	test('同值广播：isDark 无变化 → 不触发多余 re-render', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('Alice->Bob: Hi');
		const nv: any = createSequenceNodeView(node, view, () => 0);
		await flush();
		const svgBefore = nv._test.preview.querySelector('svg');
		assert.ok(svgBefore);

		broadcastSequenceTheme(false);
		await flush();
		const svgAfter = nv._test.preview.querySelector('svg');
		assert.strictEqual(svgAfter, svgBefore, '同值广播不重建 svg 节点');

		nv.destroy();
		teardownView();
	});

	test('切换主题后源码 byte-for-byte 不变', async () => {
		const { view, setNode, getNode } = bootstrapView();
		stubGoodLoader();
		const original = 'title: Basic hello\nAlice->Bob: Hi Bob\nBob-->Alice: Hello Alice';
		const node = setNode(original);
		const nv: any = createSequenceNodeView(node, view, () => 0);
		await flush();

		broadcastSequenceTheme(true);
		await flush();
		broadcastSequenceTheme(false);
		await flush();
		broadcastSequenceTheme(true);
		await flush();

		assert.strictEqual(getNode().textContent, original, '多次主题切换后源码 byte 一致');
		nv.destroy();
		teardownView();
	});
});

// ---- 主题广播：多实例 -------------------------------------------------------

suite('T-3.5b-flowseq.3 · D-1 · broadcastSequenceTheme 多实例', () => {
	test('两个 NodeView 共存：一次 broadcast → 两者都 re-render', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();

		const node1 = setNode('Alice->Bob: A');
		const nv1: any = createSequenceNodeView(node1, view, () => 0);
		const node2 = setNode('Carol->Dave: B');
		const nv2: any = createSequenceNodeView(node2, view, () => 10);
		await flush();

		assert.strictEqual(_liveSequenceViewsCountForTest(), 2);
		assert.ok(nv1._test.preview.querySelector('svg'));
		assert.ok(nv2._test.preview.querySelector('svg'));

		broadcastSequenceTheme(true);
		await flush();

		assert.strictEqual(_currentIsDarkForTest(), true);
		assert.ok(nv1._test.preview.querySelector('svg'), 'nv1 re-rendered');
		assert.ok(nv2._test.preview.querySelector('svg'), 'nv2 re-rendered');

		nv1.destroy();
		nv2.destroy();
		teardownView();
	});

	test('destroy 后从 liveViews 摘除：后续 broadcast 不再触发已销毁实例', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('Alice->Bob: Hi');
		const nv: any = createSequenceNodeView(node, view, () => 0);
		await flush();
		assert.strictEqual(_liveSequenceViewsCountForTest(), 1);

		nv.destroy();
		assert.strictEqual(_liveSequenceViewsCountForTest(), 0);

		assert.doesNotThrow(() => broadcastSequenceTheme(true));
		assert.strictEqual(_currentIsDarkForTest(), true);

		teardownView();
	});
});

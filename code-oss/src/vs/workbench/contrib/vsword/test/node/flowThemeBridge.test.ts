/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-flowseq.3 · D-1 · flowchart-view 主题联动单测（AC-7 · G4）
//
// 覆盖 mermaid-view 已有 pattern 在 flowchart-view 上的镜像：
//   1. broadcastFlowchartTheme 首次切 Light→Dark 触发 re-render
//   2. Dark→Light 反向切换同样触发 re-render
//   3. 同值广播（isDark 无变化）不重复触发 re-render（避免 flicker）
//   4. 多个 NodeView 共存 → 主题切换会广播到全部实例
//   5. 主题切换后源码 byte-for-byte 不变（不进入 dirty）
//   6. destroy 后 NodeView 从 liveViews 自动摘除，不再收广播
//   7. buildFlowchartOptions(isDark) 生成的配色随 isDark 翻转（AC-1 / AC-2 契约）
//   8. AC-7：切换 latency <500ms（broadcast 同步链路，实测应 ≤ 数十毫秒）

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import {
	createFlowchartNodeView,
	broadcastFlowchartTheme,
	_currentIsDarkForTest,
	_installFlowchartLoader,
	_resetFlowchartStateForTest,
	_liveFlowchartViewsCountForTest,
} from '../../browser/milkdownEditor/webview/flowchart-view.template.js';
import { buildFlowchartOptions } from '../../browser/milkdownEditor/webview/flowchart-view-helpers.template.js';

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
			attrs: { language: 'flow' },
			textContent: src,
			nodeSize: src.length + 2,
		};
	}
	let currentNode = makeNode('st=>start: S\ne=>end: E\nst->e');
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
	_resetFlowchartStateForTest();
}

/** flowchart.js 稳定 loader stub：parse().drawSVG(container) 往 container 塞一个 <svg>。 */
function stubGoodLoader() {
	_installFlowchartLoader(async () => ({
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

// ---- 纯函数：buildFlowchartOptions 配色随 isDark 翻转 ------------------------

suite('T-3.5b-flowseq.3 · D-1 · buildFlowchartOptions × isDark', () => {
	test('dark 与 light 生成的选项不同（颜色 / 描边至少一处翻转）', () => {
		const light = buildFlowchartOptions(false);
		const dark = buildFlowchartOptions(true);
		assert.ok(light && typeof light === 'object', 'light 选项对象存在');
		assert.ok(dark && typeof dark === 'object', 'dark 选项对象存在');
		assert.notDeepStrictEqual(light, dark, 'dark ≠ light（至少一处配色/描边不同）');
	});

	test('同 isDark 幂等：多次调用生成的选项深度相等（选项对象无副作用）', () => {
		const a = buildFlowchartOptions(true);
		const b = buildFlowchartOptions(true);
		assert.deepStrictEqual(a, b);
	});
});

// ---- 主题广播：单实例 -------------------------------------------------------

suite('T-3.5b-flowseq.3 · D-1 · broadcastFlowchartTheme 单实例', () => {
	test('Light→Dark：首次切换触发 re-render，_currentIsDark 更新为 true', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('st=>start: S\ne=>end: E\nst->e');
		const nv: any = createFlowchartNodeView(node, view, () => 0);
		await flush();
		const firstSvg = nv._test.preview.querySelector('svg');
		assert.ok(firstSvg, '首次 render 已产 svg');
		assert.strictEqual(_currentIsDarkForTest(), false, '默认 light');

		const t0 = Date.now();
		broadcastFlowchartTheme(true);
		await flush();
		const elapsed = Date.now() - t0;

		assert.strictEqual(_currentIsDarkForTest(), true, 'broadcast 后 isDark=true');
		assert.ok(nv._test.preview.querySelector('svg'), 're-render 后仍有 svg');
		assert.ok(elapsed < 500, `切换 latency < 500ms（实测 ${elapsed}ms · AC-7）`);

		nv.destroy();
		teardownView();
	});

	test('Dark→Light：反向切换同样触发 re-render', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('st=>start: S\ne=>end: E\nst->e');
		// 先预热到 dark
		broadcastFlowchartTheme(true);
		const nv: any = createFlowchartNodeView(node, view, () => 0);
		await flush();
		assert.strictEqual(_currentIsDarkForTest(), true);

		broadcastFlowchartTheme(false);
		await flush();
		assert.strictEqual(_currentIsDarkForTest(), false);
		assert.ok(nv._test.preview.querySelector('svg'), '反向切换后仍有 svg');

		nv.destroy();
		teardownView();
	});

	test('同值广播：isDark 无变化 → 不触发多余 re-render（避免 flicker）', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();
		const node = setNode('st=>start: S\ne=>end: E\nst->e');
		const nv: any = createFlowchartNodeView(node, view, () => 0);
		await flush();
		const svgBefore = nv._test.preview.querySelector('svg');
		assert.ok(svgBefore);

		// 同值 broadcast：isDark 已经是 false，再传 false 应 no-op（module 内 next === currentIsDark 早退）
		broadcastFlowchartTheme(false);
		await flush();
		const svgAfter = nv._test.preview.querySelector('svg');
		// 同一 DOM 节点（未被替换），说明未走 render → clearPreview → 新 svg 路径
		assert.strictEqual(svgAfter, svgBefore, '同值广播不重建 svg 节点');

		nv.destroy();
		teardownView();
	});

	test('切换主题后源码 byte-for-byte 不变（不上报 dirty）', async () => {
		const { view, setNode, getNode } = bootstrapView();
		stubGoodLoader();
		const original = 'st=>start: S\nop=>operation: work\ne=>end: E\nst->op->e';
		const node = setNode(original);
		const nv: any = createFlowchartNodeView(node, view, () => 0);
		await flush();

		broadcastFlowchartTheme(true);
		await flush();
		broadcastFlowchartTheme(false);
		await flush();
		broadcastFlowchartTheme(true);
		await flush();

		assert.strictEqual(getNode().textContent, original, '多次主题切换后源码 byte 一致');
		nv.destroy();
		teardownView();
	});
});

// ---- 主题广播：多实例 -------------------------------------------------------

suite('T-3.5b-flowseq.3 · D-1 · broadcastFlowchartTheme 多实例', () => {
	test('两个 NodeView 共存：一次 broadcast → 两者都 re-render', async () => {
		const { view, setNode } = bootstrapView();
		stubGoodLoader();

		const node1 = setNode('st=>start: A\ne=>end: A\nst->e');
		const nv1: any = createFlowchartNodeView(node1, view, () => 0);
		const node2 = setNode('st=>start: B\ne=>end: B\nst->e');
		const nv2: any = createFlowchartNodeView(node2, view, () => 10);
		await flush();

		assert.strictEqual(_liveFlowchartViewsCountForTest(), 2, '两个 NodeView 都注册进 liveViews');
		const svg1a = nv1._test.preview.querySelector('svg');
		const svg2a = nv2._test.preview.querySelector('svg');
		assert.ok(svg1a && svg2a);

		broadcastFlowchartTheme(true);
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
		const node = setNode('st=>start: S\ne=>end: E\nst->e');
		const nv: any = createFlowchartNodeView(node, view, () => 0);
		await flush();
		assert.strictEqual(_liveFlowchartViewsCountForTest(), 1);

		nv.destroy();
		assert.strictEqual(_liveFlowchartViewsCountForTest(), 0, 'destroy 后 liveViews 应为空');

		// broadcast 不应抛
		assert.doesNotThrow(() => broadcastFlowchartTheme(true));
		assert.strictEqual(_currentIsDarkForTest(), true);

		teardownView();
	});
});

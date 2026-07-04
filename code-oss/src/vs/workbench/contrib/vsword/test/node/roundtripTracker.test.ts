/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.1 · roundtrip parser-hook + tracker plugin 单元测试。
// parser-hook: 纯 remark AST 遍历，无 DOM 依赖；
// tracker:    ProseMirror Plugin — 用 mock 的 state + tr + step 对象即可跑，
//             也不需要 jsdom（不接触 view / dom）。

import * as assert from 'assert';
import {
	buildSessionFromMdast,
	packSessionReady,
	computeCoverage as hookComputeCoverage,
	VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE,
} from '../../browser/milkdownEditor/webview/roundtrip-parser-hook.template.js';
import {
	createRoundtripTrackerPlugin,
	getDirtyBlocks,
	packDirtyBlockContents,
	resetTracker,
	__TEST__,
} from '../../browser/milkdownEditor/webview/roundtrip-tracker.template.js';
import { BlockIdAllocator } from '../../browser/milkdownEditor/roundtrip/blockIdAllocator.js';

// ---- parser-hook: buildSessionFromMdast ------------------------------------

/** 一个最小 mdast 构造 helper —— 只填 position.offset，parser-hook 只需要这个。 */
function mdastNode(from: number, to: number, type = 'paragraph') {
	return {
		type,
		position: { start: { offset: from }, end: { offset: to } },
	};
}

suite('T-3.8.1 · buildSessionFromMdast', () => {
	test('空 root → 空 session', () => {
		const alloc = new BlockIdAllocator();
		const s = buildSessionFromMdast({ type: 'root', children: [] }, '', 1, alloc);
		assert.strictEqual(s.blockOrder.length, 0);
		assert.strictEqual(s.blockRanges.size, 0);
		assert.strictEqual(s.interstitial.length, 1);
		assert.deepStrictEqual(s.interstitial[0], [0, 0]);
	});

	test('单段 → 单块 + 2 段 interstitial', () => {
		const alloc = new BlockIdAllocator();
		const src = 'hello world';
		const root = { type: 'root', children: [mdastNode(0, 11)] };
		const s = buildSessionFromMdast(root, src, 1, alloc);
		assert.strictEqual(s.blockOrder.length, 1);
		const id = s.blockOrder[0];
		assert.deepStrictEqual(s.blockRanges.get(id), [0, 11]);
		assert.strictEqual(s.interstitial.length, 2);
		assert.deepStrictEqual(s.interstitial[0], [0, 0]);
		assert.deepStrictEqual(s.interstitial[1], [11, 11]);
		assert.strictEqual(s.coverage, 1);
	});

	test('三段带 interstitial（空行）', () => {
		const alloc = new BlockIdAllocator();
		const src = 'a\n\nb\n\nc';   // 长度 7；块位置 [0,1] [3,4] [6,7]
		const root = {
			type: 'root',
			children: [mdastNode(0, 1), mdastNode(3, 4), mdastNode(6, 7)],
		};
		const s = buildSessionFromMdast(root, src, 2, alloc);
		assert.deepStrictEqual(s.blockOrder.length, 3);
		assert.deepStrictEqual(s.interstitial, [[0, 0], [1, 3], [4, 6], [7, 7]]);
		assert.strictEqual(s.coverage, 3 / 7);
		assert.strictEqual(s.mapping.length, 3);
		// mapping 顺序 = blockOrder 顺序
		assert.strictEqual(s.mapping[0].blockId, s.blockOrder[0]);
		assert.strictEqual(s.mapping[2].blockId, s.blockOrder[2]);
	});

	test('yaml frontmatter 也进 blockOrder（AC-6）', () => {
		const alloc = new BlockIdAllocator();
		const src = '---\nx: 1\n---\n\nbody';
		const root = {
			type: 'root',
			children: [mdastNode(0, 12, 'yaml'), mdastNode(14, 18, 'paragraph')],
		};
		const s = buildSessionFromMdast(root, src, 1, alloc);
		assert.strictEqual(s.blockOrder.length, 2);
		assert.strictEqual(s.mapping[0].mdastNode.type, 'yaml');
	});

	test('缺 position 的节点被跳过', () => {
		const alloc = new BlockIdAllocator();
		const bad: any = { type: 'paragraph' };  // 无 position
		const root = { type: 'root', children: [mdastNode(0, 3), bad, mdastNode(5, 8)] };
		const s = buildSessionFromMdast(root, 'abc\n\nxyz', 1, alloc);
		assert.strictEqual(s.blockOrder.length, 2);
	});

	test('range 越界 sourceText 被跳过（防御性）', () => {
		const alloc = new BlockIdAllocator();
		const root = { type: 'root', children: [mdastNode(0, 3), mdastNode(2, 100)] };
		const s = buildSessionFromMdast(root, 'abc', 1, alloc);
		assert.strictEqual(s.blockOrder.length, 1);
	});

	test('coverage 与 computeCoverage 一致', () => {
		const alloc = new BlockIdAllocator();
		const src = 'aaaa    bbbb';  // 12 chars，两个 4-字块
		const root = { type: 'root', children: [mdastNode(0, 4), mdastNode(8, 12)] };
		const s = buildSessionFromMdast(root, src, 1, alloc);
		assert.strictEqual(s.coverage, 8 / 12);
		assert.strictEqual(hookComputeCoverage(src, s.blockRanges.values()), s.coverage);
	});
});

suite('T-3.8.1 · packSessionReady', () => {
	test('打包 Map → Record', () => {
		const alloc = new BlockIdAllocator();
		const src = 'a\n\nb';
		const root = { type: 'root', children: [mdastNode(0, 1), mdastNode(3, 4)] };
		const s = buildSessionFromMdast(root, src, 7, alloc);
		const msg = packSessionReady(s, { hasBOM: false, newlineStyle: 'LF' });
		assert.strictEqual(msg.type, 'sessionReady');
		assert.strictEqual(msg.epoch, 7);
		assert.strictEqual(Object.keys(msg.blockRanges).length, 2);
		assert.strictEqual(msg.interstitial.length, 3);
		assert.strictEqual(msg.hasBOM, false);
		assert.strictEqual(msg.newlineStyle, 'LF');
	});
	test('safe 反映阈值', () => {
		const alloc = new BlockIdAllocator();
		const src = 'x'.repeat(100);
		const root = { type: 'root', children: [mdastNode(0, 40)] };  // 40/100 = 0.4
		const s = buildSessionFromMdast(root, src, 1, alloc);
		const msg = packSessionReady(s, { hasBOM: false, newlineStyle: 'none' });
		assert.strictEqual(msg.safe, false);
		assert.ok(s.coverage < VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE);
	});
});

// ---- tracker plugin --------------------------------------------------------

// Mock: 一个最小 EditorState / Node / Transaction / Step。tracker 只用到 doc.forEach
// 以及 tr.steps / tr.docChanged / tr.getMeta，我们全部 stub 掉。

interface FakeNode {
	attrs: { blockId?: string };
	nodeSize: number;
}
interface FakeDoc {
	forEach(cb: (child: FakeNode, offset: number) => void): void;
}
function fakeDoc(children: FakeNode[]): FakeDoc {
	return {
		forEach(cb) {
			let off = 0;
			for (const c of children) {
				cb(c, off);
				off += c.nodeSize;
			}
		},
	};
}
function fakeState(doc: FakeDoc) {
	return { doc };
}

/** 假 step —— 用一个已给定的 map({from,to} → 映射到 pre-step 的 [from,to]) 兜底。 */
function fakeStep(oldStart: number, oldEnd: number) {
	return {
		getMap() {
			return {
				forEach(cb: (a: number, b: number) => void) {
					cb(oldStart, oldEnd);
				},
			};
		},
	};
}
function fakeTr(steps: any[], docChanged = true, meta: any = null) {
	return {
		steps,
		docChanged,
		getMeta(_key: any) { return meta; },
	};
}

suite('T-3.8.1 · tracker: init', () => {
	test('init 采集 top-level attrs.blockId', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_aaaaaaaa');
		alloc.reserve('b_bbbbbbbb');
		const doc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 },
			{ attrs: { blockId: 'b_bbbbbbbb' }, nodeSize: 4 },
		]);
		const plugin = createRoundtripTrackerPlugin({
			allocator: alloc as any,
			getSessionEpoch: () => 42,
		});
		const state: any = plugin.spec.state!.init({}, fakeState(doc) as any);
		assert.strictEqual(state.sessionEpoch, 42);
		assert.strictEqual(state.dirtyBlocks.size, 0);
		assert.strictEqual(state.blockIdByPos.get(0), 'b_aaaaaaaa');
		assert.strictEqual(state.blockIdByPos.get(3), 'b_bbbbbbbb');
	});
});

suite('T-3.8.1 · tracker: apply', () => {
	test('docChanged=false → 返回原值不变', () => {
		const alloc = new BlockIdAllocator();
		const doc = fakeDoc([{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 }]);
		const plugin = createRoundtripTrackerPlugin({
			allocator: alloc as any,
			getSessionEpoch: () => 1,
		});
		const initial = plugin.spec.state!.init({}, fakeState(doc) as any);
		alloc.reserve('b_aaaaaaaa');
		const tr = fakeTr([], false);
		const next = plugin.spec.state!.apply(tr as any, initial, fakeState(doc) as any, fakeState(doc) as any);
		assert.strictEqual(next, initial);
	});

	test('修改现有块 → 该块被标 dirty', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_aaaaaaaa');
		alloc.reserve('b_bbbbbbbb');
		const oldDoc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 },
			{ attrs: { blockId: 'b_bbbbbbbb' }, nodeSize: 4 },
		]);
		const newDoc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 5 },  // 变长
			{ attrs: { blockId: 'b_bbbbbbbb' }, nodeSize: 4 },
		]);
		const plugin = createRoundtripTrackerPlugin({
			allocator: alloc as any,
			getSessionEpoch: () => 1,
		});
		const initial = plugin.spec.state!.init({}, fakeState(oldDoc) as any);
		// step: 在 pre-step 位置 [1, 2] 做替换 —— 命中 b_aaaaaaaa（pos [0, 3)）
		const tr = fakeTr([fakeStep(1, 2)]);
		const next: any = plugin.spec.state!.apply(tr as any, initial, {} as any, fakeState(newDoc) as any);
		assert.ok(next.dirtyBlocks.has('b_aaaaaaaa'));
		assert.ok(!next.dirtyBlocks.has('b_bbbbbbbb'));
	});

	test('split 出的新块自动分配 id 并标 dirty', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_aaaaaaaa');
		const oldDoc = fakeDoc([{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 6 }]);
		// split 之后：第一半保留 id，第二半没 id（新块）
		const newDoc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 },
			{ attrs: {}, nodeSize: 3 },
		]);
		const plugin = createRoundtripTrackerPlugin({
			allocator: alloc as any,
			getSessionEpoch: () => 1,
		});
		const initial = plugin.spec.state!.init({}, fakeState(oldDoc) as any);
		const tr = fakeTr([fakeStep(3, 3)]);  // insert-only 在中间
		const next: any = plugin.spec.state!.apply(tr as any, initial, {} as any, fakeState(newDoc) as any);
		// 应该有 2 个块被 tracked
		assert.strictEqual(next.blockIdByPos.size, 2);
		// 新分配的 id 也在 dirty 里
		const newIds = [...next.dirtyBlocks].filter((id: string) => id !== 'b_aaaaaaaa');
		assert.strictEqual(newIds.length, 1);
	});

	test('merge：两块合并 → 被吞块的 id 被 release', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_aaaaaaaa');
		alloc.reserve('b_bbbbbbbb');
		const oldDoc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 },
			{ attrs: { blockId: 'b_bbbbbbbb' }, nodeSize: 4 },
		]);
		const newDoc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 7 },   // 合成一块
		]);
		const plugin = createRoundtripTrackerPlugin({
			allocator: alloc as any,
			getSessionEpoch: () => 1,
		});
		const initial = plugin.spec.state!.init({}, fakeState(oldDoc) as any);
		const tr = fakeTr([fakeStep(3, 3)]);
		plugin.spec.state!.apply(tr as any, initial, {} as any, fakeState(newDoc) as any);
		assert.strictEqual(alloc.has('b_bbbbbbbb'), false, 'b_bbbbbbbb 应被 release');
		assert.strictEqual(alloc.has('b_aaaaaaaa'), true, 'b_aaaaaaaa 保留');
	});

	test('reset meta 清空 dirty 并重扫', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_aaaaaaaa');
		const doc = fakeDoc([{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 }]);
		const plugin = createRoundtripTrackerPlugin({
			allocator: alloc as any,
			getSessionEpoch: () => 1,
		});
		const initial = plugin.spec.state!.init({}, fakeState(doc) as any);
		// 先制造 dirty
		const dirtied = { ...initial, dirtyBlocks: new Set(['b_aaaaaaaa']) };
		const tr = fakeTr([], true, { kind: 'reset', epoch: 99 });
		const next: any = plugin.spec.state!.apply(tr as any, dirtied, {} as any, fakeState(doc) as any);
		assert.strictEqual(next.sessionEpoch, 99);
		assert.strictEqual(next.dirtyBlocks.size, 0);
	});
});

suite('T-3.8.1 · tracker: 内部 helper', () => {
	test('collectTopLevel 从 doc 采位置', () => {
		const doc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 },
			{ attrs: {}, nodeSize: 4 },
		]);
		const m = __TEST__.collectTopLevel(doc as any);
		assert.strictEqual(m.get(0), 'b_aaaaaaaa');
		assert.strictEqual(m.get(3), '');  // sentinel
	});
});

suite('T-3.8.1 · tracker: getters 与 packDirtyBlockContents', () => {
	function attachPluginState<T>(state: any, key: any, value: T) {
		// 模拟 PM PluginKey.getState —— getState 拿 state.plugins[…]。
		// 我们不构造真实 pluginStates；改成让 getState 直接读一个自定义 field。
		// tracker.template.js 里 getTrackerState 调用 ROUNDTRIP_TRACKER_KEY.getState(state)。
		// 用 defineProperty 拦截。
		Object.defineProperty(state, '__pluginStateOverride__', { value });
		const origGetState = key.getState;
		key.getState = (s: any) => s.__pluginStateOverride__ ?? origGetState.call(key, s);
	}

	test('getDirtyBlocks 无 tracker → 空数组', () => {
		assert.deepStrictEqual(getDirtyBlocks({} as any), []);
	});

	test('packDirtyBlockContents 只序列化 dirty 块', () => {
		const doc = fakeDoc([
			{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 },
			{ attrs: { blockId: 'b_bbbbbbbb' }, nodeSize: 4 },
		]);
		const state: any = fakeState(doc);
		attachPluginState(state, __TEST__.ROUNDTRIP_TRACKER_KEY, {
			sessionEpoch: 1,
			dirtyBlocks: new Set(['b_aaaaaaaa']),
			blockIdByPos: new Map([[0, 'b_aaaaaaaa'], [3, 'b_bbbbbbbb']]),
		});
		const contents = packDirtyBlockContents(state, () => 'STUB');
		assert.deepStrictEqual(contents, { b_aaaaaaaa: 'STUB' });
	});

	test('packDirtyBlockContents 序列化失败 → 忽略该块（走全文降级路径）', () => {
		const doc = fakeDoc([{ attrs: { blockId: 'b_aaaaaaaa' }, nodeSize: 3 }]);
		const state: any = fakeState(doc);
		attachPluginState(state, __TEST__.ROUNDTRIP_TRACKER_KEY, {
			sessionEpoch: 1,
			dirtyBlocks: new Set(['b_aaaaaaaa']),
			blockIdByPos: new Map([[0, 'b_aaaaaaaa']]),
		});
		const contents = packDirtyBlockContents(state, () => { throw new Error('bad'); });
		assert.deepStrictEqual(contents, {});
	});
});

suite('T-3.8.1 · tracker: resetTracker dispatches meta', () => {
	test('view.dispatch 收到带 reset meta 的 tr', () => {
		let dispatched: any = null;
		const view: any = {
			state: {
				tr: {
					setMeta(key: any, value: any) {
						dispatched = { key, value };
						return this;
					},
				},
			},
			dispatch(tr: any) { /* no-op */ },
		};
		resetTracker(view, 33);
		assert.ok(dispatched);
		assert.strictEqual(dispatched.value.kind, 'reset');
		assert.strictEqual(dispatched.value.epoch, 33);
	});
});

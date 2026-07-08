/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.a · Find plugin + 匹配算法单测。
//
// 直接消费 find-widget-helpers.template.js 4 个纯函数：
//   computeMatches / escapeRegExp / applyReplaceOne / applyReplaceAll
// 以及 find-plugin.template.js 的 _buildDecorationSet（class 值断言）。
//
// mock 策略：
//   · doc 用手工对象模拟 { descendants(fn) } — 遍历几个 text 节点（pos + text.isText=true）
//   · view 用最小对象 { state: { schema, tr }, dispatch }；tr 只需能链式 replaceWith/delete
//   · Decoration / DecorationSet 走真 @milkdown/prose/view（builder 里已 install）
//
// 覆盖 PRD §6 拆分表 10 条 case（C1-C10）。

import * as assert from 'assert';
import {
	computeMatches,
	escapeRegExp,
	applyReplaceOne,
	applyReplaceAll,
} from '../../browser/milkdownEditor/webview/find-widget-helpers.template.js';
import { _buildDecorationSet, createFindPlugin, findPluginKey } from '../../browser/milkdownEditor/webview/find-plugin.template.js';

// ---------------------------------------------------------------------------
// mock helpers
// ---------------------------------------------------------------------------

interface MockTextNode {
	isText: true;
	text: string;
}
interface MockDoc {
	descendants(fn: (node: MockTextNode, pos: number) => boolean | void): void;
}

/**
 * 造一个「行为像 PM doc」的对象：给一个 (pos, text) 数组，按顺序 descend。
 * 每段之间留 1 char gap（模拟 block 边界，PM 语义 block boundary 占 1 pos）。
 */
function makeDoc(segments: Array<{ pos: number; text: string }>): MockDoc {
	return {
		descendants(fn) {
			for (const seg of segments) {
				fn({ isText: true, text: seg.text }, seg.pos);
			}
		},
	};
}

/** 生成一个包含 non-text atom 节点的 doc — 验证 descendants 只处理 isText=true。 */
function makeMixedDoc(segments: Array<{ pos: number; text?: string; atom?: boolean }>): MockDoc {
	return {
		descendants(fn) {
			for (const seg of segments) {
				if (seg.atom) {
					// atom NodeView 语义：isText=false，且 return true 让 caller 继续下钻，
					// 但内部无 text 子节点。这里我们只调一次 fn 传一个非 text 节点，让
					// computeMatches 的 `if (!node.isText) return true` 分支被走到。
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					fn({ isText: false } as any, seg.pos);
				} else {
					fn({ isText: true, text: seg.text ?? '' }, seg.pos);
				}
			}
		},
	};
}

/**
 * 造一个「行为像 PM EditorView」的对象：view.state.tr 是一个可 replaceWith / delete
 * 的 mutable object；替换后我们把 (from, to, text) 追加到 replacements 数组以便断言。
 */
interface FakeReplacement { from: number; to: number; text: string; op: 'replace' | 'delete'; }
interface FakeTr {
	replaceWith(from: number, to: number, node: { text: string }): FakeTr;
	delete(from: number, to: number): FakeTr;
	__replacements: FakeReplacement[];
}
interface FakeView {
	dispatched: FakeTr[];
	state: {
		schema: { text(t: string): { text: string } };
		tr: FakeTr;
	};
	dispatch(tr: FakeTr): void;
}

function makeView(): FakeView {
	function makeTr(): FakeTr {
		const tr: FakeTr = {
			__replacements: [],
			replaceWith(from, to, node) {
				this.__replacements.push({ from, to, text: node.text, op: 'replace' });
				return this;
			},
			delete(from, to) {
				this.__replacements.push({ from, to, text: '', op: 'delete' });
				return this;
			},
		};
		return tr;
	}
	const view: FakeView = {
		dispatched: [],
		state: {
			schema: { text: (t: string) => ({ text: t }) },
			// 每次读 tr 都给新的（模拟 PM 每次 state.tr 返回一个 fresh Transaction）。
			get tr() { return makeTr(); },
		} as unknown as FakeView['state'],
		dispatch(tr) { this.dispatched.push(tr); },
	};
	// 上面 getter 每次 new 一个 tr，但 applyReplaceAll 需要在同一个 tr 上累积多次。
	// 改成 lazy：view.state.tr 第一次访问后固化，直到 dispatch 后再重置。
	let cached: FakeTr | null = null;
	Object.defineProperty(view.state, 'tr', {
		configurable: true,
		get() {
			if (!cached) { cached = makeTr(); }
			return cached;
		},
	});
	const origDispatch = view.dispatch.bind(view);
	view.dispatch = function (tr: FakeTr) {
		origDispatch(tr);
		cached = null;
	};
	return view;
}

// ---------------------------------------------------------------------------
// escapeRegExp（间接覆盖 · C5/C7 内部依赖）
// ---------------------------------------------------------------------------

suite('T-3.7c.3.a · escapeRegExp', () => {
	test('转义 12 个 RegExp 元字符', () => {
		assert.strictEqual(escapeRegExp('a.b'), 'a\\.b');
		assert.strictEqual(escapeRegExp('a*b'), 'a\\*b');
		assert.strictEqual(escapeRegExp('a+b'), 'a\\+b');
		assert.strictEqual(escapeRegExp('a?b'), 'a\\?b');
		assert.strictEqual(escapeRegExp('^a'), '\\^a');
		assert.strictEqual(escapeRegExp('a$'), 'a\\$');
		assert.strictEqual(escapeRegExp('{a}'), '\\{a\\}');
		assert.strictEqual(escapeRegExp('(a)'), '\\(a\\)');
		assert.strictEqual(escapeRegExp('a|b'), 'a\\|b');
		assert.strictEqual(escapeRegExp('[a]'), '\\[a\\]');
		assert.strictEqual(escapeRegExp('a\\b'), 'a\\\\b');
	});

	test('空串 · undefined · 非字符串 → 空串（防御）', () => {
		assert.strictEqual(escapeRegExp(''), '');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		assert.strictEqual(escapeRegExp(null as any), '');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		assert.strictEqual(escapeRegExp(undefined as any), '');
	});
});

// ---------------------------------------------------------------------------
// computeMatches · C1-C8
// ---------------------------------------------------------------------------

suite('T-3.7c.3.a · computeMatches · 边界', () => {
	test('C1 · 空 query → []', () => {
		const doc = makeDoc([{ pos: 1, text: 'foo bar' }]);
		assert.deepStrictEqual(computeMatches(doc as any, '', { caseSensitive: false, wholeWord: false, useRegex: false }), []);
	});

	test('C2 · 空 doc（descendants 无 text 节点）→ []', () => {
		const doc = makeDoc([]);
		assert.deepStrictEqual(computeMatches(doc as any, 'foo', { caseSensitive: false, wholeWord: false, useRegex: false }), []);
	});

	test('C2b · 空 text 节点被跳过（避免 re.exec 死循环）', () => {
		const doc = makeDoc([{ pos: 1, text: '' }, { pos: 2, text: 'foo' }]);
		const out = computeMatches(doc as any, 'foo', { caseSensitive: false, wholeWord: false, useRegex: false });
		assert.strictEqual(out.length, 1);
		assert.strictEqual(out[0].from, 2);
		assert.strictEqual(out[0].to, 5);
	});
});

suite('T-3.7c.3.a · computeMatches · 选项', () => {
	test('C3 · caseSensitive:false（默认）→ 大小写不敏感', () => {
		const doc = makeDoc([{ pos: 0, text: 'Foo foo FOO' }]);
		const out = computeMatches(doc as any, 'foo', { caseSensitive: false, wholeWord: false, useRegex: false });
		assert.strictEqual(out.length, 3);
	});

	test('C3b · caseSensitive:true → 严格大小写', () => {
		const doc = makeDoc([{ pos: 0, text: 'Foo foo FOO' }]);
		const out = computeMatches(doc as any, 'foo', { caseSensitive: true, wholeWord: false, useRegex: false });
		assert.strictEqual(out.length, 1);
		assert.strictEqual(out[0].from, 4);
		assert.strictEqual(out[0].to, 7);
		assert.strictEqual(out[0].text, 'foo');
	});

	test('C4 · wholeWord:true → 拒非整词', () => {
		const doc = makeDoc([{ pos: 0, text: 'foo foobar barfoo foo!' }]);
		const out = computeMatches(doc as any, 'foo', { caseSensitive: true, wholeWord: true, useRegex: false });
		// 命中：doc 开头 "foo"、末尾 "foo!" 中的 foo（后接 !，非 word）
		// 拒识：foobar / barfoo（\b 边界不成立）
		assert.strictEqual(out.length, 2);
		assert.strictEqual(out[0].text, 'foo');
		assert.strictEqual(out[1].text, 'foo');
	});

	test('C5 · useRegex:true → 走用户 raw pattern', () => {
		const doc = makeDoc([{ pos: 0, text: 'abc 123 def 456' }]);
		const out = computeMatches(doc as any, '\\d+', { caseSensitive: true, wholeWord: false, useRegex: true });
		assert.strictEqual(out.length, 2);
		assert.strictEqual(out[0].text, '123');
		assert.strictEqual(out[1].text, '456');
	});

	test('C6 · 非法 regex → []（try/catch 兜底 · 不抛）', () => {
		const doc = makeDoc([{ pos: 0, text: 'abc' }]);
		const out = computeMatches(doc as any, '(unclosed', { caseSensitive: false, wholeWord: false, useRegex: true });
		assert.deepStrictEqual(out, []);
	});

	test('C7 · 空匹配 `.*` 不死循环（re.lastIndex++ 兜底）', () => {
		const doc = makeDoc([{ pos: 0, text: 'ab' }]);
		const start = Date.now();
		const out = computeMatches(doc as any, '.*', { caseSensitive: true, wholeWord: false, useRegex: true });
		const elapsed = Date.now() - start;
		assert.ok(elapsed < 1000, `.* pattern 不应死循环，实际耗时 ${elapsed}ms`);
		// `.*` 在 'ab' 上会命中：先匹配 'ab'（非空 · length=2） → lastIndex=2 →
		// 再 exec 返回空匹配 → lastIndex++ 推进到 3 → return null。所以至少有 1 条非空匹配。
		assert.ok(out.length >= 1, '.* 至少要命中一次非空匹配');
	});

	test('C7b · 空匹配 `\\b` 也不死循环', () => {
		const doc = makeDoc([{ pos: 0, text: 'foo bar' }]);
		const start = Date.now();
		computeMatches(doc as any, '\\b', { caseSensitive: true, wholeWord: false, useRegex: true });
		const elapsed = Date.now() - start;
		assert.ok(elapsed < 1000, `\\b pattern 不应死循环，实际耗时 ${elapsed}ms`);
	});

	test('C8 · 跨多个 text 节点 · 每节点独立扫描 · 各自算 pos', () => {
		// 模拟三个段落：pos=1 "hello foo", pos=15 "foo world", pos=30 "no match here"
		const doc = makeDoc([
			{ pos: 1, text: 'hello foo' },
			{ pos: 15, text: 'foo world' },
			{ pos: 30, text: 'no match here' },
		]);
		const out = computeMatches(doc as any, 'foo', { caseSensitive: true, wholeWord: false, useRegex: false });
		assert.strictEqual(out.length, 2);
		// pos=1 段：'foo' 位于 offset 6 → doc pos = 1 + 6 = 7
		assert.strictEqual(out[0].from, 7);
		assert.strictEqual(out[0].to, 10);
		// pos=15 段：'foo' 位于 offset 0 → doc pos = 15 + 0 = 15
		assert.strictEqual(out[1].from, 15);
		assert.strictEqual(out[1].to, 18);
	});

	test('C8b · atom NodeView（isText=false）被跳过 · 不产生匹配', () => {
		// atom 段无 text 子节点 · computeMatches 完全不看它。
		const doc = makeMixedDoc([
			{ pos: 1, text: 'foo' },
			{ pos: 10, atom: true }, // 一个 non-text atom 节点，内部无 text 子节点
			{ pos: 20, text: 'foo' },
		]);
		const out = computeMatches(doc as any, 'foo', { caseSensitive: true, wholeWord: false, useRegex: false });
		assert.strictEqual(out.length, 2);
		assert.strictEqual(out[0].from, 1);
		assert.strictEqual(out[1].from, 20);
	});
});

// ---------------------------------------------------------------------------
// applyReplaceOne · C10
// ---------------------------------------------------------------------------

suite('T-3.7c.3.a · applyReplaceOne', () => {
	test('C10 · 单条替换 · dispatch 一次 tr · 返回下一个 activeIndex hint', () => {
		const view = makeView();
		const state = {
			widgetOpen: true,
			query: 'foo',
			options: { caseSensitive: true, wholeWord: false, useRegex: false },
			matches: [
				{ from: 5, to: 8, text: 'foo' },
				{ from: 20, to: 23, text: 'foo' },
				{ from: 40, to: 43, text: 'foo' },
			],
			activeIndex: 0,
			invalidRegex: false,
			replacement: 'bar',
		};
		const next = applyReplaceOne(view as any, state as any, 'bar');
		assert.strictEqual(view.dispatched.length, 1, '应 dispatch 一次');
		const tr = view.dispatched[0];
		assert.strictEqual(tr.__replacements.length, 1, 'tr 内只累积 1 条 replace');
		assert.deepStrictEqual(tr.__replacements[0], { from: 5, to: 8, text: 'bar', op: 'replace' });
		// hint：min(0, 3-2) = 0（表示下一次 findNext 走 index 0 → doc-changed listener 会重算）
		assert.strictEqual(next, 0);
	});

	test('reading mode → 不 dispatch · return -1', () => {
		const view = makeView();
		const state = {
			widgetOpen: true, query: 'foo',
			options: { caseSensitive: true, wholeWord: false, useRegex: false },
			matches: [{ from: 5, to: 8, text: 'foo' }],
			activeIndex: 0, invalidRegex: false, replacement: 'bar', mode: 'reading',
		};
		const next = applyReplaceOne(view as any, state as any, 'bar');
		assert.strictEqual(view.dispatched.length, 0);
		assert.strictEqual(next, -1);
	});

	test('activeIndex 越界 / 空 matches → 不 dispatch · return -1', () => {
		const view = makeView();
		const state = {
			widgetOpen: true, query: 'x',
			options: { caseSensitive: false, wholeWord: false, useRegex: false },
			matches: [], activeIndex: -1, invalidRegex: false,
		};
		assert.strictEqual(applyReplaceOne(view as any, state as any, 'y'), -1);
		assert.strictEqual(view.dispatched.length, 0);
	});

	test('空 replacement → 走 tr.delete', () => {
		const view = makeView();
		const state = {
			widgetOpen: true, query: 'foo',
			options: { caseSensitive: true, wholeWord: false, useRegex: false },
			matches: [{ from: 5, to: 8, text: 'foo' }],
			activeIndex: 0, invalidRegex: false,
		};
		applyReplaceOne(view as any, state as any, '');
		assert.strictEqual(view.dispatched.length, 1);
		assert.strictEqual(view.dispatched[0].__replacements[0].op, 'delete');
	});
});

// ---------------------------------------------------------------------------
// applyReplaceAll · C9（**必测** · PRD §6 反向遍历 offset 一致性）
// ---------------------------------------------------------------------------

suite('T-3.7c.3.a · applyReplaceAll', () => {
	test('C9 · 10+ 匹配 · 反向遍历 · 单 tr 累积 · 每步用原始 from/to', () => {
		const view = makeView();
		// 构造 12 个匹配，from/to 递增
		const matches = [];
		for (let i = 0; i < 12; i++) {
			matches.push({ from: 10 + i * 20, to: 13 + i * 20, text: 'foo' });
		}
		const state = {
			widgetOpen: true, query: 'foo',
			options: { caseSensitive: true, wholeWord: false, useRegex: false },
			matches, activeIndex: 0, invalidRegex: false,
		};
		const count = applyReplaceAll(view as any, state as any, 'BARBAZ');
		assert.strictEqual(count, 12);
		assert.strictEqual(view.dispatched.length, 1, '应只 dispatch 一次 tr（undo 一次撤销）');
		const tr = view.dispatched[0];
		assert.strictEqual(tr.__replacements.length, 12, 'tr 累积 12 条 replace');
		// 关键断言：**反向**遍历 · 第一条 replace 是最后一个 match（index 11）
		assert.strictEqual(tr.__replacements[0].from, 10 + 11 * 20);
		assert.strictEqual(tr.__replacements[0].to, 13 + 11 * 20);
		// 最后一条 replace 是第一个 match（index 0）
		assert.strictEqual(tr.__replacements[11].from, 10);
		assert.strictEqual(tr.__replacements[11].to, 13);
		// 每一条 from/to 都是**原始** matches 里的坐标 · 不经过任何 mapping 偏移
		for (let i = 0; i < 12; i++) {
			const reverseIdx = 11 - i;
			assert.strictEqual(tr.__replacements[i].from, matches[reverseIdx].from,
				`第 ${i} 条 replace 应对应原始 matches[${reverseIdx}].from`);
			assert.strictEqual(tr.__replacements[i].to, matches[reverseIdx].to);
			assert.strictEqual(tr.__replacements[i].text, 'BARBAZ');
		}
	});

	test('reading mode → 不 dispatch · return 0', () => {
		const view = makeView();
		const state = {
			widgetOpen: true, query: 'foo',
			options: { caseSensitive: true, wholeWord: false, useRegex: false },
			matches: [{ from: 5, to: 8, text: 'foo' }, { from: 15, to: 18, text: 'foo' }],
			activeIndex: 0, invalidRegex: false, mode: 'reading',
		};
		const n = applyReplaceAll(view as any, state as any, 'bar');
		assert.strictEqual(n, 0);
		assert.strictEqual(view.dispatched.length, 0);
	});

	test('空 matches → 0 · 不 dispatch', () => {
		const view = makeView();
		const state = {
			widgetOpen: true, query: 'x',
			options: { caseSensitive: false, wholeWord: false, useRegex: false },
			matches: [], activeIndex: -1, invalidRegex: false,
		};
		assert.strictEqual(applyReplaceAll(view as any, state as any, 'y'), 0);
		assert.strictEqual(view.dispatched.length, 0);
	});

	test('空 replacement 全删 · 走 tr.delete · 反向', () => {
		const view = makeView();
		const state = {
			widgetOpen: true, query: 'foo',
			options: { caseSensitive: true, wholeWord: false, useRegex: false },
			matches: [
				{ from: 5, to: 8, text: 'foo' },
				{ from: 20, to: 23, text: 'foo' },
			],
			activeIndex: 0, invalidRegex: false,
		};
		applyReplaceAll(view as any, state as any, '');
		const tr = view.dispatched[0];
		assert.strictEqual(tr.__replacements.length, 2);
		assert.strictEqual(tr.__replacements[0].op, 'delete');
		assert.strictEqual(tr.__replacements[0].from, 20); // 反向：先删后面那个
		assert.strictEqual(tr.__replacements[1].from, 5);
	});
});

// ---------------------------------------------------------------------------
// _buildDecorationSet · createFindPlugin（结构级 sanity）
// ---------------------------------------------------------------------------

suite('T-3.7c.3.a · plugin 结构', () => {
	test('findPluginKey 是 PluginKey 实例', () => {
		assert.ok(findPluginKey);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		assert.ok(typeof (findPluginKey as any).get === 'function' || typeof (findPluginKey as any).getState === 'function');
	});

	test('createFindPlugin 返回 Plugin 实例 · 有 spec.state.init / apply', () => {
		const p = createFindPlugin(() => ({
			widgetOpen: false, query: '', options: { caseSensitive: false, wholeWord: false, useRegex: false },
			matches: [], activeIndex: -1, invalidRegex: false,
		}));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const spec = (p as any).spec;
		assert.ok(spec);
		assert.ok(spec.state);
		assert.strictEqual(typeof spec.state.init, 'function');
		assert.strictEqual(typeof spec.state.apply, 'function');
		assert.ok(spec.props);
		assert.strictEqual(typeof spec.props.decorations, 'function');
	});

	test('createFindPlugin 未传 getFindState · 兜底不抛 · 返回空 DecorationSet', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = createFindPlugin(undefined as any);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const spec = (p as any).spec;
		const init = spec.state.init();
		assert.ok(init);
	});

	test('_buildDecorationSet 空 matches → DecorationSet.empty', () => {
		const ds = _buildDecorationSet({} as any, [], -1);
		assert.ok(ds);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		assert.strictEqual((ds as any).find().length, 0);
	});
});

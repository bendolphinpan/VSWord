/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.3 · Round-trip 协议契约测试。
//
// 5 个 case 覆盖 T-3.8.1 wire 协议关键路径：
//   1) sessionReady 消息形状 —— webview 首次 parse 完把 range-map 交给 host。
//   2) markdownUpdated · dirtyBlocks / dirtyBlockContents 上报 —— Qd1=a webview 上报。
//   3) sessionEpoch 落后的 markdownUpdated 应视作 outdated（host 侧决策：忽略 or 走 C）。
//   4) dirty blockId 越界 → pickSavePath 降级 C（session outdated 的行为契约）。
//   5) formatDocument / formatSelection 主机 → webview 命令消息形状。
//
// 全部纯数据结构断言，不需要 jsdom / Milkdown。

import * as assert from 'assert';
import {
	buildSessionFromMdast,
	packSessionReady,
} from '../../browser/milkdownEditor/webview/roundtrip-parser-hook.template.js';
import {
	BlockIdAllocator,
} from '../../browser/milkdownEditor/roundtrip/blockIdAllocator.js';
import {
	createRoundtripSession,
} from '../../browser/milkdownEditor/roundtrip/roundtripSession.js';
import {
	pickSavePath,
} from '../../browser/milkdownEditor/roundtrip/roundtripSerializer.js';
import {
	VSWORD_MILKDOWN_FORMAT_DOCUMENT_ACTION_ID,
	VSWORD_MILKDOWN_FORMAT_SELECTION_ACTION_ID,
} from '../../browser/milkdownEditor/milkdownEditorProtocol.js';
import type {
	HostToWebviewMessage,
	WebviewToHostMessage,
	WebviewSessionReadyMessage,
	WebviewMarkdownUpdatedMessage,
	HostFormatDocumentMessage,
	HostFormatSelectionMessage,
	WebviewImeCompositionChangedMessage,
} from '../../browser/milkdownEditor/milkdownEditorProtocol.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mdastNode(from: number, to: number, type = 'paragraph') {
	return { type, position: { start: { offset: from }, end: { offset: to } } };
}

// ---------------------------------------------------------------------------
// case 1: sessionReady 消息形状（wire contract）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip Protocol · case 1 sessionReady 消息形状', () => {
	test('packSessionReady 输出所有必填字段 + safe 由 coverage 决定', () => {
		const alloc = new BlockIdAllocator();
		const src = 'first para\n\nsecond para\n';
		const root = {
			type: 'root',
			children: [mdastNode(0, 10), mdastNode(12, 23)],
		};
		const data = buildSessionFromMdast(root as any, src, 7, alloc);
		const msg = packSessionReady(data, { hasBOM: false, newlineStyle: 'LF' });

		// 类型判别字段
		assert.strictEqual(msg.type, 'sessionReady');
		// 全字段存在
		assert.strictEqual(msg.epoch, 7);
		assert.ok(Array.isArray(msg.blockOrder));
		assert.strictEqual(msg.blockOrder.length, 2);
		assert.ok(msg.blockRanges && typeof msg.blockRanges === 'object');
		assert.strictEqual(Object.keys(msg.blockRanges).length, 2);
		assert.ok(Array.isArray(msg.interstitial));
		assert.strictEqual(msg.interstitial.length, 3);   // blockOrder.length + 1
		assert.strictEqual(typeof msg.coverage, 'number');
		assert.strictEqual(typeof msg.hasBOM, 'boolean');
		assert.strictEqual(typeof msg.newlineStyle, 'string');
		assert.strictEqual(typeof msg.safe, 'boolean');

		// 语义校验：blockRanges 里每对 range 都是 [number, number]
		for (const [id, r] of Object.entries(msg.blockRanges)) {
			assert.ok(Array.isArray(r) && r.length === 2, `range for ${id}`);
			assert.strictEqual(typeof (r as any)[0], 'number');
			assert.strictEqual(typeof (r as any)[1], 'number');
		}

		// 契约上必须能构造 IRoundtripSession
		const bmap = new Map<string, [number, number]>();
		for (const [k, v] of Object.entries(msg.blockRanges)) { bmap.set(k, [v[0], v[1]]); }
		const s = createRoundtripSession({
			epoch: msg.epoch,
			sourceText: src,
			blockOrder: msg.blockOrder,
			blockRanges: bmap,
			interstitial: msg.interstitial.map(r => [r[0], r[1]] as [number, number]),
		});
		assert.strictEqual(s.epoch, 7);
		assert.strictEqual(s.blockOrder.length, 2);
	});

	test('packSessionReady 类型系统兼容 WebviewSessionReadyMessage', () => {
		const alloc = new BlockIdAllocator();
		const root = { type: 'root', children: [mdastNode(0, 4)] };
		const data = buildSessionFromMdast(root as any, 'abcd', 1, alloc);
		const msg = packSessionReady(data, { hasBOM: false, newlineStyle: 'none' });
		// 结构性断言 —— 把它当 WebviewSessionReadyMessage 用。
		const asMsg: WebviewSessionReadyMessage = {
			type: 'sessionReady',
			epoch: msg.epoch,
			blockOrder: msg.blockOrder,
			blockRanges: msg.blockRanges as Record<string, readonly [number, number]>,
			interstitial: msg.interstitial as readonly (readonly [number, number])[],
			coverage: msg.coverage,
			hasBOM: msg.hasBOM,
			newlineStyle: msg.newlineStyle as any,
			safe: msg.safe,
		};
		assert.strictEqual(asMsg.type, 'sessionReady');
	});
});

// ---------------------------------------------------------------------------
// case 2: markdownUpdated · dirtyBlocks / dirtyBlockContents 上报 (Qd1=a)
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip Protocol · case 2 markdownUpdated 携带 dirty 信息', () => {
	test('dirtyBlocks + dirtyBlockContents 一一对应；host 侧解码后可用于 pickSavePath', () => {
		// 模拟一个真实 wire 消息（webview → host）
		const wire: WebviewMarkdownUpdatedMessage = {
			type: 'markdownUpdated',
			markdown: 'full doc',
			dirtyBlocks: ['b_00000001', 'b_00000002'],
			dirtyBlockContents: { b_00000001: 'new content A', b_00000002: 'new content B' },
			sessionEpoch: 1,
		};

		// 契约：dirtyBlockContents 的 key 应覆盖 dirtyBlocks 的每一项。
		for (const id of wire.dirtyBlocks!) {
			assert.strictEqual(typeof wire.dirtyBlockContents![id], 'string', `content for ${id}`);
		}

		// host 侧还需要 session；构一个 safe session，让 pickSavePath 拿到 B。
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_00000001');
		alloc.reserve('b_00000002');
		const src = 'AAAAAAAAAA\nBBBBBBBBBB';
		const session = createRoundtripSession({
			epoch: 1,
			sourceText: src,
			blockOrder: ['b_00000001', 'b_00000002'],
			blockRanges: new Map<string, [number, number]>([
				['b_00000001', [0, 10]],
				['b_00000002', [11, 21]],
			]),
			interstitial: [[0, 0], [10, 11], [21, 21]],
		});
		assert.strictEqual(session.isSafe(), true);
		const p = pickSavePath({
			session,
			dirtyBlockIds: wire.dirtyBlocks as readonly string[],
			dirtyBlockContents: wire.dirtyBlockContents ?? null,
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'B');
	});

	test('markdownUpdated 允许 dirtyBlocks 缺省 —— 视作整篇 dirty', () => {
		const wire: WebviewMarkdownUpdatedMessage = { type: 'markdownUpdated', markdown: 'x' };
		assert.strictEqual(wire.dirtyBlocks, undefined);
		// host 侧把 undefined 映射为 null（=整篇 dirty）传给 pickSavePath → C。
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_00000001');
		const s = createRoundtripSession({
			epoch: 1,
			sourceText: 'AAAAAAAAAA\nBBBBBBBBBB',
			blockOrder: ['b_00000001'],
			blockRanges: new Map<string, [number, number]>([['b_00000001', [0, 20]]]),
			interstitial: [[0, 0], [20, 21]],
		});
		const p = pickSavePath({
			session: s,
			dirtyBlockIds: null,
			dirtyBlockContents: null,
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});
});

// ---------------------------------------------------------------------------
// case 3: sessionEpoch 版本协商 —— 落后的 markdownUpdated 应被忽略
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip Protocol · case 3 sessionEpoch 版本协商', () => {
	test('markdownUpdated.sessionEpoch < 当前 session.epoch → host 应忽略', () => {
		// 主机侧策略（契约级断言 —— 这里编码为 helper predicate）：
		//   若 wire.sessionEpoch 存在且 < session.epoch，视作 outdated，dirty 信息作废，
		//   host 走 C（全文降级）或直接丢弃这条消息。
		function isOutdated(wire: WebviewMarkdownUpdatedMessage, sessionEpoch: number): boolean {
			return typeof wire.sessionEpoch === 'number' && wire.sessionEpoch < sessionEpoch;
		}
		const wireOld: WebviewMarkdownUpdatedMessage = {
			type: 'markdownUpdated', markdown: 'x', sessionEpoch: 3,
			dirtyBlocks: ['b_00000001'],
			dirtyBlockContents: { b_00000001: 'stale' },
		};
		const wireCurrent: WebviewMarkdownUpdatedMessage = { ...wireOld, sessionEpoch: 5 };
		assert.strictEqual(isOutdated(wireOld, 5), true);
		assert.strictEqual(isOutdated(wireCurrent, 5), false);
	});

	test('sessionEpoch === session.epoch → 消息 in-sync, host 正常消费', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_00000001');
		const s = createRoundtripSession({
			epoch: 5,
			sourceText: 'AAAAAAAAAA\nBBBBBBBBBB',
			blockOrder: ['b_00000001'],
			blockRanges: new Map<string, [number, number]>([['b_00000001', [0, 20]]]),
			interstitial: [[0, 0], [20, 21]],
		});
		const wire: WebviewMarkdownUpdatedMessage = {
			type: 'markdownUpdated', markdown: 'x', sessionEpoch: 5,
			dirtyBlocks: ['b_00000001'],
			dirtyBlockContents: { b_00000001: 'fresh' },
		};
		// epoch 一致 → 送给 pickSavePath，应得 B。
		assert.strictEqual(wire.sessionEpoch, s.epoch);
		const p = pickSavePath({
			session: s,
			dirtyBlockIds: wire.dirtyBlocks as readonly string[],
			dirtyBlockContents: wire.dirtyBlockContents ?? null,
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'B');
	});
});

// ---------------------------------------------------------------------------
// case 4: dirty blockId 越界 → pickSavePath 降级 C（session outdated 契约）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip Protocol · case 4 dirty blockId 越界降级 C', () => {
	test('wire 携带 session 不认识的 blockId → C', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_00000001');
		const s = createRoundtripSession({
			epoch: 1,
			sourceText: 'AAAAAAAAAA\nBBBBBBBBBB',
			blockOrder: ['b_00000001'],
			blockRanges: new Map<string, [number, number]>([['b_00000001', [0, 20]]]),
			interstitial: [[0, 0], [20, 21]],
		});
		const p = pickSavePath({
			session: s,
			// 一 known + 一 unknown
			dirtyBlockIds: ['b_00000001', 'b_zzzzzzzz'],
			dirtyBlockContents: { b_00000001: 'x', b_zzzzzzzz: 'y' },
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('wire 携带的 blockId 数量与 contents 不匹配 → C', () => {
		const alloc = new BlockIdAllocator();
		alloc.reserve('b_00000001');
		const s = createRoundtripSession({
			epoch: 1,
			sourceText: 'AAAAAAAAAA\nBBBBBBBBBB',
			blockOrder: ['b_00000001'],
			blockRanges: new Map<string, [number, number]>([['b_00000001', [0, 20]]]),
			interstitial: [[0, 0], [20, 21]],
		});
		const p = pickSavePath({
			session: s,
			dirtyBlockIds: ['b_00000001'],
			dirtyBlockContents: {},  // 缺内容
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});
});

// ---------------------------------------------------------------------------
// case 5: formatDocument / formatSelection 主机 → webview 命令消息形状
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip Protocol · case 5 format 命令消息', () => {
	test('HostFormatDocumentMessage 只有 type 字段，值为 formatDocument', () => {
		const msg: HostFormatDocumentMessage = { type: 'formatDocument' };
		assert.strictEqual(msg.type, 'formatDocument');
		// 加入 union：仍然 type-safe
		const asUnion: HostToWebviewMessage = msg;
		assert.strictEqual(asUnion.type, 'formatDocument');
	});

	test('HostFormatSelectionMessage 只有 type 字段，值为 formatSelection', () => {
		const msg: HostFormatSelectionMessage = { type: 'formatSelection' };
		assert.strictEqual(msg.type, 'formatSelection');
		const asUnion: HostToWebviewMessage = msg;
		assert.strictEqual(asUnion.type, 'formatSelection');
	});

	test('两个 action id 常量匹配命令面板绑定约定', () => {
		assert.strictEqual(VSWORD_MILKDOWN_FORMAT_DOCUMENT_ACTION_ID, 'vsword.milkdown.formatDocument');
		assert.strictEqual(VSWORD_MILKDOWN_FORMAT_SELECTION_ACTION_ID, 'vsword.milkdown.formatSelection');
	});
});

// ---------------------------------------------------------------------------
// case 6: imeCompositionChanged · webview → host（T-3.12.1.b）
// ---------------------------------------------------------------------------

suite('VSWord Roundtrip Protocol · case 6 imeCompositionChanged 序列化对称', () => {
	test('composing:true / false 双向 JSON 序列化 → 反序列化 布尔位保真', () => {
		const on: WebviewImeCompositionChangedMessage = { type: 'imeCompositionChanged', composing: true };
		const off: WebviewImeCompositionChangedMessage = { type: 'imeCompositionChanged', composing: false };

		// 走一遍 JSON round-trip（postMessage 语义等价 —— structured clone 对
		// 纯 { type, composing:boolean } 与 JSON 等价，这里用 JSON 断言最小依赖）。
		const onRt = JSON.parse(JSON.stringify(on)) as WebviewImeCompositionChangedMessage;
		const offRt = JSON.parse(JSON.stringify(off)) as WebviewImeCompositionChangedMessage;

		assert.strictEqual(onRt.type, 'imeCompositionChanged');
		assert.strictEqual(offRt.type, 'imeCompositionChanged');
		assert.strictEqual(onRt.composing, true);
		assert.strictEqual(offRt.composing, false);
		// 严格布尔保真：不能出现 truthy 但非 true 的情况（避免 host 侧 !!msg.composing 掩盖 bug）。
		assert.strictEqual(typeof onRt.composing, 'boolean');
		assert.strictEqual(typeof offRt.composing, 'boolean');

		// 加入 union → 仍然 type-safe。
		const asUnion: WebviewToHostMessage = onRt;
		assert.strictEqual(asUnion.type, 'imeCompositionChanged');
	});
});

// keep the imports alive under noUnusedLocals
void ({} as WebviewToHostMessage);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.2 · roundtripSerializer 单测：pickSavePath 决策树 + assembleIncremental 拼接。
// 纯函数模块，无需 jsdom。

import * as assert from 'assert';
import {
	pickSavePath,
	assembleIncremental,
	encodeUtf8,
} from '../../browser/milkdownEditor/roundtrip/roundtripSerializer.js';
import {
	createRoundtripSession,
	IRoundtripSession,
	SrcRange,
} from '../../browser/milkdownEditor/roundtrip/roundtripSession.js';

// ---- test helpers ---------------------------------------------------------

/**
 * 构造一个 safe session 的最小 fixture。
 *   sourceText = "\uFEFFAAA\n\nBBB\nCCC\n"
 *   block b1 = "AAA" @ [1, 4)
 *   block b2 = "BBB\nCCC" @ [6, 13)
 *   interstitial: [ [0,1), [4,6), [13,14) ]   （首 BOM / 中间空行 / 尾 \n）
 * coverage = (3 + 7) / 14 ≈ 0.71 —— 低于 0.95 阈值，构造用另一个更长的样本。
 */
function makeSafeSession(): IRoundtripSession {
	//        0123456789
	// src = "AAAAA\nBBBBB\n"  长度 12；两个 block 覆盖 10；coverage = 10/12 = 0.833 —— 仍低。
	// 改成更紧凑：
	// src = "AAAAA\nBBBBB"  长度 11；两 block 覆盖 10；coverage = 10/11 = 0.909 —— 仍低。
	// src = "AAAA\nBBBB"     长度 9；两 block 覆盖 8；coverage = 8/9 = 0.888 —— 仍低。
	// src = "AAAAAAAAA\nBBBBBBBBB" 长 19；两 block 覆盖 18；coverage = 18/19 = 0.947 —— 仍低（< 0.95）。
	// src = "AAAAAAAAAA\nBBBBBBBBBB" 长 21；两 block 覆盖 20；coverage = 20/21 = 0.952 → OK。
	const src = 'AAAAAAAAAA\nBBBBBBBBBB';
	const blockOrder = ['b1', 'b2'] as const;
	const blockRanges = new Map<string, SrcRange>([
		['b1', [0, 10] as SrcRange],
		['b2', [11, 21] as SrcRange],
	]);
	const interstitial: SrcRange[] = [
		[0, 0],
		[10, 11],   // 中间那个 \n
		[21, 21],
	];
	return createRoundtripSession({
		epoch: 1,
		sourceText: src,
		blockOrder: [...blockOrder],
		blockRanges,
		interstitial,
	});
}

/** 构造一个 unsafe session（coverage 太低）。 */
function makeUnsafeSession(): IRoundtripSession {
	// 只覆盖 5 / 100 = 0.05 —— 远低于阈值。
	const src = 'X'.repeat(100);
	return createRoundtripSession({
		epoch: 2,
		sourceText: src,
		blockOrder: ['x1'],
		blockRanges: new Map<string, SrcRange>([['x1', [0, 5] as SrcRange]]),
		interstitial: [[0, 0], [5, 100]],
	});
}

// ---- pickSavePath ---------------------------------------------------------

suite('T-3.8.2 · pickSavePath', () => {
	test('forcePath=C 无条件走 C', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: [],
			dirtyBlockContents: {},
			openedBytes: new Uint8Array([1]),
			forcePath: 'C',
		});
		assert.strictEqual(p, 'C');
	});

	test('forcePath=B + safe session + dirty 已知 + contents 齐 → B', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: ['b1'],
			dirtyBlockContents: { b1: 'new content' },
			openedBytes: new Uint8Array([1]),
			forcePath: 'B',
		});
		assert.strictEqual(p, 'B');
	});

	test('forcePath=B 但 session 不安全 → C（正确性优先）', () => {
		const p = pickSavePath({
			session: makeUnsafeSession(),
			dirtyBlockIds: ['x1'],
			dirtyBlockContents: { x1: 'X' },
			openedBytes: new Uint8Array([1]),
			forcePath: 'B',
		});
		assert.strictEqual(p, 'C');
	});

	test('openedBytes 空 + 空 dirty → C（A 需要 bytes）', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: [],
			dirtyBlockContents: {},
			openedBytes: null,
		});
		assert.strictEqual(p, 'C');
	});

	test('session=null → C', () => {
		const p = pickSavePath({
			session: null,
			dirtyBlockIds: [],
			dirtyBlockContents: {},
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('session.isSafe()=false → C', () => {
		const p = pickSavePath({
			session: makeUnsafeSession(),
			dirtyBlockIds: [],
			dirtyBlockContents: {},
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('dirtyBlockIds=null（整篇 dirty）→ C', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: null,
			dirtyBlockContents: {},
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('空 dirty + openedBytes 齐 → A（byte-for-byte）', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: [],
			dirtyBlockContents: {},
			openedBytes: new Uint8Array([1, 2, 3]),
		});
		assert.strictEqual(p, 'A');
	});

	test('dirty 有 id 不在 session → C（session outdated）', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: ['b1', 'phantom'],
			dirtyBlockContents: { b1: 'x', phantom: 'y' },
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('dirtyBlockContents 覆盖不全 → C', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: ['b1'],
			dirtyBlockContents: {},  // 缺 b1 的内容
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('dirtyBlockContents=null → C', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: ['b1'],
			dirtyBlockContents: null,
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'C');
	});

	test('safe session + 已知 dirty + contents 齐 → B', () => {
		const p = pickSavePath({
			session: makeSafeSession(),
			dirtyBlockIds: ['b2'],
			dirtyBlockContents: { b2: 'BBB (edited)' },
			openedBytes: new Uint8Array([1]),
		});
		assert.strictEqual(p, 'B');
	});
});

// ---- assembleIncremental --------------------------------------------------

suite('T-3.8.2 · assembleIncremental', () => {
	test('空 dirty：结果 === sourceText 的 UTF-8 编码', () => {
		const session = makeSafeSession();
		const bytes = assembleIncremental(session, {});
		const dec = new TextDecoder('utf-8').decode(bytes);
		assert.strictEqual(dec, session.sourceText);
	});

	test('单块 dirty：只该块替换，interstitial 与另一块原样', () => {
		const session = makeSafeSession();
		const bytes = assembleIncremental(session, { b1: 'CCCC' });
		const dec = new TextDecoder('utf-8').decode(bytes);
		// b1=[0,10)→'CCCC'；interstitial[1]=[10,11)→'\n'；b2=[11,21)→原样。
		assert.strictEqual(dec, 'CCCC' + '\n' + 'BBBBBBBBBB');
	});

	test('双块 dirty：两块都替换', () => {
		const session = makeSafeSession();
		const bytes = assembleIncremental(session, {
			b1: 'first',
			b2: 'second',
		});
		const dec = new TextDecoder('utf-8').decode(bytes);
		assert.strictEqual(dec, 'first' + '\n' + 'second');
	});

	test('dirty 内容长度变化不影响 interstitial 原样保留', () => {
		const session = makeSafeSession();
		const bytes = assembleIncremental(session, { b1: 'A' });  // 从 10 char → 1 char
		const dec = new TextDecoder('utf-8').decode(bytes);
		// interstitial 依然是 [0,0)+[10,11)+[21,21) = '' + '\n' + ''
		assert.strictEqual(dec, 'A' + '\n' + 'BBBBBBBBBB');
	});

	test('unsafe session 抛异常', () => {
		const session = makeUnsafeSession();
		assert.throws(() => assembleIncremental(session, {}), /not safe/);
	});

	test('结果 Uint8Array 独立拥有底层 buffer', () => {
		const session = makeSafeSession();
		const bytes = assembleIncremental(session, {});
		assert.strictEqual(bytes.byteOffset, 0);
		assert.strictEqual(bytes.byteLength, bytes.buffer.byteLength);
	});

	test('BOM + CRLF 场景保真', () => {
		// src = BOM + A*40 + '\r\n' + B*40  长度 1+40+2+40 = 83；coverage = 80/83 ≈ 0.964，过阈值。
		// 核心断言：BOM 与 \r\n 均落在 interstitial，assembleIncremental 只重写 dirty 块，
		//         BOM+CRLF 原样保留（byte-for-byte）。
		const A40 = 'A'.repeat(40);
		const B40 = 'B'.repeat(40);
		const src = '\uFEFF' + A40 + '\r\n' + B40;
		const session = createRoundtripSession({
			epoch: 3,
			sourceText: src,
			blockOrder: ['b1', 'b2'],
			blockRanges: new Map<string, SrcRange>([
				['b1', [1, 41] as SrcRange],   // 跳过 BOM
				['b2', [43, 83] as SrcRange],  // 跳过 \r\n
			]),
			interstitial: [[0, 1], [41, 43], [83, 83]],
		});
		assert.strictEqual(session.isSafe(), true);
		const bytes = assembleIncremental(session, { b1: 'xxxx' });
		// 前 3 字节应是 EF BB BF（UTF-8 BOM）——这是 BOM 保真的核心断言。
		assert.strictEqual(bytes[0], 0xEF);
		assert.strictEqual(bytes[1], 0xBB);
		assert.strictEqual(bytes[2], 0xBF);
		// 用 ignoreBOM=true 解码，验证正文与 CRLF 完全原样保留。
		// （默认 TextDecoder 会静默吞 BOM，无法用于 byte 保真校验。）
		const dec = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
		assert.strictEqual(dec, '\uFEFF' + 'xxxx' + '\r\n' + B40);
	});

	test('encodeUtf8 与 TextEncoder 输出一致（sanity check）', () => {
		const bytes = encodeUtf8('中文 abc');
		const dec = new TextDecoder('utf-8').decode(bytes);
		assert.strictEqual(dec, '中文 abc');
	});
});

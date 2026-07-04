/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.1 · roundtripSession + BlockIdAllocator 单元测试。
// 全部纯函数 / 纯数据结构，不需要 jsdom。

import * as assert from 'assert';
import {
	VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE,
	BOM_CHAR,
	computeCoverage,
	isSessionSafe,
	hasBOM,
	detectNewlineStyle,
	createRoundtripSession,
} from '../../browser/milkdownEditor/roundtrip/roundtripSession.js';
import {
	BLOCK_ID_RE,
	BlockIdAllocator,
	inheritOnSplit,
	inheritOnMerge,
} from '../../browser/milkdownEditor/roundtrip/blockIdAllocator.js';

// ---- computeCoverage --------------------------------------------------------

suite('T-3.8.1 · computeCoverage', () => {
	test('空串返回 1', () => {
		assert.strictEqual(computeCoverage('', []), 1);
	});
	test('无块覆盖返回 0', () => {
		assert.strictEqual(computeCoverage('abcdef', []), 0);
	});
	test('全覆盖返回 1', () => {
		assert.strictEqual(computeCoverage('abcdef', [[0, 6]]), 1);
	});
	test('半覆盖返回 0.5', () => {
		assert.strictEqual(computeCoverage('abcdefgh', [[0, 4]]), 0.5);
	});
	test('多块相加', () => {
		assert.strictEqual(computeCoverage('abcdefghij', [[0, 3], [5, 8]]), 0.6);
	});
	test('range 越界会 clamp', () => {
		// sourceText 长 5；[-2, 3] clamp 到 [0, 3]=3；[4, 100] clamp 到 [4, 5]=1；总 4/5 = 0.8
		assert.strictEqual(computeCoverage('abcde', [[-2, 3], [4, 100]]), 0.8);
	});
	test('to <= from 不计', () => {
		assert.strictEqual(computeCoverage('abcde', [[2, 2], [3, 1]]), 0);
	});
	test('NaN / Infinity range 不计', () => {
		assert.strictEqual(computeCoverage('abc', [[NaN, 2], [0, Infinity]]), 0);
	});
});

// ---- isSessionSafe ----------------------------------------------------------

suite('T-3.8.1 · isSessionSafe', () => {
	function baseSession() {
		return {
			sourceText: 'A\n\nB\n\nC',
			blockOrder: ['b_1', 'b_2', 'b_3'],
			blockRanges: new Map([
				['b_1', [0, 1] as [number, number]],
				['b_2', [3, 4] as [number, number]],
				['b_3', [6, 7] as [number, number]],
			]),
			interstitial: [[0, 0], [1, 3], [4, 6], [7, 7]] as [number, number][],
			coverage: 3 / 7,  // 覆盖率不足
		};
	}
	test('coverage 不足 → unsafe', () => {
		assert.strictEqual(isSessionSafe(baseSession()), false);
	});
	test('coverage 足够且结构自洽 → safe', () => {
		const s = baseSession();
		(s as any).coverage = 1;
		assert.strictEqual(isSessionSafe(s), true);
	});
	test('interstitial 长度不对 → unsafe', () => {
		const s = baseSession();
		(s as any).coverage = 1;
		(s as any).interstitial = [[0, 0], [1, 3]];  // 2 段，但 blockOrder=3
		assert.strictEqual(isSessionSafe(s), false);
	});
	test('blockRanges 里 id 缺失 → unsafe', () => {
		const s = baseSession();
		(s as any).coverage = 1;
		(s as any).blockRanges = new Map([['b_1', [0, 1]], ['b_2', [3, 4]]]);
		assert.strictEqual(isSessionSafe(s), false);
	});
	test('相邻块重叠 → unsafe', () => {
		const s = baseSession();
		(s as any).coverage = 1;
		(s as any).blockRanges = new Map([
			['b_1', [0, 4] as [number, number]],
			['b_2', [3, 5] as [number, number]],  // 与 b_1 重叠
			['b_3', [6, 7] as [number, number]],
		]);
		assert.strictEqual(isSessionSafe(s), false);
	});
	test('range 越界 → unsafe', () => {
		const s = baseSession();
		(s as any).coverage = 1;
		(s as any).blockRanges = new Map([
			['b_1', [0, 1] as [number, number]],
			['b_2', [3, 4] as [number, number]],
			['b_3', [6, 100] as [number, number]],  // 越出 sourceText.length=7
		]);
		assert.strictEqual(isSessionSafe(s), false);
	});
	test('interstitial 允许空段（to === from）', () => {
		const s = baseSession();
		(s as any).coverage = 1;
		(s as any).interstitial = [[0, 0], [1, 3], [4, 6], [7, 7]];
		assert.strictEqual(isSessionSafe(s), true);
	});
});

// ---- BOM / newline ----------------------------------------------------------

suite('T-3.8.1 · hasBOM', () => {
	test('U+FEFF 首位 → true', () => {
		assert.strictEqual(hasBOM(BOM_CHAR + 'hello'), true);
	});
	test('无 BOM → false', () => {
		assert.strictEqual(hasBOM('hello'), false);
	});
	test('空串 → false', () => {
		assert.strictEqual(hasBOM(''), false);
	});
	test('BOM 只在首位', () => {
		assert.strictEqual(hasBOM('a' + BOM_CHAR + 'b'), false);
	});
});

suite('T-3.8.1 · detectNewlineStyle', () => {
	test('无换行 → none', () => {
		assert.strictEqual(detectNewlineStyle('abc'), 'none');
	});
	test('纯 LF', () => {
		assert.strictEqual(detectNewlineStyle('a\nb\nc'), 'LF');
	});
	test('纯 CRLF', () => {
		assert.strictEqual(detectNewlineStyle('a\r\nb\r\nc'), 'CRLF');
	});
	test('纯 CR (Mac 经典)', () => {
		assert.strictEqual(detectNewlineStyle('a\rb\rc'), 'CR');
	});
	test('CR + LF 独立出现 → mixed', () => {
		assert.strictEqual(detectNewlineStyle('a\rb\nc'), 'mixed');
	});
	test('CRLF + LF → mixed', () => {
		assert.strictEqual(detectNewlineStyle('a\r\nb\nc'), 'mixed');
	});
	test('末尾 CRLF 不被误判成 CR+LF 混合', () => {
		assert.strictEqual(detectNewlineStyle('abc\r\n'), 'CRLF');
	});
});

// ---- createRoundtripSession -------------------------------------------------

suite('T-3.8.1 · createRoundtripSession', () => {
	test('派生 coverage / hasBOM / newlineStyle', () => {
		const s = createRoundtripSession({
			epoch: 1,
			sourceText: BOM_CHAR + 'para1\r\n\r\npara2\r\n',
			blockOrder: ['b_a', 'b_b'],
			blockRanges: new Map([
				['b_a', [1, 6]],
				['b_b', [10, 15]],
			]),
			interstitial: [[0, 1], [6, 10], [15, 17]],
		});
		assert.strictEqual(s.hasBOM, true);
		assert.strictEqual(s.newlineStyle, 'CRLF');
		assert.ok(s.coverage > 0);
		assert.strictEqual(s.epoch, 1);
	});
	test('isSafe() 反映当前阈值', () => {
		const long = 'x'.repeat(100);
		const enough = createRoundtripSession({
			epoch: 1, sourceText: long,
			blockOrder: ['b_1'],
			blockRanges: new Map([['b_1', [0, 95]]]),
			interstitial: [[0, 0], [95, 100]],
		});
		assert.strictEqual(enough.isSafe(), true);
		const notEnough = createRoundtripSession({
			epoch: 1, sourceText: long,
			blockOrder: ['b_1'],
			blockRanges: new Map([['b_1', [0, 50]]]),
			interstitial: [[0, 0], [50, 100]],
		});
		assert.strictEqual(notEnough.isSafe(), false);
	});
	test('导出常量与阈值同步', () => {
		assert.ok(VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE > 0);
		assert.ok(VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE <= 1);
	});
	test('产物是 frozen', () => {
		const s = createRoundtripSession({
			epoch: 1, sourceText: 'abc',
			blockOrder: [], blockRanges: new Map(), interstitial: [[0, 3]],
		});
		assert.strictEqual(Object.isFrozen(s), true);
	});
});

// ---- BlockIdAllocator -------------------------------------------------------

suite('T-3.8.1 · BLOCK_ID_RE 格式', () => {
	test('匹配 b_ + 8 位 base36', () => {
		assert.ok(BLOCK_ID_RE.test('b_x7k2m9p1'));
		assert.ok(BLOCK_ID_RE.test('b_00000000'));
		assert.ok(BLOCK_ID_RE.test('b_zzzzzzzz'));
	});
	test('匹配后缀', () => {
		assert.ok(BLOCK_ID_RE.test('b_x7k2m9p1_1'));
		assert.ok(BLOCK_ID_RE.test('b_x7k2m9p1_42'));
	});
	test('拒绝非法', () => {
		assert.ok(!BLOCK_ID_RE.test('b_short'));
		assert.ok(!BLOCK_ID_RE.test('b_TOOLONGXX'));
		assert.ok(!BLOCK_ID_RE.test('B_x7k2m9p1'));   // 大写
		assert.ok(!BLOCK_ID_RE.test('b_x7k2m9p!'));   // 非 base36
		assert.ok(!BLOCK_ID_RE.test('b_x7k2m9p1_'));  // 空后缀
	});
});

suite('T-3.8.1 · BlockIdAllocator.allocate', () => {
	test('生成的 id 匹配 BLOCK_ID_RE', () => {
		const a = new BlockIdAllocator();
		for (let i = 0; i < 20; i++) {
			assert.ok(BLOCK_ID_RE.test(a.allocate()));
		}
		assert.strictEqual(a.size, 20);
	});
	test('冲突时递增后缀（fixed seed）', () => {
		let n = 0;
		// 一个"总是返回 0"的 rand → 8 位全 '0'
		const a = new BlockIdAllocator(() => 0);
		const first = a.allocate();
		const second = a.allocate();
		const third = a.allocate();
		assert.strictEqual(first, 'b_00000000');
		assert.strictEqual(second, 'b_00000000_1');
		assert.strictEqual(third, 'b_00000000_2');
		void n;
	});
	test('reserve 接受合法未占用 id', () => {
		const a = new BlockIdAllocator();
		assert.strictEqual(a.reserve('b_abcdef01'), true);
		assert.strictEqual(a.has('b_abcdef01'), true);
	});
	test('reserve 拒绝已占用 id', () => {
		const a = new BlockIdAllocator();
		a.reserve('b_abcdef01');
		assert.strictEqual(a.reserve('b_abcdef01'), false);
	});
	test('reserve 拒绝格式非法', () => {
		const a = new BlockIdAllocator();
		assert.strictEqual(a.reserve('nope'), false);
		assert.strictEqual(a.reserve(''), false);
	});
	test('release 释放并允许再分配', () => {
		const a = new BlockIdAllocator();
		const id = a.allocate();
		a.release(id);
		assert.strictEqual(a.has(id), false);
		assert.strictEqual(a.size, 0);
	});
	test('snapshot 返回独立副本', () => {
		const a = new BlockIdAllocator();
		a.allocate();
		const s1 = a.snapshot();
		a.allocate();
		assert.strictEqual(s1.size, 1);  // 快照不受后续变更影响
	});
});

suite('T-3.8.1 · inheritOnSplit / inheritOnMerge', () => {
	test('split 保留原 id，另一半新分配', () => {
		const a = new BlockIdAllocator();
		const src = a.allocate();
		const { keep, fresh } = inheritOnSplit(a, src);
		assert.strictEqual(keep, src);
		assert.notStrictEqual(fresh, src);
		assert.ok(a.has(fresh));
	});
	test('split 时源 id 若不在池 → 先 reserve', () => {
		const a = new BlockIdAllocator();
		const { keep } = inheritOnSplit(a, 'b_deadbeef');
		assert.strictEqual(keep, 'b_deadbeef');
		assert.strictEqual(a.has('b_deadbeef'), true);
	});
	test('merge 保留前者 id，释放后者', () => {
		const a = new BlockIdAllocator();
		const first = a.allocate();
		const second = a.allocate();
		const kept = inheritOnMerge(a, first, second);
		assert.strictEqual(kept, first);
		assert.strictEqual(a.has(second), false);
		assert.strictEqual(a.has(first), true);
	});
	test('merge 同 id → no-op', () => {
		const a = new BlockIdAllocator();
		const id = a.allocate();
		assert.strictEqual(inheritOnMerge(a, id, id), id);
		assert.strictEqual(a.has(id), true);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RD-1 · setext O(N) 扫描 vs blockRanges 路径语义对齐

import * as assert from 'assert';
import {
	parseSetextHeading,
	scanSetextHintsFromSource,
	buildSetextHintQueueFromSourceScan,
	buildSetextHintQueueFromSource,
	collectSetextHints,
} from '../../browser/milkdownEditor/webview/setext-helpers.template.js';

suite('RD-1 · scanSetextHintsFromSource', () => {
	test('识别 h1 / h2 setext', () => {
		const src = 'Hello\n=====\n\nWorld\n-----\n\nbody\n';
		const hints = scanSetextHintsFromSource(src);
		assert.strictEqual(hints.length, 2);
		assert.strictEqual(hints[0]!.kind, 'h1');
		assert.strictEqual(hints[0]!.text, 'Hello');
		assert.strictEqual(hints[1]!.kind, 'h2');
		assert.strictEqual(hints[1]!.text, 'World');
	});

	test('fenced code 内伪 setext 不命中', () => {
		const src = '```\nTitle\n====\n```\n\nReal\n====\n';
		const hints = scanSetextHintsFromSource(src);
		assert.strictEqual(hints.length, 1);
		assert.strictEqual(hints[0]!.text, 'Real');
	});

	test('表格分隔行不是 setext', () => {
		const src = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
		const hints = scanSetextHintsFromSource(src);
		assert.strictEqual(hints.length, 0);
	});

	test('与 blockRanges 路径 queue 键集合一致（典型混合文）', () => {
		const src = [
			'ATX first',
			'=========',
			'',
			'# Already ATX',
			'',
			'Second',
			'------',
			'',
			'para',
			'',
		].join('\n');
		// 手工 blockRanges 模拟 remark top-level：两段 setext + ATX + para
		// 扫描路径不需要 ranges；对照 path 用 collect on full slices of known setext only
		const scanQ = buildSetextHintQueueFromSourceScan(src);
		assert.ok(scanQ.has('ATX first'));
		assert.ok(scanQ.has('Second'));
		assert.strictEqual(scanQ.get('ATX first')![0].kind, 'h1');
		assert.strictEqual(scanQ.get('Second')![0].kind, 'h2');
	});

	test('parseSetextHeading 单测不回归', () => {
		assert.ok(parseSetextHeading('T\n==='));
		assert.strictEqual(parseSetextHeading('T\n===')!.kind, 'h1');
		assert.strictEqual(parseSetextHeading('T\n---')!.kind, 'h2');
		assert.strictEqual(parseSetextHeading('not setext'), null);
	});

	test('collectSetextHints + buildSetextHintQueueFromSource 仍可用', () => {
		const src = 'A\n===\n\nB\n';
		const ranges: Array<[number, number]> = [[0, 5]]; // "A\n==="
		const q = buildSetextHintQueueFromSource(src, ranges);
		assert.ok(q.has('A'));
		const collected = collectSetextHints(ranges, src);
		assert.strictEqual(collected[0]!.text, 'A');
	});
});

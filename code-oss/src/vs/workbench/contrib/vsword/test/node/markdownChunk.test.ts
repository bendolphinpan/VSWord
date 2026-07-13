/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	findSafeSplitOffset,
	splitMarkdownProgressive,
	shouldUseProgressiveOpen,
	buildFenceMask,
	estimateTableDensity,
	resolveProgressiveChunkSizes,
	VSWORD_LARGE_DOC_CHARS,
	VSWORD_FIRST_CHUNK_CHARS,
	VSWORD_FIRST_CHUNK_CHARS_TABLE_HIGH,
	VSWORD_NEXT_CHUNK_CHARS_TABLE_HIGH,
	VSWORD_FIRST_CHUNK_CHARS_TABLE_MED,
} from '../../browser/milkdownEditor/webview/markdown-chunk.template.js';

suite('RD-1.2 · markdown-chunk', () => {
	test('短文不 progressive', () => {
		assert.strictEqual(shouldUseProgressiveOpen('hi'), false);
		assert.strictEqual(shouldUseProgressiveOpen('x'.repeat(VSWORD_LARGE_DOC_CHARS)), false);
		assert.strictEqual(shouldUseProgressiveOpen('x'.repeat(VSWORD_LARGE_DOC_CHARS + 1)), true);
	});

	test('split 拼接还原全文', () => {
		const parts = [];
		for (let i = 0; i < 50; i++) {
			parts.push(`# H${i}\n\nparagraph ${i} `.repeat(80) + '\n\n');
		}
		const text = parts.join('');
		const chunks = splitMarkdownProgressive(text, 2000, 1500);
		assert.ok(chunks.length >= 2);
		assert.strictEqual(chunks.join(''), text);
	});

	test('不在 fence 内切开', () => {
		const head = 'intro\n\n';
		const fence = '```js\n' + ('const x = 1;\n'.repeat(200)) + '```\n\n';
		const tail = 'after\n\n' + ('body\n\n'.repeat(100));
		const text = head + fence + tail;
		// prefer mid-fence
		const midFence = head.length + Math.floor(fence.length / 2);
		const cut = findSafeSplitOffset(text, midFence);
		const mask = buildFenceMask(text);
		// cut 点本身不应在 fence 内（或为全文）
		if (cut < text.length) {
			assert.strictEqual(mask[cut] || 0, 0, `cut ${cut} still in fence`);
		}
		// 切点应在 fence 之后或之前
		const fenceStart = head.length;
		const fenceEnd = head.length + fence.length;
		assert.ok(cut <= fenceStart || cut >= fenceEnd, `cut=${cut} fence=[${fenceStart},${fenceEnd})`);
	});

	test('优先空行边界', () => {
		const text = 'aaa\n\nbbb\n\nccc\n\n';
		const cut = findSafeSplitOffset(text, 5); // inside aaa region → expect after first blank
		assert.ok(cut === 5 || cut === 4 || text.slice(0, cut).endsWith('\n\n') || cut === text.length);
	});

	test('空串', () => {
		assert.deepStrictEqual(splitMarkdownProgressive(''), ['']);
		assert.strictEqual(findSafeSplitOffset('', 10), 0);
	});
});

suite('RD-1.4b · table 密度自适应分块', () => {
	test('纯散文 density≈0 · tier=low · 默认 48k', () => {
		const prose = Array.from({ length: 200 }, (_, i) => `段落 ${i} 中文写作内容。\n\n`).join('');
		const d = estimateTableDensity(prose);
		assert.ok(d < 0.05, `prose density=${d}`);
		const s = resolveProgressiveChunkSizes(prose);
		assert.strictEqual(s.tier, 'low');
		assert.strictEqual(s.firstMax, VSWORD_FIRST_CHUNK_CHARS);
	});

	test('高密表格 density≥0.2 · tier=high · 小块', () => {
		const rows = Array.from({ length: 80 }, (_, i) => `| c1 | c2 | r${i} |\n| --- | --- | --- |\n`).join('');
		const d = estimateTableDensity(rows);
		assert.ok(d >= 0.20, `table density=${d}`);
		const s = resolveProgressiveChunkSizes(rows);
		assert.strictEqual(s.tier, 'high');
		assert.strictEqual(s.firstMax, VSWORD_FIRST_CHUNK_CHARS_TABLE_HIGH);
		assert.strictEqual(s.nextMax, VSWORD_NEXT_CHUNK_CHARS_TABLE_HIGH);
	});

	test('中密：散文夹表格 → med 或 high', () => {
		const mixed = Array.from({ length: 40 }, (_, i) => {
			if (i % 3 === 0) {
				return `| a | b |\n| --- | --- |\n| ${i} | x |\n\n`;
			}
			return `普通段落 ${i}\n\n`;
		}).join('');
		const s = resolveProgressiveChunkSizes(mixed);
		assert.ok(s.tier === 'med' || s.tier === 'high', `tier=${s.tier} dens=${s.tableDensity}`);
		assert.ok(s.firstMax <= VSWORD_FIRST_CHUNK_CHARS_TABLE_MED || s.tier === 'high');
	});

	test('高密 split 块更碎且可拼接', () => {
		const bigTable = Array.from({ length: 500 }, (_, i) =>
			`| colA | colB | colC | row${i} |\n| --- | --- | --- | --- |\n`).join('');
		// 人为拉长
		const text = bigTable + bigTable + bigTable;
		const s = resolveProgressiveChunkSizes(text);
		const chunks = splitMarkdownProgressive(text, s.firstMax, s.nextMax);
		assert.ok(chunks.length >= 2);
		assert.strictEqual(chunks.join(''), text);
		// 首块不应远超 high first（允许安全切点 1.25x）
		assert.ok(chunks[0].length <= s.firstMax * 1.3 + 4096, `first=${chunks[0].length} cap=${s.firstMax}`);
	});
});

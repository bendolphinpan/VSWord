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
	VSWORD_LARGE_DOC_CHARS,
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

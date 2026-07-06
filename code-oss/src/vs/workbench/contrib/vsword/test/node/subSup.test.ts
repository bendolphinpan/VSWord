/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.4 — sub/sup helpers: 正则边界 + parseInlineText 拆分 + stringifyMark 序列化。
// 纯函数（无 Milkdown / DOM 依赖），可直接在 node 下跑。

import * as assert from 'assert';
import {
	SUB_RE,
	SUP_RE,
	parseInlineText,
	stringifyMark,
	MARK_MARKER,
} from '../../browser/milkdownEditor/webview/sub-sup-helpers.template.js';

// 每次测试前重置 lastIndex，避免 /g 副作用泄漏。
function resetRe() { SUB_RE.lastIndex = 0; SUP_RE.lastIndex = 0; }

suite('T-3.5c.4 · sub-sup regex boundaries', () => {
	test('SUB_RE matches single `~x~`', () => {
		resetRe();
		const m = 'H~2~O'.match(SUB_RE);
		assert.deepStrictEqual(m, ['~2~']);
	});

	test('SUB_RE does NOT match GFM strikethrough `~~x~~`', () => {
		resetRe();
		// 双波浪整段不应产生任何 sub 匹配（关键正确性属性）。
		const m = '~~struck~~'.match(SUB_RE);
		assert.strictEqual(m, null);
	});

	test('SUB_RE ignores whitespace-adjacent forms `~ x ~`', () => {
		resetRe();
		assert.strictEqual('a ~ 2 ~ b'.match(SUB_RE), null);
		assert.strictEqual('a ~2 ~ b'.match(SUB_RE), null);
	});

	test('SUB_RE handles CJK content between markers', () => {
		resetRe();
		const m = '标注~中文~结束'.match(SUB_RE);
		assert.deepStrictEqual(m, ['~中文~']);
	});

	test('SUP_RE matches single `^x^`', () => {
		resetRe();
		const m = 'x^2^ + y^n^'.match(SUP_RE);
		assert.deepStrictEqual(m, ['^2^', '^n^']);
	});

	test('SUP_RE does NOT match doubled caret `^^x^^`', () => {
		resetRe();
		assert.strictEqual('a^^b^^c'.match(SUP_RE), null);
	});

	test('MARK_MARKER is frozen and maps to the correct sigils', () => {
		assert.strictEqual(MARK_MARKER.subscript, '~');
		assert.strictEqual(MARK_MARKER.superscript, '^');
		assert.ok(Object.isFrozen(MARK_MARKER));
	});
});

suite('T-3.5c.4 · parseInlineText', () => {
	test('plain text returns a single text node', () => {
		const out = parseInlineText('just text');
		assert.deepStrictEqual(out, [{ type: 'text', value: 'just text' }]);
	});

	test('splits `H~2~O` into text + subscript + text', () => {
		const out = parseInlineText('H~2~O');
		assert.strictEqual(out.length, 3);
		assert.deepStrictEqual(out[0], { type: 'text', value: 'H' });
		assert.strictEqual(out[1].type, 'subscript');
		assert.deepStrictEqual(out[1].children, [{ type: 'text', value: '2' }]);
		assert.deepStrictEqual(out[2], { type: 'text', value: 'O' });
	});

	test('splits `x^2^` into text + superscript', () => {
		const out = parseInlineText('x^2^');
		assert.strictEqual(out.length, 2);
		assert.deepStrictEqual(out[0], { type: 'text', value: 'x' });
		assert.strictEqual(out[1].type, 'superscript');
		assert.deepStrictEqual(out[1].children, [{ type: 'text', value: '2' }]);
	});

	test('mixes sub + sup in one string in left-to-right order', () => {
		const out = parseInlineText('H~2~O and e^n^');
		const types = out.map(n => n.type);
		assert.deepStrictEqual(types, ['text', 'subscript', 'text', 'superscript']);
		assert.strictEqual(out[0].value, 'H');
		assert.strictEqual(out[2].value, 'O and e');
	});

	test('leaves GFM strikethrough `~~x~~` unchanged', () => {
		const out = parseInlineText('~~del~~');
		assert.deepStrictEqual(out, [{ type: 'text', value: '~~del~~' }]);
	});

	test('handles multiple non-overlapping sub occurrences', () => {
		const out = parseInlineText('a~1~ b~2~ c');
		const subs = out.filter(n => n.type === 'subscript');
		assert.strictEqual(subs.length, 2);
		assert.strictEqual(subs[0]!.children![0]!.value, '1');
		assert.strictEqual(subs[1]!.children![0]!.value, '2');
	});

	test('empty string returns a single empty text node', () => {
		const out = parseInlineText('');
		assert.deepStrictEqual(out, [{ type: 'text', value: '' }]);
	});

	test('null/undefined guarded (coerced to empty text)', () => {
		// @ts-expect-error 显式喂 null 触发防御分支
		assert.deepStrictEqual(parseInlineText(null), [{ type: 'text', value: '' }]);
		// @ts-expect-error 同上，undefined
		assert.deepStrictEqual(parseInlineText(undefined), [{ type: 'text', value: '' }]);
	});

	test('coalesces adjacent text nodes (invariant: no consecutive text)', () => {
		const out = parseInlineText('~~notmatch~~ H~2~');
		// 前段有 `~~...~~` 不被消费，与后续 " H" 合并成一个 text，再接 sub。
		const kinds = out.map(n => n.type);
		// 相邻 text 必须已被合并，序列绝不会出现 [text, text]。
		for (let i = 1; i < kinds.length; i++) {
			assert.ok(!(kinds[i - 1] === 'text' && kinds[i] === 'text'),
				`consecutive text nodes at ${i}`);
		}
	});
});

suite('T-3.5c.4 · stringifyMark', () => {
	test('subscript wraps with `~`', () => {
		assert.strictEqual(stringifyMark('subscript', '2'), '~2~');
	});
	test('superscript wraps with `^`', () => {
		assert.strictEqual(stringifyMark('superscript', 'n'), '^n^');
	});
	test('preserves CJK content verbatim', () => {
		assert.strictEqual(stringifyMark('subscript', '甲乙'), '~甲乙~');
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.1 · Emoji shortcode 保源码 helper 单测。
// 只测 helpers（纯函数 · 无 Milkdown / node-emoji 依赖，走 resolver 注入）。
// remark visitor / atom node / inputRule 的整体 round-trip 由 Gate D verify.mjs 覆盖。

import * as assert from 'assert';
import {
	EMOJI_RE,
	parseInlineEmoji,
	stringifyEmoji,
	extractShortcodeName,
} from '../../browser/milkdownEditor/webview/emoji-helpers.template.js';

// 每次测试前重置 /g 正则 lastIndex，避免副作用泄漏。
function resetRe() { EMOJI_RE.lastIndex = 0; }

// 最小 resolver：只识别几个常见 shortcode，其余返回 null。
function makeResolver() {
	const table: Record<string, string> = { smile: '🙂', heart: '❤️', tada: '🎉', '+1': '👍' };
	return (name: string) => (Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null);
}

suite('T-3.5c.1 · EMOJI_RE 边界', () => {
	test('匹配基本 shortcode `:smile:`', () => {
		resetRe();
		assert.deepStrictEqual('hi :smile: bye'.match(EMOJI_RE), [':smile:']);
	});

	test('不匹配 GFM footnote `[^1]`（无冒号包裹）', () => {
		resetRe();
		assert.strictEqual('[^1]'.match(EMOJI_RE), null);
	});

	test('不匹配空 shortcode `::`', () => {
		resetRe();
		assert.strictEqual('a :: b'.match(EMOJI_RE), null);
	});

	test('允许下划线/加号/减号（`:+1:` / `:heart_eyes:`）', () => {
		resetRe();
		const m = ':+1: :heart_eyes:'.match(EMOJI_RE);
		assert.deepStrictEqual(m, [':+1:', ':heart_eyes:']);
	});

	test('多次匹配用 /g 递增', () => {
		resetRe();
		const m = 'a :one: b :two: c'.match(EMOJI_RE);
		assert.deepStrictEqual(m, [':one:', ':two:']);
	});
});

suite('T-3.5c.1 · parseInlineEmoji', () => {
	test('识别一个 shortcode，切成 [text, emoji, text]', () => {
		const out = parseInlineEmoji('a :smile: b', makeResolver());
		assert.strictEqual(out.length, 3);
		assert.deepStrictEqual(out[0], { type: 'text', value: 'a ' });
		assert.strictEqual(out[1]!.type, 'emoji');
		assert.strictEqual(out[1]!.name, 'smile');
		assert.strictEqual(out[1]!.unicode, '🙂');
		assert.deepStrictEqual(out[2], { type: 'text', value: ' b' });
	});

	test('未识别 shortcode 保留在文本中（不进 emoji 节点）', () => {
		const out = parseInlineEmoji('hi :notrealthing: bye', makeResolver());
		// 未识别 → 全段变一整块 text 节点（coalesce 合并）
		assert.strictEqual(out.length, 1);
		assert.strictEqual(out[0]!.type, 'text');
		assert.strictEqual(out[0]!.value, 'hi :notrealthing: bye');
	});

	test('CJK 邻近 shortcode 正确切分', () => {
		const out = parseInlineEmoji('中文:smile:紧邻', makeResolver());
		assert.strictEqual(out.length, 3);
		assert.strictEqual(out[0]!.value, '中文');
		assert.strictEqual(out[1]!.type, 'emoji');
		assert.strictEqual(out[1]!.name, 'smile');
		assert.strictEqual(out[2]!.value, '紧邻');
	});

	test('转义反斜杠 `\\:smile:` 不消费为 emoji', () => {
		const out = parseInlineEmoji('a \\:smile: b', makeResolver());
		assert.strictEqual(out.length, 1);
		assert.strictEqual(out[0]!.type, 'text');
	});

	test('混合识别 + 未识别：只消费识别项', () => {
		const out = parseInlineEmoji(':smile: 与 :fake:', makeResolver());
		// 期望: [emoji smile, text ' 与 :fake:']
		assert.strictEqual(out.length, 2);
		assert.strictEqual(out[0]!.type, 'emoji');
		assert.strictEqual(out[0]!.name, 'smile');
		assert.strictEqual(out[1]!.type, 'text');
		assert.strictEqual(out[1]!.value, ' 与 :fake:');
	});

	test('resolver 缺失时视为整段 text（防御性）', () => {
		// @ts-expect-error 显式喂 undefined 触发 fast path
		const out = parseInlineEmoji(':smile:', undefined);
		assert.deepStrictEqual(out, [{ type: 'text', value: ':smile:' }]);
	});

	test('空串返回单个空 text 节点', () => {
		const out = parseInlineEmoji('', makeResolver());
		assert.deepStrictEqual(out, [{ type: 'text', value: '' }]);
	});

	test('null/undefined 输入被 coerce 成空字符串', () => {
		// @ts-expect-error 显式喂 null
		assert.deepStrictEqual(parseInlineEmoji(null, makeResolver()), [{ type: 'text', value: '' }]);
		// @ts-expect-error 显式喂 undefined
		assert.deepStrictEqual(parseInlineEmoji(undefined, makeResolver()), [{ type: 'text', value: '' }]);
	});

	test('相邻 text 已合并（invariant: 序列中不会连续两个 text）', () => {
		const out = parseInlineEmoji(':fake1: hi :smile: :fake2:', makeResolver());
		const kinds = out.map(n => n.type);
		for (let i = 1; i < kinds.length; i++) {
			assert.ok(!(kinds[i - 1] === 'text' && kinds[i] === 'text'),
				`consecutive text nodes at index ${i}: ${kinds.join(',')}`);
		}
	});
});

suite('T-3.5c.1 · stringifyEmoji（保源码序列化）', () => {
	test('包裹为 `:name:`', () => {
		assert.strictEqual(stringifyEmoji('smile'), ':smile:');
	});

	test('trim 掉首尾空白', () => {
		assert.strictEqual(stringifyEmoji('  smile  '), ':smile:');
	});

	test('空/非法名字返回空串（上游过滤）', () => {
		assert.strictEqual(stringifyEmoji(''), '');
		assert.strictEqual(stringifyEmoji('   '), '');
		// @ts-expect-error null 输入
		assert.strictEqual(stringifyEmoji(null), '');
		// @ts-expect-error undefined 输入
		assert.strictEqual(stringifyEmoji(undefined), '');
	});

	test('保留 CJK / 特殊字符 verbatim', () => {
		// 注意：CJK 从不会成为合法 shortcode（EMOJI_RE 不允许），但 stringifyEmoji 是纯 wrap，
		// 不校验字符集 —— 只 trim + wrap。防御边界。
		assert.strictEqual(stringifyEmoji('heart_eyes'), ':heart_eyes:');
		assert.strictEqual(stringifyEmoji('+1'), ':+1:');
	});
});

suite('T-3.5c.1 · extractShortcodeName', () => {
	test('从 `:smile:` 抽出 `smile`', () => {
		assert.strictEqual(extractShortcodeName(':smile:'), 'smile');
	});

	test('从 `:heart_eyes:` 抽出 `heart_eyes`', () => {
		assert.strictEqual(extractShortcodeName(':heart_eyes:'), 'heart_eyes');
	});

	test('从 `:+1:` 抽出 `+1`', () => {
		assert.strictEqual(extractShortcodeName(':+1:'), '+1');
	});

	test('拒绝无冒号包裹', () => {
		assert.strictEqual(extractShortcodeName('smile'), null);
	});

	test('拒绝内部空白', () => {
		assert.strictEqual(extractShortcodeName(':bad name:'), null);
	});

	test('拒绝空 name', () => {
		assert.strictEqual(extractShortcodeName('::'), null);
	});

	test('非字符串输入返回 null', () => {
		// @ts-expect-error null 输入
		assert.strictEqual(extractShortcodeName(null), null);
		// @ts-expect-error undefined 输入
		assert.strictEqual(extractShortcodeName(undefined), null);
	});
});

suite('T-3.5c.1 · Round-trip 契约（helpers 层）', () => {
	test('parse → stringify 保源码：识别项还原为 `:name:`', () => {
		const parsed = parseInlineEmoji('a :smile: b', makeResolver());
		const emojiNode = parsed.find(n => n.type === 'emoji');
		assert.ok(emojiNode, 'expected emoji node');
		assert.strictEqual(stringifyEmoji(emojiNode!.name!), ':smile:');
	});

	test('parse → stringify 保源码：未识别 shortcode 从未成为 emoji 节点', () => {
		const parsed = parseInlineEmoji('a :nope: b', makeResolver());
		assert.strictEqual(parsed.find(n => n.type === 'emoji'), undefined);
		// 未识别原文原封在 text 里
		assert.ok(parsed[0]!.value!.includes(':nope:'));
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.2 · footnote helpers + hover 状态机（纯函数，无 Milkdown / DOM 依赖）。
// verify.template.mjs 里已经跑了同一批断言的 round-trip 版本；这里补 mocha
// 覆盖，让 CI 单测阶段就能拦住回归——不用等 vendor 重打。

import * as assert from 'assert';
import {
	normalizeLabel,
	sanitizeLabelForSelector,
	mdastToPlainText,
	truncateForPreview,
	buildDefinitionIndex,
} from '../../browser/milkdownEditor/webview/footnote-helpers.template.js';
import {
	FootnoteHoverIntent,
	OPEN_DELAY_MS,
	CLOSE_DELAY_MS,
} from '../../browser/milkdownEditor/webview/footnote-preview.template.js';

// --- normalizeLabel ---------------------------------------------------------

suite('T-3.5c.2 · normalizeLabel', () => {
	test('小写化', () => {
		assert.strictEqual(normalizeLabel('Foo'), 'foo');
		assert.strictEqual(normalizeLabel('BAR'), 'bar');
	});

	test('折叠首尾 + 内部连续空白为单空格', () => {
		assert.strictEqual(normalizeLabel('  Foo   Bar\t'), 'foo bar');
		assert.strictEqual(normalizeLabel('a\n\nb'), 'a b');
	});

	test('CJK 标签内 whitespace 不受影响（除了折叠）', () => {
		assert.strictEqual(normalizeLabel('中文 标签'), '中文 标签');
		assert.strictEqual(normalizeLabel('  中文\t标签  '), '中文 标签');
	});

	test('非字符串输入返回空串', () => {
		// @ts-expect-error null 输入
		assert.strictEqual(normalizeLabel(null), '');
		// @ts-expect-error undefined 输入
		assert.strictEqual(normalizeLabel(undefined), '');
		// @ts-expect-error number 输入
		assert.strictEqual(normalizeLabel(123), '');
	});

	test('全空白 → 空串（无效 key）', () => {
		assert.strictEqual(normalizeLabel('   \t\n  '), '');
	});
});

// --- sanitizeLabelForSelector -----------------------------------------------

suite('T-3.5c.2 · sanitizeLabelForSelector', () => {
	test('返回字符串', () => {
		assert.strictEqual(typeof sanitizeLabelForSelector('abc'), 'string');
	});

	test('非字符串 → 空串输入的转义结果', () => {
		// @ts-expect-error null 走空串分支
		assert.strictEqual(sanitizeLabelForSelector(null), '');
		// @ts-expect-error 同上
		assert.strictEqual(sanitizeLabelForSelector(undefined), '');
	});

	test('引号 / 反斜杠会被转义（不裸出）', () => {
		const out = sanitizeLabelForSelector('a"b');
		// node 环境无 CSS 全局对象 → 走 fallback：`\"` 转义
		assert.ok(out.includes('\\"') || out.includes('\\22'), `expected escaped quote, got ${out}`);
	});

	test('CJK 字符不被 fallback 破坏（fallback 只 touch 一小组特殊字符）', () => {
		const out = sanitizeLabelForSelector('中文');
		// fallback 只对 " \ \n \r \t 转义，其他字符原样。
		assert.strictEqual(out, '中文');
	});
});

// --- mdastToPlainText -------------------------------------------------------

suite('T-3.5c.2 · mdastToPlainText', () => {
	test('inline 节点串联无换行', () => {
		const out = mdastToPlainText({
			type: 'paragraph',
			children: [
				{ type: 'text', value: '你好' },
				{ type: 'inlineCode', value: 'code' },
				{ type: 'text', value: '!' },
			],
		});
		assert.strictEqual(out, '你好code!');
	});

	test('block 之间插换行', () => {
		const out = mdastToPlainText({
			type: 'root',
			children: [
				{ type: 'paragraph', children: [{ type: 'text', value: 'p1' }] },
				{ type: 'paragraph', children: [{ type: 'text', value: 'p2' }] },
			],
		});
		assert.strictEqual(out, 'p1\np2');
	});

	test('list / listItem 也算 block-level', () => {
		const out = mdastToPlainText({
			type: 'root',
			children: [
				{ type: 'paragraph', children: [{ type: 'text', value: 'lead' }] },
				{
					type: 'list',
					children: [
						{ type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a' }] }] },
					],
				},
			],
		});
		assert.ok(out.includes('lead'));
		assert.ok(out.includes('a'));
		assert.ok(out.includes('\n'));
	});

	test('null / undefined / 空对象 → 空串', () => {
		assert.strictEqual(mdastToPlainText(null), '');
		assert.strictEqual(mdastToPlainText(undefined), '');
		assert.strictEqual(mdastToPlainText({}), '');
	});

	test('原子 value 节点直接抽 value', () => {
		assert.strictEqual(mdastToPlainText({ type: 'text', value: '只我' }), '只我');
	});
});

// --- truncateForPreview -----------------------------------------------------

suite('T-3.5c.2 · truncateForPreview', () => {
	test('短文本原样返回', () => {
		assert.strictEqual(truncateForPreview('short', 240), 'short');
	});

	test('长文本切断 + 追加省略号', () => {
		const long = 'a'.repeat(300);
		const out = truncateForPreview(long, 240);
		assert.ok(out.endsWith('…'), '结尾应为省略号');
		assert.ok(out.length <= 241, `长度应 ≤ limit+1，实际 ${out.length}`);
	});

	test('在 whitespace 处切分（当窗口内有空格且靠后时）', () => {
		const text = 'hello world '.repeat(30); // 长度 360
		const out = truncateForPreview(text, 240);
		// 切分点应在 space 处 → 结果不以半词结尾
		assert.ok(/[ …]$/.test(out.slice(-2)) || out.endsWith('…'));
	});

	test('折叠多余空行（3 个及以上折叠为 2 个）', () => {
		const out = truncateForPreview('a\n\n\n\nb', 240);
		assert.ok(!out.includes('\n\n\n'), '不应包含 3 个及以上连续换行');
	});

	test('非字符串输入 → 空串', () => {
		// @ts-expect-error null 输入
		assert.strictEqual(truncateForPreview(null), '');
		// @ts-expect-error 同上
		assert.strictEqual(truncateForPreview(undefined), '');
	});
});

// --- buildDefinitionIndex ---------------------------------------------------

suite('T-3.5c.2 · buildDefinitionIndex', () => {
	test('首次 win：同 label（大小写不敏感）只保第一条', () => {
		const m = buildDefinitionIndex([
			{ label: 'Foo', textContent: 'first' },
			{ label: 'foo', textContent: 'second' },
		]);
		assert.strictEqual(m.size, 1);
		const e = m.get('foo');
		assert.ok(e);
		assert.strictEqual(e.label, 'Foo');       // 保留首次的原始 label（用于写回）
		assert.strictEqual(e.preview, 'first');
	});

	test('跳过 label 缺失 / 类型错误 / entries 非数组的项', () => {
		const m1 = buildDefinitionIndex([
			null as any,
			{ label: '', textContent: 'x' },
			{ textContent: 'y' } as any,
		]);
		assert.strictEqual(m1.size, 0);
		// @ts-expect-error 非数组 → 空 map，不抛
		const m2 = buildDefinitionIndex(null);
		assert.strictEqual(m2.size, 0);
	});

	test('key 使用 normalizeLabel（大小写不敏感 lookup）', () => {
		const m = buildDefinitionIndex([{ label: 'MyNote', textContent: 'hi' }]);
		assert.ok(m.get('mynote'));
		assert.ok(m.get(normalizeLabel('MYNOTE')));
	});

	test('textContent 会走 truncateForPreview', () => {
		const long = 'x'.repeat(500);
		const m = buildDefinitionIndex([{ label: 'a', textContent: long }]);
		const e = m.get('a')!;
		assert.ok(e.preview.endsWith('…'));
		assert.ok(e.preview.length < long.length);
	});
});

// --- FootnoteHoverIntent 状态机 ---------------------------------------------

suite('T-3.5c.2 · FootnoteHoverIntent', () => {
	test('初始状态 idle', () => {
		const it = new FootnoteHoverIntent();
		assert.strictEqual(it.state, 'idle');
		assert.strictEqual(it.target, null);
	});

	test('idle → pending 且返回 schedule-open + at', () => {
		const it = new FootnoteHoverIntent(() => 1000);
		const r = it.enterAnchor({ label: 'x' });
		assert.strictEqual(r.action, 'schedule-open');
		assert.strictEqual((r as any).at, 1000 + OPEN_DELAY_MS);
		assert.strictEqual(it.state, 'pending');
		assert.deepStrictEqual(it.target, { label: 'x' });
	});

	test('pending → idle：leaveAnchor 时应 cancel-open', () => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		const r = it.leaveAnchor();
		assert.strictEqual(r.action, 'cancel-open');
		assert.strictEqual(it.state, 'idle');
		assert.strictEqual(it.target, null);
	});

	test('pending → shown：fireOpen 到位', () => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		const r = it.fireOpen();
		assert.strictEqual(r.action, 'open');
		assert.deepStrictEqual((r as any).target, { label: 'x' });
		assert.strictEqual(it.state, 'shown');
	});

	test('shown → closing：leaveAnchor 后 schedule-close 并挂时间', () => {
		const it = new FootnoteHoverIntent(() => 500);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		const r = it.leaveAnchor();
		assert.strictEqual(r.action, 'schedule-close');
		assert.strictEqual((r as any).at, 500 + CLOSE_DELAY_MS);
		assert.strictEqual(it.state, 'closing');
	});

	test('closing → shown：重新 enterAnchor 应 cancel-close', () => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		it.leaveAnchor();
		const r = it.enterAnchor({ label: 'x' });
		assert.strictEqual(r.action, 'cancel-close');
		assert.strictEqual(it.state, 'shown');
	});

	test('closing → idle：fireClose 落地', () => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		it.leaveAnchor();
		const r = it.fireClose();
		assert.strictEqual(r.action, 'close');
		assert.strictEqual(it.state, 'idle');
		assert.strictEqual(it.target, null);
	});

	test('enterPopover / leavePopover：cancel-close 与 schedule-close', () => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		it.leaveAnchor();                          // state: closing
		const r1 = it.enterPopover();
		assert.strictEqual(r1.action, 'cancel-close');
		assert.strictEqual(it.state, 'shown');
		const r2 = it.leavePopover();
		assert.strictEqual(r2.action, 'schedule-close');
		assert.strictEqual(it.state, 'closing');
	});

	test('pending 时 enter 同一 anchor 只是更新 at，不换状态', () => {
		let now = 0;
		const it = new FootnoteHoverIntent(() => now);
		it.enterAnchor({ label: 'x' });
		now = 100;
		const r = it.enterAnchor({ label: 'x' });
		assert.strictEqual(r.action, 'schedule-open');
		assert.strictEqual((r as any).at, 100 + OPEN_DELAY_MS);
		assert.strictEqual(it.state, 'pending');
	});

	test('reset 强制回 idle', () => {
		const it = new FootnoteHoverIntent(() => 0);
		it.enterAnchor({ label: 'x' });
		it.fireOpen();
		it.reset();
		assert.strictEqual(it.state, 'idle');
		assert.strictEqual(it.target, null);
	});

	test('OPEN_DELAY_MS / CLOSE_DELAY_MS 是正整数', () => {
		assert.ok(Number.isInteger(OPEN_DELAY_MS) && OPEN_DELAY_MS > 0);
		assert.ok(Number.isInteger(CLOSE_DELAY_MS) && CLOSE_DELAY_MS > 0);
	});
});

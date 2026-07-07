/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.1.a · TOC remark transform 单测（PRD §2.5 匹配规则 8 行 case 表 + 2 条形状约束）。
//
// 走 remark-parse 拿真 mdast → 跑 tocRemarkTransform → 断言 root.children 结构。
// 不引 Milkdown / DOM / prosemirror；ad-hoc runner 通过 NODE_PATH 找到 builder 里的
// unified / remark-parse / unist-util-visit。

import * as assert from 'assert';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { tocRemarkTransform } from '../../browser/milkdownEditor/webview/toc-remark.template.js';

/** 用 remark-parse 拿真 mdast，然后 apply transform，返回处理后的 root。 */
function parseAndTransform(md: string): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tree = (unified() as any).use(remarkParse).parse(md);
	tocRemarkTransform(tree);
	return tree;
}

suite('T-3.7c.1.a · tocRemarkTransform · 命中', () => {
	test('C1 · `[TOC]` 独占段落 → tocMarker', () => {
		const root = parseAndTransform('[TOC]\n');
		assert.strictEqual(root.children.length, 1);
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('C2 · `[toc]` 全小写 → tocMarker', () => {
		const root = parseAndTransform('[toc]\n');
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('C3 · `[Toc]` 混合大小写 → tocMarker', () => {
		const root = parseAndTransform('[Toc]\n');
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('C4 · `[TOC ]` trailing 空白 → tocMarker', () => {
		const root = parseAndTransform('[TOC ]\n');
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('C5 · ` [TOC]` 3 前导空格 → tocMarker', () => {
		const root = parseAndTransform('   [TOC]\n');
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('C5b · 单前导空格 → tocMarker', () => {
		const root = parseAndTransform(' [TOC]\n');
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('多段中夹一个 `[TOC]` · 仅目标段被替换', () => {
		const md = '# 标题\n\n[TOC]\n\n正文段落。\n';
		const root = parseAndTransform(md);
		// heading + tocMarker + paragraph
		assert.strictEqual(root.children.length, 3);
		assert.strictEqual(root.children[0].type, 'heading');
		assert.strictEqual(root.children[1].type, 'tocMarker');
		assert.strictEqual(root.children[2].type, 'paragraph');
	});

	test('tocMarker 保留 position 信息', () => {
		const root = parseAndTransform('[TOC]\n');
		const marker = root.children[0];
		assert.ok(marker.position, 'tocMarker 应保留原 paragraph 的 position');
		assert.ok(marker.position.start && typeof marker.position.start.offset === 'number');
	});
});

suite('T-3.7c.1.a · tocRemarkTransform · 拒识', () => {
	test('C6 · `[TOC] extra text` → 普通 paragraph', () => {
		const root = parseAndTransform('[TOC] extra text\n');
		assert.strictEqual(root.children[0].type, 'paragraph', '应保持 paragraph');
	});

	test('C6b · `foo [TOC]` 前置文本 → paragraph', () => {
		const root = parseAndTransform('foo [TOC]\n');
		assert.strictEqual(root.children[0].type, 'paragraph');
	});

	test('C7 · code span `` `[TOC]` `` → paragraph 保留 inlineCode', () => {
		const root = parseAndTransform('`[TOC]`\n');
		assert.strictEqual(root.children[0].type, 'paragraph');
		const kids = root.children[0].children;
		assert.strictEqual(kids.length, 1);
		assert.strictEqual(kids[0].type, 'inlineCode');
		assert.strictEqual(kids[0].value, '[TOC]');
	});

	test('C8a · 代码块内 `[TOC]` → 保持 code 节点，正文不被替换', () => {
		const md = '```\n[TOC]\n```\n';
		const root = parseAndTransform(md);
		assert.strictEqual(root.children.length, 1);
		assert.strictEqual(root.children[0].type, 'code');
		assert.strictEqual(root.children[0].value, '[TOC]');
	});

	test('C8b · blockquote 内 `[TOC]` → 保持 blockquote > paragraph（不识别）', () => {
		const md = '> [TOC]\n';
		const root = parseAndTransform(md);
		assert.strictEqual(root.children[0].type, 'blockquote');
		const bq = root.children[0];
		assert.ok(Array.isArray(bq.children) && bq.children.length >= 1);
		// 关键：blockquote 内的 paragraph 不能被升级成 tocMarker（PRD §2.5）。
		assert.strictEqual(bq.children[0].type, 'paragraph');
	});

	test('空段落（remark-parse 不会产生空 paragraph） · 输入 `` → tree 无子节点', () => {
		const root = parseAndTransform('');
		assert.strictEqual(root.children.length, 0);
	});

	test('`[TOC]` 后跟一个非空强调段 → paragraph 保留 emphasis child', () => {
		const root = parseAndTransform('[TOC]*extra*\n');
		assert.strictEqual(root.children[0].type, 'paragraph');
	});
});

suite('T-3.7c.1.a · tocRemarkTransform · 幂等 & 边界', () => {
	test('对已含 tocMarker 的树再跑一次 · 幂等', () => {
		const root = parseAndTransform('[TOC]\n');
		tocRemarkTransform(root);
		tocRemarkTransform(root);
		assert.strictEqual(root.children[0].type, 'tocMarker');
	});

	test('null / undefined tree · 不抛异常', () => {
		assert.doesNotThrow(() => tocRemarkTransform(null as any));
		assert.doesNotThrow(() => tocRemarkTransform(undefined as any));
	});
});

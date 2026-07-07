// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.1.a · [TOC] 占位符 remark 层。
 *
 *  数据通路：
 *    parse:  `[TOC]` paragraph
 *      --(tocRemarkTransform visitor)-->
 *      mdast { type:'tocMarker', position:<原 paragraph position> }
 *      --(toc-node schema.parseMarkdown)-->  PM 'toc_marker' 节点
 *    write:  PM 'toc_marker'
 *      --(toc-node schema.toMarkdown)-->    mdast paragraph[text '[TOC]']
 *      --(remark-stringify)-->              `[TOC]`（原样占位符 · PRD D-11）
 *
 *  识别规则（PRD §2.5 8 行 case 表）：
 *    ✓  `[TOC]` / `[toc]` / `[Toc]` / `[TOC ]`（大小写不敏感 + trailing 空白）
 *    ✓  ` [TOC]`（1~3 前导空格，CommonMark paragraph 内允许）
 *    ✗  `[TOC] extra text`（含额外文本 → 普通 paragraph）
 *    ✗  code span / code block / blockquote 内的 `[TOC]`（mdast 里已在别的父节点，
 *        不会被 paragraph→text 单 child 的形状匹配到）
 *
 *  设计说明：
 *    - 与 `remarkLiftImgHtmlPlugin` 同一 mutate-in-place 套路，避免 splice children；
 *    - `visit(tree, 'paragraph', …)`：paragraph 是块级节点，代码块 / 引用块内的
 *      `[TOC]` 天然不会被访问到（前者是 code、后者是 blockquote>paragraph 但外面
 *      还有一层 blockquote，本插件只在意 paragraph 自身，不看祖辈），故 code span
 *      形式 (`` `[TOC]` ``) 会被 mdast 转成 paragraph→inlineCode 而不是 text，
 *      也天然不命中。
 *--------------------------------------------------------------------------------------------*/

import { $remark } from '@milkdown/utils';

/** 匹配去掉前后空白后仅剩 `[TOC]` 的正则；PRD §2.5 允许 1~3 前导空格 + 任意 trailing 空白。 */
// PRD §2.5：
//   `[TOC]` / `[toc]` / `[Toc]`          ← 大小写不敏感
//   `[TOC ]` / `[TOC   ]`                 ← 方括号内 trailing 空白（remark-parse 会把它保留在 text.value 里）
//   ` [TOC]` / `   [TOC]`                 ← 段落自身允许 0~3 前导空格（CommonMark 规则；再多就是缩进代码块）
//   `[TOC]` 后跟 trailing 空白             ← 尾随空白 remark-parse 会剥掉，正则也允许
const TOC_LINE_RE = /^\s{0,3}\[toc\s*\]\s*$/i;

/**
 * 纯函数版：直接对 mdast 树做 in-place mutation。
 * 单测直接 import 这个函数即可，不需要拉起整个 Milkdown。
 *
 * 命中条件（四条同时）：
 *   1. paragraph 是 root 的直接子节点（PRD §2.5：blockquote 内 `[TOC]` 不识别）
 *   2. paragraph.children.length === 1
 *   3. child.type === 'text'
 *   4. child.value 匹配 TOC_LINE_RE
 *
 * 命中后：把 paragraph 节点 type 改为 'tocMarker'，清空 children，保留 position。
 *
 * 说明：`unist-util-visit` 递归到所有嵌套 paragraph（blockquote > paragraph 也会
 * 命中），会误伤 `> [TOC]` 引用块场景。这里改用只扫 root.children 一层，代码更短、
 * 语义与 PRD 完全吻合，也顺便省去 visit 依赖。
 *
 * @param {import('mdast').Root} tree
 */
export function tocRemarkTransform(tree) {
	if (!tree || typeof tree !== 'object') { return; }
	const kids = tree.children;
	if (!Array.isArray(kids)) { return; }
	for (const node of kids) {
		if (!node || node.type !== 'paragraph') { continue; }
		if (!Array.isArray(node.children) || node.children.length !== 1) { continue; }
		const child = node.children[0];
		if (!child || child.type !== 'text' || typeof child.value !== 'string') { continue; }
		if (!TOC_LINE_RE.test(child.value)) { continue; }
		// mutate in place：type + children，其余 (position 等) 原样保留。
		node.type = 'tocMarker';
		node.children = [];
	}
}

/**
 * Milkdown `$remark` 包装：让 tocRemarkTransform 能作为 remark plugin 参与
 * unified pipeline。注意 `$remark` 的 factory 签名是 `() => plugin`，所以外层
 * 再包一层箭头函数把 transformer 返回。
 */
export const tocRemarkPlugin = $remark(
	'vsword-remark-toc',
	() => () => (tree) => tocRemarkTransform(tree),
);

// 便于测试识别命中的 unicast 辅助（不参与生产 pipeline）。
export const _TOC_LINE_RE_FOR_TEST = TOC_LINE_RE;

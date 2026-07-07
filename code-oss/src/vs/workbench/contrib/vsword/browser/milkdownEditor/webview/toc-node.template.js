// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.1.a · TOC 占位符 Milkdown schema。
 *
 *  与 toc-remark.template.js 搭配：
 *    remark 层把 `[TOC]` paragraph 改写为 mdast `tocMarker` 节点；
 *    本 schema 把 mdast tocMarker 翻译成 PM 'toc_marker' 节点；
 *    save/serialize 时把 'toc_marker' 还原成 paragraph[text '[TOC]']，
 *    remark-stringify 再产出 `[TOC]` 字面量（PRD §4.7 · 决策 D-11 字节一致）。
 *
 *  NodeView 交互本轮不实现（占位骨架，b 卡负责）：
 *    - atom + selectable=false → 光标不落入
 *    - toDOM 输出一个 `<nav class="vsword-toc" data-toc="placeholder">目录</nav>`，
 *      供 b 卡后续替换成 heading 树；本轮只保证「有个占位标记 + 保存字节一致」
 *--------------------------------------------------------------------------------------------*/

import { $nodeSchema } from '@milkdown/utils';

export const TOC_NODE_NAME = 'toc_marker';
export const TOC_MDAST_TYPE = 'tocMarker';

/** 保源码：序列化时始终写这个字面量，不使用编辑期用户修改后的 attrs。 */
export const TOC_LITERAL = '[TOC]';

export const tocNode = $nodeSchema(TOC_NODE_NAME, () => ({
	group: 'block',
	atom: true,
	// selectable=false：占位符不作为可选中块，减少 Backspace 意外删除；
	// b 卡若要做「点击目录跳转」，会再自己启用点击事件（不依赖 PM 选中）。
	selectable: false,
	// 无 attrs：本轮占位符不携带任何状态，源码字面量固定 `[TOC]`。
	attrs: {},
	parseDOM: [{
		tag: 'nav.vsword-toc',
	}],
	toDOM: () => ['nav', {
		'class': 'vsword-toc',
		'data-toc': 'placeholder',
		'contenteditable': 'false',
	}, '目录'],
	parseMarkdown: {
		match: (node) => node.type === TOC_MDAST_TYPE,
		runner: (state, _node, type) => {
			state.addNode(type);
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === TOC_NODE_NAME,
		runner: (state, _node) => {
			// 还原为普通 paragraph[text '[TOC]']；remark-stringify 会输出 `[TOC]`。
			// 走 openNode('paragraph') + addNode('text', …) + closeNode 是 mdast
			// serializer 的常规套路（参考 preset-commonmark 的 paragraph toMarkdown）。
			state.openNode('paragraph');
			state.addNode('text', undefined, TOC_LITERAL);
			state.closeNode();
		},
	},
}));

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord T-3.5c.4 · Sub / Sup 装饰族
 *
 *  参照 highlight.template.js 的四件套 ($markSchema + $remark + $inputRule + $useKeymap)，
 *  两族共享一份 remark visitor（顺序：sub → sup），schema/inputRule/keymap 各自独立。
 *
 *  Data path:
 *    parse:  ~2~  --(vswordRemarkSubSup visitor · SUB_RE)--> mdast { type: 'subscript' }
 *            --(subscriptSchema.parseMarkdown)-->              PM mark 'subscript'
 *    write:  PM mark 'subscript'
 *            --(subscriptSchema.toMarkdown)-->                 mdast { type: 'subscript' }
 *            --(mdast→md toMarkdownExtensions.subscript)-->    ~2~
 *
 *  Won't-do（PRD Q2/NG）：
 *   - 不改成 unicode 下标 ₂ / 上标 ²；始终保源码 `~x~` / `^x^`
 *   - 不支持嵌套（inclusive: false）
 *--------------------------------------------------------------------------------------------*/

import { $markSchema, $remark, $inputRule, $useKeymap, $command } from '@milkdown/utils';
import { markRule } from '@milkdown/prose';
import { commandsCtx } from '@milkdown/core';
import { toggleMark } from '@milkdown/prose/commands';
import { visit } from 'unist-util-visit';
import { SUB_RE, SUP_RE, MARK_MARKER } from './sub-sup-helpers.mjs';

// Unified plugin: 双向 handler（parse 走 visit / stringify 走 toMarkdownExtensions）。
function vswordRemarkSubSup() {
	const data = this.data();
	const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
	toMarkdownExtensions.push({
		handlers: {
			subscript(node, _parent, state, info) {
				const tracker = state.createTracker(info);
				let value = tracker.move('~');
				value += tracker.move(state.containerPhrasing(node, { before: '~', after: '~' }));
				value += tracker.move('~');
				return value;
			},
			superscript(node, _parent, state, info) {
				const tracker = state.createTracker(info);
				let value = tracker.move('^');
				value += tracker.move(state.containerPhrasing(node, { before: '^', after: '^' }));
				value += tracker.move('^');
				return value;
			},
		},
		unsafe: [
			{ character: '~', inConstruct: ['phrasing'] },
			{ character: '^', inConstruct: ['phrasing'] },
		],
	});

	return tree => {
		// Sub 优先：`~x~` 已消费的区间不会再被 sup 扫描（分两遍避免重叠）。
		visit(tree, 'text', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const replaced = replaceOne(node.value, SUB_RE, 'subscript');
			if (replaced) { parent.children.splice(index, 1, ...replaced); return index + replaced.length; }
		});
		visit(tree, 'text', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const replaced = replaceOne(node.value, SUP_RE, 'superscript');
			if (replaced) { parent.children.splice(index, 1, ...replaced); return index + replaced.length; }
		});
	};
}

function replaceOne(text, re, kind) {
	if (typeof text !== 'string' || text.length === 0) return null;
	re.lastIndex = 0;
	if (!re.test(text)) return null;
	re.lastIndex = 0;
	const out = [];
	let cursor = 0;
	let m;
	while ((m = re.exec(text)) !== null) {
		if (m.index > cursor) out.push({ type: 'text', value: text.slice(cursor, m.index) });
		out.push({ type: kind, children: [{ type: 'text', value: m[1] }] });
		cursor = m.index + m[0].length;
	}
	if (cursor < text.length) out.push({ type: 'text', value: text.slice(cursor) });
	return out;
}

export const remarkSubSup = $remark('vsword-remark-sub-sup', () => vswordRemarkSubSup, {});

export const subscriptSchema = $markSchema('subscript', () => ({
	inclusive: false,
	parseDOM: [{ tag: 'sub' }],
	toDOM: () => ['sub', 0],
	parseMarkdown: {
		match: node => node.type === 'subscript',
		runner: (state, node, markType) => {
			state.openMark(markType);
			state.next(node.children);
			state.closeMark(markType);
		},
	},
	toMarkdown: {
		match: mark => mark.type.name === 'subscript',
		runner: (state, mark) => { state.withMark(mark, 'subscript'); },
	},
}));

export const superscriptSchema = $markSchema('superscript', () => ({
	inclusive: false,
	parseDOM: [{ tag: 'sup' }],
	toDOM: () => ['sup', 0],
	parseMarkdown: {
		match: node => node.type === 'superscript',
		runner: (state, node, markType) => {
			state.openMark(markType);
			state.next(node.children);
			state.closeMark(markType);
		},
	},
	toMarkdown: {
		match: mark => mark.type.name === 'superscript',
		runner: (state, mark) => { state.withMark(mark, 'superscript'); },
	},
}));

export const toggleSubscriptCommand = $command('ToggleSubscript', ctx => () => toggleMark(subscriptSchema.type(ctx)));
export const toggleSuperscriptCommand = $command('ToggleSuperscript', ctx => () => toggleMark(superscriptSchema.type(ctx)));

// InputRule：光标处输入闭合的 `~x~` / `^x^` 时套 mark（同 highlight 的 markRule 模式）。
// 与 remark visitor 双通道保证：粘贴/加载 md 走 remark visitor，交互输入走 inputRule。
export const subscriptInputRule = $inputRule(ctx =>
	markRule(/(?<!~)~([^~\s]+?)~$/, subscriptSchema.type(ctx), {})
);
export const superscriptInputRule = $inputRule(ctx =>
	markRule(/(?<!\^)\^([^\^\s]+?)\^$/, superscriptSchema.type(ctx), {})
);

// 快捷键：Typora 未定义 sub/sup 官方绑定，取 Ctrl+, / Ctrl+.（PRD F-17/18 建议）。
export const subscriptKeymap = $useKeymap('subscriptKeymap', {
	ToggleSubscript: {
		shortcuts: 'Mod-,',
		command: ctx => () => ctx.get(commandsCtx).call(toggleSubscriptCommand.key),
	},
});
export const superscriptKeymap = $useKeymap('superscriptKeymap', {
	ToggleSuperscript: {
		shortcuts: 'Mod-.',
		command: ctx => () => ctx.get(commandsCtx).call(toggleSuperscriptCommand.key),
	},
});

export const subSupPlugins = [
	remarkSubSup,
	subscriptSchema,
	superscriptSchema,
	toggleSubscriptCommand,
	toggleSuperscriptCommand,
	subscriptInputRule,
	superscriptInputRule,
	subscriptKeymap,
	superscriptKeymap,
].flat();

// re-export for verify.template.mjs 的独立断言
export { MARK_MARKER };

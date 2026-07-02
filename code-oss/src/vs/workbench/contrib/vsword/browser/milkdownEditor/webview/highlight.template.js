// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown highlight mark (T-3.3.7 — decision A: keep `==foo==` in-ecosystem).
 *
 *  Data path:
 *    parse:  ==foo==   --(vswordRemarkHighlight visitor)--> mdast { type: 'mark', children }
 *            --(this schema's parseMarkdown)-->             PM mark 'highlight' on inline
 *    write:  PM mark 'highlight'
 *            --(this schema's toMarkdown emits mdast 'mark')-->
 *            --(vswordRemarkHighlight stringify handler)-->  ==foo==
 *
 *  Self-contained: does NOT depend on remark-flexible-markers (parse-only) or mdast-util-mark
 *  (v1, incompatible with our v2 mdast-util-to-markdown). Parse regex mirrors Pandoc/Typora
 *  syntax: `==text==` with non-space boundaries.
 *--------------------------------------------------------------------------------------------*/

import { $markSchema, $remark, $inputRule, $useKeymap, $command } from '@milkdown/utils';
import { markRule } from '@milkdown/prose';
import { commandsCtx } from '@milkdown/core';
import { toggleMark } from '@milkdown/prose/commands';
import { visit } from 'unist-util-visit';

// Pandoc/Typora highlight regex: ==text==, non-space adjacent, no nested `=`.
const HIGHLIGHT_RE = /==(?![\s=])([^=]+?)(?<![\s=])==/g;

// Unified plugin: both parse (text -> mark node) and stringify (mark node -> ==text==).
function vswordRemarkHighlight() {
	const data = this.data();
	const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
	toMarkdownExtensions.push({
		handlers: {
			mark(node, _parent, state, info) {
				const tracker = state.createTracker(info);
				let value = tracker.move('==');
				value += tracker.move(state.containerPhrasing(node, { before: '=', after: '=' }));
				value += tracker.move('==');
				return value;
			},
		},
		unsafe: [{ character: '=', inConstruct: ['phrasing'] }],
	});

	return tree => {
		visit(tree, 'text', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const text = node.value;
			HIGHLIGHT_RE.lastIndex = 0;
			if (!HIGHLIGHT_RE.test(text)) return;
			HIGHLIGHT_RE.lastIndex = 0;
			const out = [];
			let cursor = 0;
			let m;
			while ((m = HIGHLIGHT_RE.exec(text)) !== null) {
				if (m.index > cursor) out.push({ type: 'text', value: text.slice(cursor, m.index) });
				out.push({ type: 'mark', children: [{ type: 'text', value: m[1] }] });
				cursor = m.index + m[0].length;
			}
			if (cursor < text.length) out.push({ type: 'text', value: text.slice(cursor) });
			parent.children.splice(index, 1, ...out);
			return index + out.length;
		});
	};
}

export const remarkHighlight = $remark('vsword-remark-highlight', () => vswordRemarkHighlight, {});

export const highlightSchema = $markSchema('highlight', () => ({
	inclusive: false,
	parseDOM: [{ tag: 'mark' }],
	toDOM: () => ['mark', 0],
	parseMarkdown: {
		match: node => node.type === 'mark',
		runner: (state, node, markType) => {
			state.openMark(markType);
			state.next(node.children);
			state.closeMark(markType);
		},
	},
	toMarkdown: {
		match: mark => mark.type.name === 'highlight',
		runner: (state, mark) => {
			state.withMark(mark, 'mark');
		},
	},
}));

export const toggleHighlightCommand = $command('ToggleHighlight', ctx => () => toggleMark(highlightSchema.type(ctx)));

// Typing `==foo==` inline turns text into highlight (same pattern as emphasis/strong).
export const highlightInputRule = $inputRule(ctx =>
	markRule(/==([^=]+)==$/, highlightSchema.type(ctx), {})
);

// Typora has no highlight shortcut; assign a non-conflicting one.
export const highlightKeymap = $useKeymap('highlightKeymap', {
	ToggleHighlight: {
		shortcuts: 'Mod-Shift-h',
		command: ctx => () => ctx.get(commandsCtx).call(toggleHighlightCommand.key),
	},
});

export const highlightPlugins = [
	remarkHighlight,
	highlightSchema,
	toggleHighlightCommand,
	highlightInputRule,
	highlightKeymap,
].flat();

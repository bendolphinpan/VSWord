// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown underline mark (T-3.3.7 — decision A: Typora 1:1 keymap).
 *
 *  Markdown lacks native underline; Typora stores it as raw HTML `<u>text</u>`. Remark parses
 *  `<u>` and `</u>` as separate inline `html` nodes, so this module ships a small unified
 *  plugin that rewrites `[html("<u>"), ...text, html("</u>")]` sibling runs into a synthetic
 *  `{ type: 'underline', children }` mdast node — round-tripped by our mark schema below.
 *--------------------------------------------------------------------------------------------*/

import { $markSchema, $remark, $useKeymap, $command } from '@milkdown/utils';
import { commandsCtx } from '@milkdown/core';
import { toggleMark } from '@milkdown/prose/commands';
import { visit } from 'unist-util-visit';

const OPEN_TAG = /^<u(\s[^>]*)?>$/i;
const CLOSE_TAG = /^<\/u\s*>$/i;

// Unified plugin: normalize inline <u>…</u> HTML pairs into a single `underline` mdast node.
// Also register a `toMarkdown` handler so serialization emits `<u>…</u>` back.
function remarkUnderline() {
	const data = this.data();
	const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
	toMarkdownExtensions.push({
		handlers: {
			underline(node, _parent, state, info) {
				const tracker = state.createTracker(info);
				let value = tracker.move('<u>');
				value += tracker.move(state.containerPhrasing(node, { before: '<', after: '<' }));
				value += tracker.move('</u>');
				return value;
			},
		},
	});

	return tree => {
		visit(tree, (parent) => {
			if (!parent || !Array.isArray(parent.children)) return;
			const out = [];
			let i = 0;
			while (i < parent.children.length) {
				const child = parent.children[i];
				if (child.type === 'html' && OPEN_TAG.test(child.value)) {
					// find matching close
					let close = -1;
					for (let j = i + 1; j < parent.children.length; j++) {
						const sibling = parent.children[j];
						if (sibling.type === 'html' && CLOSE_TAG.test(sibling.value)) { close = j; break; }
						if (sibling.type === 'html' && OPEN_TAG.test(sibling.value)) break; // nested, bail
					}
					if (close !== -1) {
						out.push({ type: 'underline', children: parent.children.slice(i + 1, close) });
						i = close + 1;
						continue;
					}
				}
				out.push(child);
				i++;
			}
			parent.children = out;
		});
	};
}

export const remarkUnderlinePlugin = $remark('vsword-remark-underline', () => remarkUnderline, {});

export const underlineSchema = $markSchema('underline', () => ({
	inclusive: true,
	parseDOM: [{ tag: 'u' }],
	toDOM: () => ['u', 0],
	parseMarkdown: {
		match: node => node.type === 'underline',
		runner: (state, node, markType) => {
			state.openMark(markType);
			state.next(node.children);
			state.closeMark(markType);
		},
	},
	toMarkdown: {
		match: mark => mark.type.name === 'underline',
		runner: (state, mark) => {
			state.withMark(mark, 'underline');
		},
	},
}));

export const toggleUnderlineCommand = $command('ToggleUnderline', ctx => () => toggleMark(underlineSchema.type(ctx)));

// Typora binding: Ctrl+U.
export const underlineKeymap = $useKeymap('underlineKeymap', {
	ToggleUnderline: {
		shortcuts: 'Mod-u',
		command: ctx => () => ctx.get(commandsCtx).call(toggleUnderlineCommand.key),
	},
});

export const underlinePlugins = [
	remarkUnderlinePlugin,
	underlineSchema,
	toggleUnderlineCommand,
	underlineKeymap,
].flat();

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown Typora-style shortcuts (T-3.3.7 — decisions Q1=a, Q3=b).
 *
 *  Complete 1:1 Typora Windows/Linux keymap. Every binding routes through commandsCtx
 *  so it composes with existing Milkdown plugins (commonmark / gfm / math / underline /
 *  highlight). Q3=b: shortcuts are no-ops when the cursor is inside a code_block,
 *  math_block, or math_inline node — implemented via an `isInCodeContext` guard reused
 *  from input-rules.template.js (shared helper below).
 *--------------------------------------------------------------------------------------------*/

import { $useKeymap, $command } from '@milkdown/utils';
import { commandsCtx, editorViewCtx } from '@milkdown/core';
import { setBlockType } from '@milkdown/prose/commands';
import {
	wrapInHeadingCommand,
	wrapInBulletListCommand,
	wrapInOrderedListCommand,
	wrapInBlockquoteCommand,
	createCodeBlockCommand,
	insertHrCommand,
	insertImageCommand,
	toggleStrongCommand,
	toggleEmphasisCommand,
	toggleInlineCodeCommand,
	toggleLinkCommand,
	paragraphSchema,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';

// Q3=b: True when the selection is inside code_block, math_block, or math_inline.
// Table cells / paragraphs are NOT code context — bold/italic still work there (Typora behaviour).
export function isInCodeContext(state) {
	const { $from } = state.selection;
	for (let d = $from.depth; d > 0; d--) {
		const name = $from.node(d).type.name;
		if (name === 'code_block' || name === 'math_block' || name === 'math_inline') return true;
	}
	return false;
}

// Wrap a command so it becomes a no-op when the cursor is inside a code/math node.
function guarded(commandFactory) {
	return ctx => {
		const inner = commandFactory(ctx);
		return (state, dispatch, view) => {
			if (isInCodeContext(state)) return false;
			return inner(state, dispatch, view);
		};
	};
}

// Turn current block into a paragraph (Typora Ctrl+0).
export const turnIntoParagraphCommand = $command('TurnIntoParagraph', ctx => () => (state, dispatch) => {
	return setBlockType(paragraphSchema.type(ctx))(state, dispatch);
});

// Insert a math_block (Typora Ctrl+Shift+M — same schema logic as slash menu).
export const insertMathBlockCommand = $command('InsertMathBlock', ctx => () => (state, dispatch) => {
	const mathBlock = state.schema.nodes.math_block;
	if (!mathBlock) return false;
	if (dispatch) dispatch(state.tr.replaceSelectionWith(mathBlock.create({ value: '' })));
	return true;
});

// Insert a task list item (Typora Ctrl+Shift+X — wrap in bullet then set checked=false on the item).
export const insertTaskListCommand = $command('InsertTaskList', ctx => () => (state, dispatch, view) => {
	const commands = ctx.get(commandsCtx);
	if (!commands.call(wrapInBulletListCommand.key)) return false;
	const editorView = ctx.get(editorViewCtx);
	const s = editorView.state;
	const { $from } = s.selection;
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		if (node.type.name === 'list_item') {
			editorView.dispatch(s.tr.setNodeMarkup($from.before(d), null, { ...node.attrs, checked: false }));
			return true;
		}
	}
	return true;
});

const dispatch = (ctx, key, ...args) => () => ctx.get(commandsCtx).call(key, ...args);

// The full Typora Windows keymap (Q1=a). Q3=b applies via `guarded` wrapper — inline
// mark toggles (bold/italic/strike/code/link) are guarded, block-turning ones are ALSO
// guarded because turning a code_block into a heading would corrupt syntax.
export const typoraShortcuts = $useKeymap('typoraShortcuts', {
	Heading1: { shortcuts: 'Mod-1', command: guarded(ctx => dispatch(ctx, wrapInHeadingCommand.key, 1)) },
	Heading2: { shortcuts: 'Mod-2', command: guarded(ctx => dispatch(ctx, wrapInHeadingCommand.key, 2)) },
	Heading3: { shortcuts: 'Mod-3', command: guarded(ctx => dispatch(ctx, wrapInHeadingCommand.key, 3)) },
	Heading4: { shortcuts: 'Mod-4', command: guarded(ctx => dispatch(ctx, wrapInHeadingCommand.key, 4)) },
	Heading5: { shortcuts: 'Mod-5', command: guarded(ctx => dispatch(ctx, wrapInHeadingCommand.key, 5)) },
	Heading6: { shortcuts: 'Mod-6', command: guarded(ctx => dispatch(ctx, wrapInHeadingCommand.key, 6)) },
	Paragraph: { shortcuts: 'Mod-0', command: guarded(ctx => dispatch(ctx, turnIntoParagraphCommand.key)) },
	Bold: { shortcuts: 'Mod-b', command: guarded(ctx => dispatch(ctx, toggleStrongCommand.key)) },
	Italic: { shortcuts: 'Mod-i', command: guarded(ctx => dispatch(ctx, toggleEmphasisCommand.key)) },
	InlineCode: { shortcuts: 'Mod-Shift-`', command: guarded(ctx => dispatch(ctx, toggleInlineCodeCommand.key)) },
	Strikethrough: { shortcuts: 'Alt-Shift-5', command: guarded(ctx => dispatch(ctx, toggleStrikethroughCommand.key)) },
	InsertLink: { shortcuts: 'Mod-k', command: guarded(ctx => dispatch(ctx, toggleLinkCommand.key)) },
	InsertImage: { shortcuts: 'Mod-Shift-i', command: guarded(ctx => dispatch(ctx, insertImageCommand.key, { src: '', alt: '', title: '' })) },
	CodeBlock: { shortcuts: 'Mod-Shift-k', command: guarded(ctx => dispatch(ctx, createCodeBlockCommand.key, '')) },
	MathBlock: { shortcuts: 'Mod-Shift-m', command: guarded(ctx => dispatch(ctx, insertMathBlockCommand.key)) },
	Blockquote: { shortcuts: 'Mod-Shift-q', command: guarded(ctx => dispatch(ctx, wrapInBlockquoteCommand.key)) },
	OrderedList: { shortcuts: 'Mod-Shift-o', command: guarded(ctx => dispatch(ctx, wrapInOrderedListCommand.key)) },
	UnorderedList: { shortcuts: 'Mod-Shift-u', command: guarded(ctx => dispatch(ctx, wrapInBulletListCommand.key)) },
	TaskList: { shortcuts: 'Mod-Shift-x', command: guarded(ctx => dispatch(ctx, insertTaskListCommand.key)) },
	InsertTable: { shortcuts: 'Mod-t', command: guarded(ctx => dispatch(ctx, insertTableCommand.key)) },
	HorizontalRule: { shortcuts: 'Mod-Shift--', command: guarded(ctx => dispatch(ctx, insertHrCommand.key)) },
});

// Ordered list of shortcut names for verify assertions (must match the map above).
export const TYPORA_SHORTCUT_IDS = [
	'Heading1','Heading2','Heading3','Heading4','Heading5','Heading6','Paragraph',
	'Bold','Italic','InlineCode','Strikethrough','InsertLink','InsertImage',
	'CodeBlock','MathBlock','Blockquote','OrderedList','UnorderedList','TaskList',
	'InsertTable','HorizontalRule',
];

export const typoraShortcutPlugins = [
	turnIntoParagraphCommand,
	insertMathBlockCommand,
	insertTaskListCommand,
	typoraShortcuts,
].flat();

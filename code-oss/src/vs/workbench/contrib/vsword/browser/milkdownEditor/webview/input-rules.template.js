// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown input rules & auto-pair (T-3.3.7 — decisions Q2=b+c, Q3=b).
 *
 *  Q2=b: `---` (HR), `$$` (math block), `$…$` (inline math) are already provided by
 *        preset-commonmark and @milkdown/plugin-math; we only add `==foo==` (via
 *        highlight.template.js) here — this file mostly hosts the auto-pair plugin.
 *  Q2=c: 7 auto-pair symbols with VS Code-style skip-when-adjacent and select-wrap behaviour.
 *  Q3=b: All rules are no-ops inside code_block / math_block / math_inline (via
 *        isInCodeContext helper from shortcuts.template.js).
 *--------------------------------------------------------------------------------------------*/

import { $prose } from '@milkdown/utils';
import { Plugin } from '@milkdown/prose/state';
import { isInCodeContext } from './shortcuts.mjs';

// Q2=c: 7 auto-pair rules — key = opening char, value = closing char.
export const AUTO_PAIRS = Object.freeze({
	'(': ')',
	'[': ']',
	'{': '}',
	'`': '`',
	'"': '"',
	'*': '*',
	'$': '$',
});

const CLOSERS = new Set(Object.values(AUTO_PAIRS));

/**
 * Handle a keypress for auto-pairing. Returns true if the event was handled.
 *
 * Rules:
 *   1. Open char + empty selection at cursor NOT immediately preceded by alpha/digit
 *      => insert `<open><close>` and place cursor between them.
 *   2. Open char + non-empty selection => wrap selection with `<open>selection<close>`.
 *   3. Close char at cursor when the next char is exactly that close char => skip the
 *      insert (advance the cursor by one instead) — VS Code behaviour.
 *   4. Any typing inside code_block / math_block / math_inline: bail out entirely (Q3=b).
 */
function handleAutoPair(view, event) {
	const key = event.key;
	if (key.length !== 1) return false;
	const { state } = view;
	if (isInCodeContext(state)) return false;
	const { selection } = state;
	const $from = selection.$from;

	// Rule 3: skip-when-adjacent — pressing `)` while the char to the right is already `)`.
	if (CLOSERS.has(key) && selection.empty) {
		const parent = $from.parent;
		if (parent.isTextblock) {
			const posInParent = $from.parentOffset;
			const text = parent.textContent;
			if (text[posInParent] === key) {
				view.dispatch(state.tr.setSelection(state.selection.constructor.near(state.doc.resolve($from.pos + 1))));
				event.preventDefault();
				return true;
			}
		}
	}

	const closer = AUTO_PAIRS[key];
	if (!closer) return false;

	// Rule 2: wrap non-empty selection.
	if (!selection.empty) {
		const from = selection.from;
		const to = selection.to;
		const tr = state.tr
			.insertText(closer, to)
			.insertText(key, from);
		view.dispatch(tr);
		event.preventDefault();
		return true;
	}

	// Rule 1: empty selection — only pair when preceded by non-alphanumeric (avoids
	// interfering with e.g. `won't` typing a `'` after `n`).
	const posInParent = $from.parentOffset;
	const text = $from.parent.textContent;
	const prev = posInParent > 0 ? text[posInParent - 1] : '';
	if (/[A-Za-z0-9]/.test(prev)) return false;

	// Also avoid double-pairing symmetric closers when the *next* char is the same closer
	// already (e.g. don't insert `**` inside an existing `*|*` cursor).
	const next = text[posInParent] || '';
	if (next === closer) return false;

	view.dispatch(state.tr.insertText(key + closer).setSelection(
		state.selection.constructor.near(state.doc.resolve($from.pos + 1))
	));
	event.preventDefault();
	return true;
}

// Backspace at `<open>|<close>` deletes the whole pair (Typora / VS Code behaviour).
function handleBackspacePair(view, event) {
	if (event.key !== 'Backspace') return false;
	const { state } = view;
	if (isInCodeContext(state)) return false;
	const { selection } = state;
	if (!selection.empty) return false;
	const $from = selection.$from;
	const posInParent = $from.parentOffset;
	const text = $from.parent.textContent;
	if (posInParent === 0) return false;
	const prev = text[posInParent - 1];
	const next = text[posInParent] || '';
	if (AUTO_PAIRS[prev] === next) {
		view.dispatch(state.tr.delete($from.pos - 1, $from.pos + 1));
		event.preventDefault();
		return true;
	}
	return false;
}

export const autoPairPlugin = $prose(() => new Plugin({
	props: {
		handleKeyDown(view, event) {
			return handleBackspacePair(view, event) || handleAutoPair(view, event);
		},
	},
}));

export const inputRulePlugins = [autoPairPlugin];

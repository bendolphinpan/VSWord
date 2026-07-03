/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8 — block handle & menu helpers.
//
// Pure functions the block handle DOM uses. No Milkdown / DOM imports — mocha
// can exercise every branch under jsdom-free node.
//
// Two things live here:
//
//   1. TRANSFORM_ITEMS: the canonical list of "convert current block to …"
//      entries the handle menu shows. Deliberately narrower than the slash
//      menu (which also inserts *new* blocks like image / table); this list
//      only holds actions that make sense as a conversion of an existing
//      textblock.
//
//   2. Selection-shape helpers (isTransformable, nodeTypeLabel, …) that
//      decide whether a menu entry is enabled for the currently-selected
//      block. Callers pass in a minimal `{ typeName }` shape so tests don't
//      need a real ProseMirror node.

// ---- Transform catalogue ------------------------------------------------------

/**
 * Convert-to items. Each entry:
 *   id       — stable string, mirrors the slash-menu id where possible.
 *   label    — Chinese display label (concise, no "Heading 1" verbosity).
 *   command  — command key name the handle menu asks the editor to run;
 *              null means the caller handles the transform inline (math_block
 *              is inserted directly via a ProseMirror tr).
 *   shortcut — Ctrl+…-style hint shown at the right of the menu row so users
 *              learn keyboard equivalents. Empty string = no shortcut yet.
 *   from     — node types this action is meaningful *from*. `'*'` = anywhere.
 */
export const TRANSFORM_ITEMS = Object.freeze([
	{ id: 'paragraph', label: '正文',       command: 'turnIntoTextCommand',       shortcut: 'Ctrl+0', from: '*' },
	{ id: 'h1',        label: '标题 1',      command: 'wrapInHeadingCommand',      shortcut: 'Ctrl+1', from: '*', arg: 1 },
	{ id: 'h2',        label: '标题 2',      command: 'wrapInHeadingCommand',      shortcut: 'Ctrl+2', from: '*', arg: 2 },
	{ id: 'h3',        label: '标题 3',      command: 'wrapInHeadingCommand',      shortcut: 'Ctrl+3', from: '*', arg: 3 },
	{ id: 'h4',        label: '标题 4',      command: 'wrapInHeadingCommand',      shortcut: 'Ctrl+4', from: '*', arg: 4 },
	{ id: 'quote',     label: '引用',       command: 'wrapInBlockquoteCommand',   shortcut: 'Ctrl+Shift+Q', from: '*' },
	{ id: 'bullet',    label: '无序列表',   command: 'wrapInBulletListCommand',   shortcut: 'Ctrl+Shift+8', from: '*' },
	{ id: 'ordered',   label: '有序列表',   command: 'wrapInOrderedListCommand',  shortcut: 'Ctrl+Shift+7', from: '*' },
	{ id: 'code',      label: '代码块',     command: 'createCodeBlockCommand',    shortcut: 'Ctrl+Shift+K', from: '*' },
	{ id: 'math',      label: '数学块',     command: null,                        shortcut: '',       from: '*' },
]);

/**
 * Non-transform actions in the same menu, kept in a second group so the UI
 * can render a divider between them.
 */
export const BLOCK_ACTIONS = Object.freeze([
	{ id: 'duplicate', label: '复制段落', shortcut: 'Ctrl+D' },
	{ id: 'delete',    label: '删除段落', shortcut: 'Ctrl+Shift+Backspace' },
	{ id: 'moveUp',    label: '上移',    shortcut: 'Alt+Shift+↑' },
	{ id: 'moveDown',  label: '下移',    shortcut: 'Alt+Shift+↓' },
]);

// ---- Predicates ---------------------------------------------------------------

/** Node types the handle should attach to. Table & list_item are excluded per Q5=b. */
export const HANDLE_ELIGIBLE = new Set([
	'paragraph', 'heading', 'blockquote',
	'bullet_list', 'ordered_list',
	'code_block', 'math_block',
	'horizontal_rule', 'image',
]);

/**
 * Q5=b — mirror plugin-block's default node filter plus one extra: never
 * attach the handle to a bare `list_item` (drag the whole list instead).
 * Callers pass the immediate parent chain so we can veto list_item ancestors.
 *
 * @param {{ typeName: string }} node
 * @param {string[]} ancestorTypeNames  outer→inner list of ancestor names
 */
export function shouldShowHandle(node, ancestorTypeNames) {
	if (!node || !HANDLE_ELIGIBLE.has(node.typeName)) return false;
	if (Array.isArray(ancestorTypeNames)) {
		for (const t of ancestorTypeNames) {
			if (t === 'table') return false;
			if (t === 'list_item') return false;
		}
	}
	return true;
}

/** Human label for the block type, used in menu title. */
export function nodeTypeLabel(typeName, attrs) {
	switch (typeName) {
		case 'heading':         return `标题 ${(attrs && attrs.level) || ''}`.trim();
		case 'paragraph':       return '正文';
		case 'blockquote':      return '引用';
		case 'bullet_list':     return '无序列表';
		case 'ordered_list':    return '有序列表';
		case 'code_block':      return '代码块';
		case 'math_block':      return '数学块';
		case 'horizontal_rule': return '分隔线';
		case 'image':           return '图片';
		default:                return typeName || '';
	}
}

/**
 * A transform item is enabled unless it targets exactly the current block's
 * shape (already-a-heading-level-2 → "标题 2" disabled).
 */
export function isTransformEnabled(item, node) {
	if (!item || !node) return false;
	if (item.id === 'paragraph' && node.typeName === 'paragraph') return false;
	if (item.id === 'quote'     && node.typeName === 'blockquote') return false;
	if (item.id === 'bullet'    && node.typeName === 'bullet_list') return false;
	if (item.id === 'ordered'   && node.typeName === 'ordered_list') return false;
	if (item.id === 'code'      && node.typeName === 'code_block')  return false;
	if (item.id === 'math'      && node.typeName === 'math_block')  return false;
	if (/^h[1-6]$/.test(item.id) && node.typeName === 'heading' && node.attrs && node.attrs.level === item.arg) return false;
	return true;
}

/** Group entries for the menu into `[transforms, actions]` in render order. */
export function buildMenuGroups(node) {
	const transforms = TRANSFORM_ITEMS.map(it => ({
		...it,
		enabled: isTransformEnabled(it, node),
	}));
	return {
		title: nodeTypeLabel(node && node.typeName, node && node.attrs),
		transforms,
		actions: BLOCK_ACTIONS.map(a => ({ ...a, enabled: true })),
	};
}

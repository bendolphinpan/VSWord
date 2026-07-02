// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown slash menu (T-3.3.3 — decisions Q1=b / Q2=b / Q3=a).
 *
 *  Builds a grouped floating command palette triggered by `/` at the start of an empty
 *  text block. All 12 commands map to STANDARD Markdown nodes (commonmark / gfm / math /
 *  Typora-compatible callout via blockquote), so no on-disk format is invented.
 *
 *  Bundled by build-milkdown-editor.cjs into vendor/index.js.
 *--------------------------------------------------------------------------------------------*/

import { slashFactory, SlashProvider } from '@milkdown/plugin-slash';
import { commandsCtx, editorViewCtx } from '@milkdown/core';
import {
	wrapInHeadingCommand,
	wrapInBulletListCommand,
	wrapInOrderedListCommand,
	wrapInBlockquoteCommand,
	createCodeBlockCommand,
	insertHrCommand,
	insertImageCommand,
} from '@milkdown/preset-commonmark';
import { insertTableCommand } from '@milkdown/preset-gfm';

export const slash = slashFactory('vsword-slash');

// ---- Q1=b: 12 standard-Markdown commands, grouped per Q2=b -----------------------------------
const GROUP_ORDER = ['Text', 'List', 'Media', 'Advanced'];

function item(id, label, group, hint, run) {
	return { id, label, group, hint, run };
}

export const SLASH_ITEMS = [
	// Text
	item('h1', 'Heading 1', 'Text', '# ', ctx => ctx.get(commandsCtx).call(wrapInHeadingCommand.key, 1)),
	item('h2', 'Heading 2', 'Text', '## ', ctx => ctx.get(commandsCtx).call(wrapInHeadingCommand.key, 2)),
	item('h3', 'Heading 3', 'Text', '### ', ctx => ctx.get(commandsCtx).call(wrapInHeadingCommand.key, 3)),
	// List
	item('bullet', 'Bullet List', 'List', '- ', ctx => ctx.get(commandsCtx).call(wrapInBulletListCommand.key)),
	item('ordered', 'Numbered List', 'List', '1. ', ctx => ctx.get(commandsCtx).call(wrapInOrderedListCommand.key)),
	item('task', 'Task List', 'List', '- [ ] ', ctx => {
		ctx.get(commandsCtx).call(wrapInBulletListCommand.key);
		const view = ctx.get(editorViewCtx);
		const { state } = view;
		const { $from } = state.selection;
		for (let depth = $from.depth; depth > 0; depth--) {
			const node = $from.node(depth);
			if (node.type.name === 'list_item') {
				view.dispatch(state.tr.setNodeMarkup($from.before(depth), null, { ...node.attrs, checked: false }));
				break;
			}
		}
	}),
	// Media
	item('image', 'Image', 'Media', '![alt](url)', ctx => ctx.get(commandsCtx).call(insertImageCommand.key, { src: '', alt: '', title: '' })),
	item('table', 'Table', 'Media', '2×3', ctx => ctx.get(commandsCtx).call(insertTableCommand.key)),
	// Advanced
	item('code', 'Code Block', 'Advanced', '```', ctx => ctx.get(commandsCtx).call(createCodeBlockCommand.key, '')),
	item('math', 'Math Block', 'Advanced', '$$', ctx => {
		const view = ctx.get(editorViewCtx);
		const { state } = view;
		const mathBlock = state.schema.nodes.math_block;
		if (!mathBlock) return;
		view.dispatch(state.tr.replaceSelectionWith(mathBlock.create({ value: '' })));
	}),
	item('quote', 'Quote', 'Advanced', '> ', ctx => ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key)),
	item('divider', 'Divider', 'Advanced', '---', ctx => ctx.get(commandsCtx).call(insertHrCommand.key)),
];

// ---- Q3=a: only trigger at start of an empty text block, with `/` as the first char ----------
function shouldShowSlash(view) {
	const { selection } = view.state;
	if (!selection.empty) return false;
	const parent = selection.$from.parent;
	if (!parent.isTextblock) return false;
	// The whole block's text must literally start with `/`. This guarantees "row/column start"
	// per Q3=a — URLs like `http://` never match because they have chars before the slash.
	return parent.textContent.startsWith('/');
}

function getFilter(view) {
	const text = view.state.selection.$from.parent.textContent;
	return text.startsWith('/') ? text.slice(1).toLowerCase() : '';
}

function filterItems(query) {
	if (!query) return SLASH_ITEMS.slice();
	return SLASH_ITEMS.filter(it =>
		it.id.toLowerCase().includes(query) ||
		it.label.toLowerCase().includes(query) ||
		it.group.toLowerCase().includes(query)
	);
}

// Return items in the exact order the DOM shows them (grouped by GROUP_ORDER) so
// ArrowUp/ArrowDown match visual sequence.
function orderForNav(items) {
	const out = [];
	for (const g of GROUP_ORDER) for (const it of items) if (it.group === g) out.push(it);
	return out;
}

function stripTrigger(view) {
	const { state } = view;
	const { $from } = state.selection;
	const start = $from.before($from.depth) + 1; // inside the textblock, position 0
	view.dispatch(state.tr.delete(start, $from.pos));
}

function renderMenu(container, orderedItems, activeIndex) {
	container.textContent = '';
	if (!orderedItems.length) {
		const empty = document.createElement('div');
		empty.className = 'vsword-slash-empty';
		empty.textContent = 'No matches';
		container.appendChild(empty);
		return;
	}
	let lastGroup = null;
	orderedItems.forEach((it, idx) => {
		if (it.group !== lastGroup) {
			const header = document.createElement('div');
			header.className = 'vsword-slash-group';
			header.textContent = it.group.toUpperCase();
			container.appendChild(header);
			lastGroup = it.group;
		}
		const row = document.createElement('div');
		row.className = 'vsword-slash-item' + (idx === activeIndex ? ' active' : '');
		row.dataset.id = it.id;
		row.dataset.index = String(idx);
		row.setAttribute('role', 'option');
		const label = document.createElement('span');
		label.className = 'vsword-slash-label';
		label.textContent = it.label;
		const hint = document.createElement('span');
		hint.className = 'vsword-slash-hint';
		hint.textContent = it.hint;
		row.appendChild(label);
		row.appendChild(hint);
		container.appendChild(row);
	});
}

/**
 * Wire up the slash menu against a live editor. Returns { destroy, onKey } — the caller
 * (entry.template.js) installs onKey as a capturing keydown listener so it can intercept
 * ArrowUp/ArrowDown/Enter/Escape before ProseMirror sees them.
 */
export function attachSlashMenu(ctx, editorRoot) {
	const content = document.createElement('div');
	content.className = 'vsword-slash-menu';
	content.setAttribute('role', 'listbox');
	// Prevent the editor from losing focus when the user clicks the menu.
	content.addEventListener('mousedown', e => e.preventDefault());

	const state = {
		view: null,
		visible: [],       // ordered list currently rendered
		activeIndex: 0,
		open: false,
	};

	const provider = new SlashProvider({
		content,
		root: editorRoot,
		shouldShow: shouldShowSlash,
		debounce: 20,
		offset: 8,
	});
	provider.onShow = () => { state.open = true; };
	provider.onHide = () => { state.open = false; };

	function refresh(view) {
		state.view = view;
		const query = getFilter(view);
		const ordered = orderForNav(filterItems(query));
		if (state.activeIndex >= ordered.length) state.activeIndex = 0;
		state.visible = ordered;
		renderMenu(content, ordered, state.activeIndex);
	}

	function runActive() {
		if (!state.open || !state.visible.length || !state.view) return false;
		const chosen = state.visible[state.activeIndex];
		if (!chosen) return false;
		stripTrigger(state.view);
		try {
			chosen.run(ctx);
		} catch (err) {
			console.error('[vsword-slash] command failed:', chosen.id, err);
		}
		provider.hide();
		state.view.focus();
		return true;
	}

	content.addEventListener('click', e => {
		const row = e.target.closest('.vsword-slash-item');
		if (!row) return;
		const idx = Number(row.dataset.index);
		if (Number.isFinite(idx)) {
			state.activeIndex = idx;
			runActive();
		}
	});

	return {
		update(view, prevState) {
			provider.update(view, prevState);
			if (shouldShowSlash(view)) refresh(view);
		},
		destroy() {
			provider.destroy();
			content.remove();
		},
		onKey(event) {
			if (!state.open || !state.visible.length) {
				// Still let Escape close a stuck menu.
				if (state.open && event.key === 'Escape') {
					provider.hide();
					return true;
				}
				return false;
			}
			if (event.key === 'ArrowDown') {
				state.activeIndex = (state.activeIndex + 1) % state.visible.length;
				renderMenu(content, state.visible, state.activeIndex);
				return true;
			}
			if (event.key === 'ArrowUp') {
				state.activeIndex = (state.activeIndex - 1 + state.visible.length) % state.visible.length;
				renderMenu(content, state.visible, state.activeIndex);
				return true;
			}
			if (event.key === 'Enter') return runActive();
			if (event.key === 'Escape') { provider.hide(); return true; }
			return false;
		},
	};
}

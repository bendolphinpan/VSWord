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
// T-3.5c.6 F-24: 追加 3 个 syntax-completion 快速入口（emoji/footnote/frontmatter），新增 Syntax 分组。
const GROUP_ORDER = ['Text', 'List', 'Media', 'Advanced', 'Syntax'];

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
	// T-3.5c.6 F-24: syntax-completion 三个快速入口。emoji/footnote/frontmatter 都是
	// remark round-trip 建立的节点（不是编辑内插入的 schema），最稳妥的做法是直接把
	// 保源码文本插到选区，让保存 → 重解析路径自动接管；用户当下也能看到 shortcode。
	item('emoji', 'Emoji', 'Syntax', ':smile:', ctx => {
		const view = ctx.get(editorViewCtx);
		const { state } = view;
		// 保源码策略：插入 `:smile: ` 让 emoji inputRule (空格触发) 直接转成 atom。
		view.dispatch(state.tr.insertText(':smile: '));
	}),
	item('footnote', 'Footnote', 'Syntax', '[^1]', ctx => {
		const view = ctx.get(editorViewCtx);
		const { state } = view;
		// 引用 `[^1]` 由 preset-gfm 在下次 parse 时识别为 footnote_reference；
		// 光标定位在引用后。用户需自行在文末补 `[^1]: 定义`。
		view.dispatch(state.tr.insertText('[^1]'));
	}),
	item('frontmatter', 'Frontmatter', 'Syntax', '---', ctx => {
		const view = ctx.get(editorViewCtx);
		const { state } = view;
		// F-10 语义：frontmatter 必须在文档最顶部（前无非空白）才识别。
		// 只在光标位于文档第一个空段落时才插入完整 YAML 骨架 + 空行；
		// 否则退化为普通 `---\ntitle: \n---` 文本（保源码，下次保存-重解析视位置识别）。
		const skeleton = '---\ntitle: \n---\n\n';
		const { $from } = state.selection;
		const atDocStart = $from.pos <= 2 && $from.parent.isTextblock
			&& $from.parent.textContent.length <= 1; // 允许只剩一个 `/` 触发字符
		const text = atDocStart ? skeleton : '---\ntitle: \n---';
		view.dispatch(state.tr.insertText(text));
	}),
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

/**
 * @param {HTMLElement} scrollEl  .vsword-slash-scroll（真正滚动的内层）
 */
function renderMenu(scrollEl, orderedItems, activeIndex) {
	scrollEl.textContent = '';
	if (!orderedItems.length) {
		const empty = document.createElement('div');
		empty.className = 'vsword-slash-empty';
		empty.textContent = 'No matches';
		scrollEl.appendChild(empty);
		return;
	}
	let lastGroup = null;
	let activeEl = null;
	orderedItems.forEach((it, idx) => {
		if (it.group !== lastGroup) {
			const header = document.createElement('div');
			header.className = 'vsword-slash-group';
			header.textContent = it.group.toUpperCase();
			scrollEl.appendChild(header);
			lastGroup = it.group;
		}
		const row = document.createElement('div');
		row.className = 'vsword-slash-item' + (idx === activeIndex ? ' active' : '');
		row.dataset.id = it.id;
		row.dataset.index = String(idx);
		row.setAttribute('role', 'option');
		if (idx === activeIndex) {
			row.setAttribute('aria-selected', 'true');
			activeEl = row;
		}
		const label = document.createElement('span');
		label.className = 'vsword-slash-label';
		label.textContent = it.label;
		const hint = document.createElement('span');
		hint.className = 'vsword-slash-hint';
		hint.textContent = it.hint;
		row.appendChild(label);
		row.appendChild(hint);
		scrollEl.appendChild(row);
	});
	// 键盘上下：让 active 项滚进可视区（nearest，不抖整页）
	if (activeEl && typeof activeEl.scrollIntoView === 'function') {
		try {
			activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		} catch {
			try { activeEl.scrollIntoView(false); } catch { /* noop */ }
		}
	}
}

/**
 * Wire up the slash menu against a live editor. Returns { destroy, onKey } — the caller
 * (entry.template.js) installs onKey as a capturing keydown listener so it can intercept
 * ArrowUp/ArrowDown/Enter/Escape before ProseMirror sees them.
 */
export function attachSlashMenu(ctx, editorRoot) {
	// 外层：裁剪 + 固定视觉宽度；内层：滚动且 **隐藏原生滚动条宽度**，高亮才能左右全宽
	const content = document.createElement('div');
	content.className = 'vsword-slash-menu';
	content.setAttribute('role', 'listbox');
	const scrollEl = document.createElement('div');
	scrollEl.className = 'vsword-slash-scroll';
	content.appendChild(scrollEl);
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
	provider.onShow = () => {
		state.open = true;
		showMenuVisible();
	};
	provider.onHide = () => {
		state.open = false;
		try {
			content.setAttribute('data-hidden', 'true');
			content.hidden = true;
			content.style.display = 'none';
		} catch { /* noop */ }
	};

	function hideMenu() {
		try { provider.hide(); } catch { /* noop */ }
		state.open = false;
		// 强制隐藏，防止 provider 残留可见
		try {
			content.setAttribute('data-hidden', 'true');
			content.hidden = true;
			content.style.display = 'none';
		} catch { /* noop */ }
	}

	function showMenuVisible() {
		try {
			content.removeAttribute('data-hidden');
			content.hidden = false;
			content.style.display = '';
		} catch { /* noop */ }
	}

	function refresh(view) {
		state.view = view;
		const query = getFilter(view);
		const ordered = orderForNav(filterItems(query));
		if (state.activeIndex >= ordered.length) state.activeIndex = 0;
		state.visible = ordered;
		showMenuVisible();
		renderMenu(scrollEl, ordered, state.activeIndex);
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
		hideMenu();
		try { state.view.focus(); } catch { /* noop */ }
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

	// 失焦 / 点菜单外 → 关闭（用户反馈常驻不消失）
	const onDocPointerDown = (e) => {
		if (!state.open) return;
		const t = e.target;
		if (t && content.contains(t)) return;
		hideMenu();
	};
	const onWinBlur = () => { if (state.open) hideMenu(); };
	document.addEventListener('mousedown', onDocPointerDown, true);
	document.addEventListener('pointerdown', onDocPointerDown, true);
	window.addEventListener('blur', onWinBlur);

	return {
		update(view, prevState) {
			provider.update(view, prevState);
			if (shouldShowSlash(view)) {
				refresh(view);
			} else if (state.open) {
				// 条件不再满足（删掉 /、光标离开空行等）→ 必须关掉
				hideMenu();
			}
		},
		destroy() {
			document.removeEventListener('mousedown', onDocPointerDown, true);
			document.removeEventListener('pointerdown', onDocPointerDown, true);
			window.removeEventListener('blur', onWinBlur);
			try { provider.destroy(); } catch { /* noop */ }
			try { content.remove(); } catch { /* noop */ }
		},
		onKey(event) {
			if (!state.open || !state.visible.length) {
				// Still let Escape close a stuck menu.
				if (state.open && event.key === 'Escape') {
					hideMenu();
					return true;
				}
				return false;
			}
			if (event.key === 'ArrowDown') {
				state.activeIndex = (state.activeIndex + 1) % state.visible.length;
				renderMenu(scrollEl, state.visible, state.activeIndex);
				try { event.preventDefault(); event.stopPropagation(); } catch { /* noop */ }
				return true;
			}
			if (event.key === 'ArrowUp') {
				state.activeIndex = (state.activeIndex - 1 + state.visible.length) % state.visible.length;
				renderMenu(scrollEl, state.visible, state.activeIndex);
				try { event.preventDefault(); event.stopPropagation(); } catch { /* noop */ }
				return true;
			}
			if (event.key === 'Enter') {
				const ok = runActive();
				if (ok) {
					try { event.preventDefault(); event.stopPropagation(); } catch { /* noop */ }
				}
				return ok;
			}
			if (event.key === 'Escape') {
				hideMenu();
				try { event.preventDefault(); event.stopPropagation(); } catch { /* noop */ }
				return true;
			}
			return false;
		},
	};
}

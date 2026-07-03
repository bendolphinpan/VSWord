// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  T-3.5.2 + T-3.5.3: image NodeView — 8-handle resize (aspect locked) + caption
 *  editor. Same wrapper, same chrome-visibility rules, so both features share a
 *  single lifecycle.
 *
 *  Layout:
 *    <span.vsword-img-wrap[data-selected] contenteditable="false">
 *      <img>
 *      <span.vsword-img-caption>alt text</span>       (T-3.5.3, only when alt !== '')
 *      <button.vsword-img-edit-alt>改文字</button>    (T-3.5.3)
 *      <span.vsword-img-handle[data-handle="…"]>…</span>  (× 8)
 *    </span>
 *
 *  Chrome (handles + edit button + optional popover) is only visible when the
 *  wrap has `data-selected="true"` or the wrap is hovered — Q7=a on both
 *  features. The caption itself is ALWAYS visible (Q2=a for T-3.5.3) — it's
 *  the reader's "alt as caption" surface.
 *
 *  Drag → commit contract (T-3.5.2 / Q6=a): mousedown snapshots startX,
 *  mousemove mutates img.style.width live, mouseup dispatches a single
 *  setNodeMarkup transaction — one undo pops the whole resize.
 *
 *  Alt → commit contract (T-3.5.3 / Q3=a): "改文字" button opens a small
 *  popover below the image with a plain <input>; Enter or "保存" dispatches
 *  setNodeMarkup with the new alt, Escape or click-outside cancels.
 *--------------------------------------------------------------------------------------------*/

import { $view } from '@milkdown/utils';
import { imageSchemaOverride } from './image-schema-override.mjs';
import { HANDLE_DIRECTIONS, widthFromDrag, normalizeAlign, IMAGE_ALIGNS } from './image-resize.mjs';

const HANDLES = /** @type {const} */ (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

/** Trim & collapse only outer whitespace; keep interior spaces (CJK / prose need them). */
export function normalizeAlt(raw) {
	if (raw == null) return '';
	return String(raw).replace(/\r?\n/g, ' ').replace(/^\s+|\s+$/g, '');
}

export const imageResizeNodeView = $view(imageSchemaOverride.node, () => (node, view, getPos) => {
	const doc = view.dom.ownerDocument;
	const wrap = doc.createElement('span');
	wrap.className = 'vsword-img-wrap';
	wrap.contentEditable = 'false';
	wrap.dataset.selected = 'false';

	const img = doc.createElement('img');
	wrap.appendChild(img);

	// T-3.5.3: caption (Q1=a: alt IS the caption, single source of truth).
	// Rendered as a sibling so image + text stack cleanly and captions never
	// participate in the image's intrinsic sizing.
	const captionEl = doc.createElement('span');
	captionEl.className = 'vsword-img-caption';
	wrap.appendChild(captionEl);

	// T-3.5.3: "图片标注" trigger. Only surfaces when the wrap is selected/hovered
	// (same rules as resize handles), sits at the bottom-right corner.
	const editBtn = doc.createElement('button');
	editBtn.type = 'button';
	editBtn.className = 'vsword-img-edit-alt';
	editBtn.textContent = '图片标注';
	editBtn.setAttribute('aria-label', 'Edit image alt text (caption)');
	wrap.appendChild(editBtn);
	editBtn.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });
	editBtn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); openAltPopover(); });

	// T-3.5.4: 3-button align group at the bottom-left, same visibility rules
	// as the "图片标注" button. Each button toggles: clicking the currently
	// active align resets to left (null).
	const alignBar = doc.createElement('span');
	alignBar.className = 'vsword-img-align-bar';
	wrap.appendChild(alignBar);
	/** @type {Record<string, HTMLButtonElement>} */
	const alignBtns = {};
	for (const [key, label] of [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']]) {
		const b = doc.createElement('button');
		b.type = 'button';
		b.className = 'vsword-img-align-btn';
		b.dataset.align = key;
		b.textContent = label;
		b.setAttribute('aria-label', 'Align ' + key);
		b.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });
		b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); commitAlign(key); });
		alignBar.appendChild(b);
		alignBtns[key] = b;
	}

	const handleEls = HANDLES.map(h => {
		const el = doc.createElement('span');
		el.className = 'vsword-img-handle';
		el.dataset.handle = h;
		el.setAttribute('aria-hidden', 'true');
		wrap.appendChild(el);
		el.addEventListener('mousedown', ev => beginDrag(ev, h));
		return el;
	});

	applyAttrs(node);

	/** @type {{ handle: string, startX: number, startWidth: number, container: number } | null} */
	let drag = null;
	/** @type {HTMLElement | null} */
	let popover = null;

	function applyAttrs(n) {
		img.src = n.attrs.src;
		img.alt = n.attrs.alt || '';
		if (n.attrs.title) img.title = n.attrs.title; else img.removeAttribute('title');
		if (n.attrs.width > 0) {
			img.setAttribute('width', String(n.attrs.width));
			img.style.width = n.attrs.width + 'px';
		} else {
			img.removeAttribute('width');
			img.style.width = '';
		}
		img.style.height = 'auto';
		// Caption: only render text when alt is non-empty (Q5=a). Empty alt →
		// zero-height caption so no ghost slot.
		const alt = normalizeAlt(n.attrs.alt);
		captionEl.textContent = alt;
		wrap.dataset.hasCaption = alt ? 'true' : 'false';
		// T-3.5.4 align. `null` == left (unwrapped short syntax on serialize).
		const align = normalizeAlign(n.attrs.align);
		wrap.dataset.align = align || 'left';
		for (const key of IMAGE_ALIGNS) {
			alignBtns[key].dataset.active = ((align || 'left') === key) ? 'true' : 'false';
		}
	}

	function commitAlt(nextAlt) {
		const pos = typeof getPos === 'function' ? getPos() : null;
		if (typeof pos !== 'number') return;
		const current = view.state.doc.nodeAt(pos);
		if (!current || current.type.name !== 'image') return;
		const normalized = normalizeAlt(nextAlt);
		if (current.attrs.alt === normalized) return;
		const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, alt: normalized });
		view.dispatch(tr);
	}

	/**
	 * T-3.5.4: apply align to this image. Q4=b — when the image shares a
	 * paragraph with siblings, split the paragraph so this image gets its own
	 * block-level container. That way each image can be aligned independently
	 * without alignment fighting (a `<p align>` wrapper is block-level and
	 * cannot host arbitrary sibling inlines from a different alignment).
	 *
	 * Clicking the currently active align resets to null (left, short syntax).
	 */
	function commitAlign(nextAlign) {
		const pos = typeof getPos === 'function' ? getPos() : null;
		if (typeof pos !== 'number') return;
		const state = view.state;
		const current = state.doc.nodeAt(pos);
		if (!current || current.type.name !== 'image') return;
		const currentAlign = normalizeAlign(current.attrs.align);
		// Toggle: clicking the active align resets to null. 'left' is stored
		// as null so users can distinguish "no wrapper" from an explicit choice.
		let target = normalizeAlign(nextAlign) || (nextAlign === 'left' ? null : normalizeAlign(nextAlign));
		if ((currentAlign || 'left') === (target || 'left')) target = null;
		if (currentAlign === target) return;

		const $pos = state.doc.resolve(pos);
		const parent = $pos.parent;
		const paragraphType = state.schema.nodes.paragraph;
		let tr = state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, align: target });

		// Only split when the parent is a paragraph that has other content
		// besides this image. If the image is already alone in a paragraph, or
		// its parent isn't a paragraph (e.g. list item body — rare), skip.
		if (parent && parent.type === paragraphType && parent.childCount > 1) {
			// Positions of the image start/end within the doc.
			const imgStart = pos;
			const imgEnd = pos + current.nodeSize;
			const paraStart = $pos.before($pos.depth);
			const paraEnd = paraStart + parent.nodeSize;
			// If there's content after the image, split at imgEnd first so the
			// tail becomes its own paragraph. Then split before the image so
			// the image sits in a paragraph by itself. Order matters — split
			// from the back so earlier positions stay valid.
			if (imgEnd < paraEnd - 1) tr = tr.split(imgEnd);
			if (imgStart > paraStart + 1) tr = tr.split(imgStart);
		}
		view.dispatch(tr);
	}

	// T-3.5.3 popover: bare-DOM, no framework. Escape / click-outside cancels;
	// Enter or Save commits. Only one popover at a time — reopen replaces.
	function openAltPopover() {
		closeAltPopover();
		const pop = doc.createElement('div');
		pop.className = 'vsword-img-alt-popover';
		const input = doc.createElement('input');
		input.type = 'text';
		input.className = 'vsword-img-alt-input';
		input.value = node.attrs.alt || '';
		input.placeholder = '图注文本 (alt)';
		const save = doc.createElement('button');
		save.type = 'button';
		save.className = 'vsword-img-alt-save';
		save.textContent = '保存';
		pop.appendChild(input);
		pop.appendChild(save);
		wrap.appendChild(pop);
		popover = pop;

		const commit = () => { commitAlt(input.value); closeAltPopover(); };
		const cancel = () => closeAltPopover();
		input.addEventListener('keydown', ev => {
			if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
			else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
		});
		save.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });
		save.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); commit(); });
		// Swallow selection-losing events on the popover surface itself.
		pop.addEventListener('mousedown', ev => ev.stopPropagation());
		// Click outside → cancel. Bound on next tick so the opening click doesn't fire it.
		setTimeout(() => doc.addEventListener('mousedown', outsideHandler, true), 0);

		input.focus();
		input.select();
	}
	function closeAltPopover() {
		if (!popover) return;
		popover.remove();
		popover = null;
		doc.removeEventListener('mousedown', outsideHandler, true);
	}
	function outsideHandler(ev) {
		if (popover && !popover.contains(ev.target)) closeAltPopover();
	}

	function beginDrag(ev, handle) {
		if (ev.button !== 0) return;
		const dir = HANDLE_DIRECTIONS[handle];
		if (!dir || dir.sign === 0) { ev.preventDefault(); return; }
		ev.preventDefault();
		ev.stopPropagation();
		const rect = img.getBoundingClientRect();
		const container = wrap.parentElement?.getBoundingClientRect().width ?? rect.width * 4;
		drag = { handle, startX: ev.clientX, startWidth: rect.width, container: Math.max(0, Math.floor(container)) };
		wrap.dataset.resizing = 'true';
		doc.addEventListener('mousemove', onMove, true);
		doc.addEventListener('mouseup', onUp, true);
	}
	function onMove(ev) {
		if (!drag) return;
		img.style.width = widthFromDrag(drag.handle, drag.startWidth, drag.startX, ev.clientX, drag.container) + 'px';
	}
	function onUp(ev) {
		if (!drag) return;
		const w = widthFromDrag(drag.handle, drag.startWidth, drag.startX, ev.clientX, drag.container);
		doc.removeEventListener('mousemove', onMove, true);
		doc.removeEventListener('mouseup', onUp, true);
		wrap.removeAttribute('data-resizing');
		drag = null;
		const pos = typeof getPos === 'function' ? getPos() : null;
		if (typeof pos !== 'number') return;
		const currentNode = view.state.doc.nodeAt(pos);
		if (!currentNode || currentNode.type.name !== 'image') return;
		if (currentNode.attrs.width === w) return;
		view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, width: w }));
	}

	return {
		dom: wrap,
		update(next) {
			if (next.type.name !== 'image') return false;
			applyAttrs(next);
			return true;
		},
		selectNode() { wrap.dataset.selected = 'true'; },
		deselectNode() { wrap.dataset.selected = 'false'; closeAltPopover(); },
		stopEvent(ev) {
			// Keep chrome events out of PM's default handling: handles, edit
			// button, and any popover contents.
			if (!(ev.target instanceof HTMLElement)) return false;
			if (ev.target.classList.contains('vsword-img-handle')) return true;
			if (ev.target.closest('.vsword-img-edit-alt, .vsword-img-alt-popover')) return true;
			return false;
		},
		ignoreMutation() { return true; },
		destroy() {
			doc.removeEventListener('mousemove', onMove, true);
			doc.removeEventListener('mouseup', onUp, true);
			closeAltPopover();
			handleEls.forEach(el => el.remove());
		},
	};
});

/** Bundle for `.use(...)` — override the built-in schema, add the html-lift, add the view. */
export const imageResizePlugins = [imageSchemaOverride, imageResizeNodeView];

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  T-3.5.2: image NodeView — 8-handle resize with aspect ratio locked.
 *
 *  Layout:
 *    <span.vsword-img-wrap[data-selected] contenteditable="false">
 *      <img>
 *      <span.vsword-img-handle[data-handle="nw"]>…</span>  (× 8)
 *    </span>
 *
 *  Chrome (handles) is only visible when the wrap has `data-selected="true"`
 *  or the wrap is hovered — Q7=a. Selection sync piggybacks on ProseMirror's
 *  selectNode / deselectNode callbacks.
 *
 *  Drag → commit contract (Q6=a):
 *    - mousedown on handle: snapshot startX / startWidth / handle id.
 *    - mousemove: mutate `img.style.width` only — no doc mutation, so it's
 *      free-form and instant.
 *    - mouseup: dispatch a single `setNodeMarkup` tr with the new `width`
 *      attr; one undo pops the whole resize.
 *
 *  All eight handles collapse to a signed horizontal delta (see
 *  widthFromDrag in image-resize.mjs). n/s (top/bottom edge) handles are
 *  inert under aspect lock — they render for visual completeness but drag
 *  as no-ops.
 *--------------------------------------------------------------------------------------------*/

import { $view } from '@milkdown/utils';
import { imageSchemaOverride } from './image-schema-override.mjs';
import { HANDLE_DIRECTIONS, widthFromDrag } from './image-resize.mjs';

const HANDLES = /** @type {const} */ (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

export const imageResizeNodeView = $view(imageSchemaOverride.node, () => (node, view, getPos) => {
	const doc = view.dom.ownerDocument;
	const wrap = doc.createElement('span');
	wrap.className = 'vsword-img-wrap';
	wrap.contentEditable = 'false';
	wrap.dataset.selected = 'false';

	const img = doc.createElement('img');
	wrap.appendChild(img);

	// Handles: purely decorative until the wrap is [data-selected="true"]; CSS
	// hides them by default and reveals on selection/hover so the reader view
	// stays clean.
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
		// Height ALWAYS auto — aspect ratio comes from intrinsic pixels.
		img.style.height = 'auto';
	}

	function beginDrag(ev, handle) {
		if (ev.button !== 0) return;
		const dir = HANDLE_DIRECTIONS[handle];
		if (!dir || dir.sign === 0) {
			// n/s edge handles are inert (aspect-locked) — swallow the event
			// so it doesn't fall through to text selection but do nothing.
			ev.preventDefault();
			return;
		}
		ev.preventDefault();
		ev.stopPropagation();
		const rect = img.getBoundingClientRect();
		const container = wrap.parentElement?.getBoundingClientRect().width ?? rect.width * 4;
		drag = {
			handle,
			startX: ev.clientX,
			startWidth: rect.width,
			container: Math.max(0, Math.floor(container)),
		};
		wrap.dataset.resizing = 'true';
		doc.addEventListener('mousemove', onMove, true);
		doc.addEventListener('mouseup', onUp, true);
	}

	function onMove(ev) {
		if (!drag) return;
		const w = widthFromDrag(drag.handle, drag.startWidth, drag.startX, ev.clientX, drag.container);
		img.style.width = w + 'px';
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
		const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, width: w });
		view.dispatch(tr);
	}

	return {
		dom: wrap,
		update(next) {
			if (next.type.name !== 'image') return false;
			applyAttrs(next);
			return true;
		},
		selectNode() { wrap.dataset.selected = 'true'; },
		deselectNode() { wrap.dataset.selected = 'false'; },
		stopEvent(ev) {
			// Keep resize handle events out of ProseMirror's normal handling.
			return ev.target instanceof HTMLElement && ev.target.classList.contains('vsword-img-handle');
		},
		ignoreMutation() { return true; },
		destroy() {
			doc.removeEventListener('mousemove', onMove, true);
			doc.removeEventListener('mouseup', onUp, true);
			handleEls.forEach(el => el.remove());
		},
	};
});

/** Bundle for `.use(...)` — override the built-in schema, add the html-lift, add the view. */
export const imageResizePlugins = [imageSchemaOverride, imageResizeNodeView];

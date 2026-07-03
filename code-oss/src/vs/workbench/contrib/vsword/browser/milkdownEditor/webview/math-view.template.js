/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.9 — math NodeViews (block + inline).
//
// Q1=c: click a rendered math node → the same node stays visible (render on
// top), and a <textarea> opens below/beside it with the raw LaTeX. Live
// preview flows on each keystroke; Esc / click-outside / Enter (block only)
// commits. Errors get a red border + tooltip via KaTeX ParseError detection.
//
// Two NodeViews:
//   • mathBlockView  — atom node whose LaTeX lives in attrs.value.
//   • mathInlineView — atom node whose LaTeX lives in text children.
//
// Rendering itself reuses katex.render(); the raw content decides between
// display mode (block) vs inline.

import { $view } from '@milkdown/utils';
import { mathBlockSchema, mathInlineSchema, katexOptionsCtx } from '@milkdown/plugin-math';
import katex from 'katex';
import {
	normalizeLatex,
	detectKatexError,
	buildKatexOpts,
	latexIsEmpty,
	autoSizeHeightPx,
} from './math-view-helpers.mjs';

// ---- KaTeX ctx setup --------------------------------------------------------

/**
 * Called from entry.template.js `.config()` — installs the "don't crash on bad
 * syntax" preset so plugin-math's own toDOM path is also safe on load, before
 * users click into edit mode.
 */
export function configureMathKatex(ctx) {
	// KaTeX's own default merges display via caller, so a single "safe" option
	// bag works for both math_inline (displayMode:false) and math_block
	// (displayMode:true), because plugin-math forces displayMode itself in its
	// two schemas' toDOM. We supply the *shared* safety flags here.
	ctx.set(katexOptionsCtx.key, {
		throwOnError: false,
		errorColor: '#cc0000',
		strict: 'ignore',
	});
}

// ---- Shared rendering ------------------------------------------------------

function renderKatex(target, source, displayMode) {
	const opts = buildKatexOpts({ displayMode });
	target.textContent = '';
	if (latexIsEmpty(source)) {
		const hint = document.createElement('span');
		hint.className = 'vsword-math-placeholder';
		hint.textContent = displayMode ? '空数学块 — 点击编辑' : '空数学';
		target.appendChild(hint);
		target.dataset.error = '';
		return;
	}
	try {
		katex.render(source, target, opts);
		target.dataset.error = '';
	} catch (err) {
		// With throwOnError:false, KaTeX itself renders the error span; but if
		// something upstream (invalid unicode etc.) still throws, we degrade to
		// a plain-text fallback + surface the message.
		const msg = detectKatexError(err) || String(err.message || err);
		target.textContent = source;
		target.dataset.error = msg;
	}
}

// ---- Block NodeView --------------------------------------------------------

function mathBlockViewFactory(ctx) {
	return (node, view, getPos) => {
		const doc = view.dom.ownerDocument;
		const dom = doc.createElement('div');
		dom.className = 'vsword-math-block';
		dom.dataset.type = 'math_block';

		const preview = doc.createElement('div');
		preview.className = 'vsword-math-preview';

		const editor = doc.createElement('div');
		editor.className = 'vsword-math-editor';
		editor.hidden = true;

		const textarea = doc.createElement('textarea');
		textarea.className = 'vsword-math-source';
		textarea.spellcheck = false;
		textarea.setAttribute('aria-label', 'LaTeX 源码');

		const errBar = doc.createElement('div');
		errBar.className = 'vsword-math-error';
		errBar.hidden = true;

		editor.append(textarea, errBar);
		dom.append(preview, editor);

		let editing = false;
		let current = node.attrs.value || '';

		function render() {
			renderKatex(preview, current, true);
			const err = preview.dataset.error;
			errBar.hidden = !err;
			errBar.textContent = err || '';
			dom.classList.toggle('has-error', !!err);
		}

		function enterEdit() {
			if (editing) return;
			editing = true;
			editor.hidden = false;
			textarea.value = current;
			textarea.style.height = autoSizeHeightPx(current) + 'px';
			dom.classList.add('is-editing');
			// Defer focus so the click that opened us doesn't blur immediately.
			queueMicrotask(() => textarea.focus());
		}

		function commit() {
			if (!editing) return;
			editing = false;
			editor.hidden = true;
			dom.classList.remove('is-editing');
			const next = normalizeLatex(textarea.value);
			if (next !== current) {
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos != null) {
					const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, value: next });
					view.dispatch(tr);
					// The dispatch triggers `update()` below with the new node.
					return;
				}
			}
		}

		function cancel() {
			if (!editing) return;
			editing = false;
			editor.hidden = true;
			dom.classList.remove('is-editing');
		}

		preview.addEventListener('mousedown', (e) => {
			// Preview click enters edit — swallow so PM doesn't move selection
			// into the atom.
			e.preventDefault();
			e.stopPropagation();
			enterEdit();
		});
		textarea.addEventListener('input', () => {
			current = textarea.value;
			textarea.style.height = autoSizeHeightPx(current) + 'px';
			render();
		});
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') { e.preventDefault(); textarea.value = current = node.attrs.value || ''; render(); cancel(); view.focus(); return; }
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); view.focus(); return; }
		});
		textarea.addEventListener('blur', () => { commit(); });

		render();

		return {
			dom,
			// Atom → no contentDOM.
			update(nextNode) {
				if (nextNode.type.name !== 'math_block') return false;
				current = nextNode.attrs.value || '';
				if (!editing) render();
				return true;
			},
			stopEvent(event) {
				// While editing, keep every keystroke inside the textarea.
				return editing && editor.contains(event.target);
			},
			ignoreMutation() { return true; },
			destroy() {
				preview.textContent = '';
				editor.remove();
			},
			selectNode() { dom.classList.add('is-selected'); },
			deselectNode() { dom.classList.remove('is-selected'); },
		};
	};
}

// ---- Inline NodeView -------------------------------------------------------

function mathInlineViewFactory(ctx) {
	return (node, view, getPos) => {
		const doc = view.dom.ownerDocument;
		const dom = doc.createElement('span');
		dom.className = 'vsword-math-inline';
		dom.dataset.type = 'math_inline';

		const preview = doc.createElement('span');
		preview.className = 'vsword-math-inline-preview';

		const input = doc.createElement('input');
		input.type = 'text';
		input.className = 'vsword-math-inline-source';
		input.spellcheck = false;
		input.hidden = true;
		input.setAttribute('aria-label', 'LaTeX 源码');

		dom.append(preview, input);

		let editing = false;
		let current = node.textContent || '';

		function render() {
			renderKatex(preview, current, false);
			const err = preview.dataset.error;
			dom.classList.toggle('has-error', !!err);
			if (err) dom.setAttribute('title', err); else dom.removeAttribute('title');
		}

		function enterEdit() {
			if (editing) return;
			editing = true;
			preview.hidden = true;
			input.hidden = false;
			input.value = current;
			input.style.width = Math.max(4, current.length + 2) + 'ch';
			dom.classList.add('is-editing');
			queueMicrotask(() => { input.focus(); input.select(); });
		}

		function commit() {
			if (!editing) return;
			editing = false;
			input.hidden = true;
			preview.hidden = false;
			dom.classList.remove('is-editing');
			const next = normalizeLatex(input.value);
			if (next !== current) {
				const pos = typeof getPos === 'function' ? getPos() : null;
				if (pos != null) {
					const from = pos + 1;
					const to = pos + node.nodeSize - 1;
					const tr = next
						? view.state.tr.replaceWith(from, to, view.state.schema.text(next))
						: view.state.tr.delete(from, to);
					view.dispatch(tr);
					return;
				}
			}
			render();
		}

		function cancel() {
			if (!editing) return;
			editing = false;
			input.hidden = true;
			preview.hidden = false;
			dom.classList.remove('is-editing');
		}

		preview.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			enterEdit();
		});
		input.addEventListener('input', () => {
			current = input.value;
			input.style.width = Math.max(4, current.length + 2) + 'ch';
			render();
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') { e.preventDefault(); input.value = current = node.textContent || ''; render(); cancel(); view.focus(); return; }
			if (e.key === 'Enter')  { e.preventDefault(); commit(); view.focus(); return; }
		});
		input.addEventListener('blur', () => { commit(); });

		render();

		return {
			dom,
			update(nextNode) {
				if (nextNode.type.name !== 'math_inline') return false;
				current = nextNode.textContent || '';
				if (!editing) render();
				return true;
			},
			stopEvent(event) {
				return editing && input.contains(event.target);
			},
			ignoreMutation() { return true; },
			destroy() {
				preview.textContent = '';
				input.remove();
			},
			selectNode() { dom.classList.add('is-selected'); },
			deselectNode() { dom.classList.remove('is-selected'); },
		};
	};
}

// ---- Exports ---------------------------------------------------------------

export const mathBlockView  = $view(mathBlockSchema.node,  mathBlockViewFactory);
export const mathInlineView = $view(mathInlineSchema.node, mathInlineViewFactory);
export const mathViewPlugins = [mathBlockView, mathInlineView];

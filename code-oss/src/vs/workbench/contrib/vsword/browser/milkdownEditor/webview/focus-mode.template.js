// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown focus / edit-context feedback (T-3.3.2 Q2=b+c).
 *
 *  This module wires two things:
 *
 *  (1) Focus/typewriter mode for reading mode:
 *      In reading mode the shell CSS dims all top-level PM children to opacity 0.35.
 *      This plugin adds `.vsword-focus-active` to the block that contains the current
 *      selection, restoring it to full opacity. When the cursor moves the class hops.
 *      Additionally, when the shell is in reading mode we scroll the active block to
 *      the vertical center of the viewport (typewriter mode).
 *
 *  (2) Edit-context visual feedback for every mode:
 *      Adds `.vsword-edit-context` to the block containing the cursor. CSS renders a
 *      left color bar + tinted background. This gives the "I'm editing this block"
 *      cue Q2=b asked for.
 *
 *  Both are Milkdown $prose plugins driven by the same selection observer, so they
 *  cost a single DOM traversal per selection change.
 *--------------------------------------------------------------------------------------------*/

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const KEY = new PluginKey('vsword-focus-and-context');

function computeActiveTopLevelBlock(state) {
	const sel = state.selection;
	if (!sel || !sel.$from) return null;
	const doc = state.doc;
	// Walk up from the selection anchor to a direct child of the doc.
	const depth = sel.$from.depth;
	if (depth === 0) return { pos: 0, node: doc.firstChild };
	const topPos = sel.$from.before(1);
	const topNode = doc.nodeAt(topPos);
	if (!topNode) return null;
	return { pos: topPos, node: topNode };
}

function buildDecorations(state) {
	const active = computeActiveTopLevelBlock(state);
	if (!active) return DecorationSet.empty;
	const to = active.pos + active.node.nodeSize;
	return DecorationSet.create(state.doc, [
		Decoration.node(active.pos, to, { class: 'vsword-focus-active vsword-edit-context' }),
	]);
}

export const focusAndContextPlugin = $prose(() => {
	return new Plugin({
		key: KEY,
		state: {
			init: (_conf, state) => buildDecorations(state),
			apply: (_tr, _oldSet, _oldState, newState) => buildDecorations(newState),
		},
		props: {
			decorations(state) {
				return this.getState(state);
			},
		},
		view(view) {
			let rafId = 0;
			function centerActive() {
				if (rafId) cancelAnimationFrame(rafId);
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					const shell = view.dom.closest('.vsword-md-shell');
					if (!shell || shell.getAttribute('data-mode') !== 'reading') return;
					const active = view.dom.querySelector('.vsword-focus-active');
					if (!active) return;
					active.scrollIntoView({ block: 'center', behavior: 'smooth' });
				});
			}
			// Center once on install so that entering reading mode lands nicely.
			centerActive();
			return {
				update(_v, _prev) { centerActive(); },
				destroy() { if (rafId) cancelAnimationFrame(rafId); },
			};
		},
	});
});

export const focusModePlugins = [focusAndContextPlugin];

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown focus / typewriter / edit-context plugin.
 *
 *  T-3.10 rewrite: Focus and Typewriter are decoupled from reading mode.
 *  T-3.12.3.a rewrite: focus & typewriter merged into a single `substyle` radio
 *  (normal | focus | typewriter). The shell now exposes ONE attribute driving
 *  both CSS gates and this plugin's decoration/scroll behaviour.
 *
 *  Shell attributes drive rendering:
 *    data-mode      = realtime | reading | source
 *    data-substyle  = normal | focus | typewriter   (mutually exclusive · reading mode always renders normal, stored value preserved)
 *
 *  What this plugin still owns:
 *    (1) Decoration: `.vsword-focus-active vsword-edit-context` on the top-level
 *        block containing the selection. Always emitted; CSS gates on
 *        data-substyle=focus (or data-mode=reading kept for reading-mode
 *        auto-dim visual — still owned by CSS layer, not by this plugin's
 *        typewriter gate).
 *    (2) Typewriter re-scroll: when data-substyle=typewriter AND the cursor's
 *        viewport Y coordinate crossed a line boundary since last centering,
 *        scroll the active block to viewport center. Line-change (not
 *        selection-change) avoids the "jitter every keystroke" failure mode.
 *--------------------------------------------------------------------------------------------*/

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const KEY = new PluginKey('vsword-focus-and-context');

function computeActiveTopLevelBlock(state) {
	const sel = state.selection;
	if (!sel || !sel.$from) return null;
	const doc = state.doc;
	if (sel.$from.depth === 0) return { pos: 0, node: doc.firstChild };
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

/** True when the shell wants the typewriter recenter behaviour right now. */
function typewriterEnabled(shell) {
	if (!shell) return false;
	// T-3.12.3.a: single-source substyle radio drives this. The old reading-mode
	// legacy fallback (auto-typewriter under reading) is removed per PRD §6 AC-6.
	return shell.getAttribute('data-substyle') === 'typewriter';
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
			const shell = view.dom.closest('.vsword-md-shell');
			let rafId = 0;
			let lastCenterY = -1; // viewport-Y of the caret at last recenter (Q2=c line-change gate)

			function currentCaretY() {
				try {
					const { from } = view.state.selection;
					const coords = view.coordsAtPos(from);
					return coords.top;
				} catch { return null; }
			}

			function maybeRecenter(force) {
				if (!typewriterEnabled(shell)) { lastCenterY = -1; return; }
				if (rafId) cancelAnimationFrame(rafId);
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					const y = currentCaretY();
					if (y == null) return;
					// Q2=c: only recenter on line boundary crossings. 8px = ~half of a
					// typical line-height; anything less is intra-line micro-movement.
					if (!force && lastCenterY >= 0 && Math.abs(y - lastCenterY) < 8) return;
					const active = view.dom.querySelector('.vsword-focus-active');
					if (!active) return;
					active.scrollIntoView({ block: 'center', behavior: 'smooth' });
					lastCenterY = y;
				});
			}

			// Recenter once on install so entering typewriter/reading lands nicely.
			maybeRecenter(true);

			// Observe shell attribute flips so switching typewriter on triggers an
			// immediate center (otherwise the user has to type a char first).
			const attrObserver = shell ? new MutationObserver(() => maybeRecenter(true)) : null;
			if (attrObserver && shell) {
				attrObserver.observe(shell, { attributes: true, attributeFilter: ['data-substyle', 'data-mode'] });
			}

			return {
				update() { maybeRecenter(false); },
				destroy() {
					if (rafId) cancelAnimationFrame(rafId);
					attrObserver?.disconnect();
				},
			};
		},
	});
});

export const focusModePlugins = [focusAndContextPlugin];

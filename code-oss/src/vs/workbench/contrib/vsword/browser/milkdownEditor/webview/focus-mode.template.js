// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord Milkdown focus / typewriter / edit-context plugin.
 *
 *  T-3.10 rewrite: Focus and Typewriter are decoupled from reading mode.
 *  T-3.12.3.a rewrite: focus & typewriter merged into a single `substyle` radio
 *  (normal | focus | typewriter). The shell now exposes ONE attribute driving
 *  both CSS gates and this plugin's decoration/scroll behaviour.
 *  T-3.13.3 rewrite: focus 模式下 decoration 集合 = cursor 行 ∪ hover 行 (最多 2 块).
 *  mousemove debounce ~50ms · substyle 切离 focus 或 mouseleave 时清 hover · 无累积残留.
 *
 *  Shell attributes drive rendering:
 *    data-mode      = realtime | reading | source
 *    data-substyle  = normal | focus | typewriter   (mutually exclusive · reading mode always renders normal, stored value preserved)
 *
 *  What this plugin still owns:
 *    (1) Decoration: `.vsword-focus-active vsword-edit-context` 挂在 cursor 所在
 *        top-level block, 以及 (仅 data-substyle=focus 时) 鼠标 hover 所在
 *        top-level block. CSS gates on data-substyle=focus (or data-mode=reading
 *        kept for reading-mode auto-dim visual — still owned by CSS layer,
 *        not by this plugin's typewriter gate).
 *    (2) Typewriter re-scroll: when data-substyle=typewriter AND the cursor's
 *        viewport Y coordinate crossed a line boundary since last centering,
 *        scroll the active block to viewport center. Line-change (not
 *        selection-change) avoids the "jitter every keystroke" failure mode.
 *--------------------------------------------------------------------------------------------*/

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const KEY = new PluginKey('vsword-focus-and-context');

/**
 * 根据文档任意 pos 定位其所在的 top-level block。
 * pos 为 null / 越界时返回 null (呼叫方决定跳过还是走 doc.firstChild fallback)。
 */
function topLevelBlockAt(state, pos) {
	if (pos == null || !Number.isFinite(pos)) return null;
	const doc = state.doc;
	const size = doc.content.size;
	const clamped = Math.max(0, Math.min(pos, size));
	let $pos;
	try { $pos = doc.resolve(clamped); } catch { return null; }
	if ($pos.depth === 0) {
		// 光标落在 doc 根 (空文档 / 边界), 直接命中第一个 block.
		return doc.firstChild ? { pos: 0, node: doc.firstChild } : null;
	}
	const topPos = $pos.before(1);
	const topNode = doc.nodeAt(topPos);
	if (!topNode) return null;
	return { pos: topPos, node: topNode };
}

function computeActiveTopLevelBlock(state) {
	const sel = state.selection;
	if (!sel || !sel.$from) return null;
	return topLevelBlockAt(state, sel.$from.pos);
}

/**
 * T-3.13.3: 组合 cursor 行与 hover 行 (若命中且非同一 block) 生成 decoration.
 * cursor 行始终参与; hover 行仅当 hoverPos !== null 且落在与 cursor 不同的 top-level
 * block 时参与. 保证 AC-3.1 "任意时刻 .vsword-focus-active ≤ 2".
 */
function buildDecorations(state, hoverPos) {
	const blocks = [];
	const cursor = computeActiveTopLevelBlock(state);
	if (cursor) blocks.push(cursor);
	if (hoverPos != null) {
		const hover = topLevelBlockAt(state, hoverPos);
		if (hover && (!cursor || hover.pos !== cursor.pos)) blocks.push(hover);
	}
	if (blocks.length === 0) return DecorationSet.empty;
	return DecorationSet.create(
		state.doc,
		blocks.map(b => Decoration.node(b.pos, b.pos + b.node.nodeSize, {
			class: 'vsword-focus-active vsword-edit-context',
		})),
	);
}

/** True when the shell wants the typewriter recenter behaviour right now. */
function typewriterEnabled(shell) {
	if (!shell) return false;
	// T-3.12.3.a: single-source substyle radio drives this. The old reading-mode
	// legacy fallback (auto-typewriter under reading) is removed per PRD §6 AC-6.
	return shell.getAttribute('data-substyle') === 'typewriter';
}

/** True when hover 高亮行为 enabled (仅 substyle=focus 下). */
function hoverEnabled(shell) {
	if (!shell) return false;
	return shell.getAttribute('data-substyle') === 'focus';
}

export const focusAndContextPlugin = $prose(() => {
	return new Plugin({
		key: KEY,
		state: {
			init: (_conf, state) => ({
				hoverPos: null,
				decos: buildDecorations(state, null),
			}),
			apply: (tr, prev, _oldState, newState) => {
				const meta = tr.getMeta(KEY);
				let hoverPos = prev.hoverPos;
				if (meta && Object.prototype.hasOwnProperty.call(meta, 'hoverPos')) {
					hoverPos = meta.hoverPos;
				}
				// hoverPos 需要在文档变更后 map 过去; 简单起见: 文档变更时清 hover,
				// mousemove 下一帧会重新 posAtCoords 补上. 这样避免 hover 落在被删掉的
				// pos 上导致 decoration 挂到错误 block.
				if (tr.docChanged && hoverPos != null) hoverPos = null;
				return {
					hoverPos,
					decos: buildDecorations(newState, hoverPos),
				};
			},
		},
		props: {
			decorations(state) {
				return this.getState(state).decos;
			},
		},
		view(view) {
			const shell = view.dom.closest('.vsword-md-shell');
			let rafId = 0;
			let lastCenterY = -1; // viewport-Y of the caret at last recenter (Q2=c line-change gate)

			// ---- scroll helpers (typewriter 2/3 · normal/focus caret-in-view) --------
			function scrollerEl() {
				return view.dom.closest('#milkdown-root') || view.dom.parentElement;
			}

			function currentCaretY() {
				try {
					const { from } = view.state.selection;
					const coords = view.coordsAtPos(from);
					return coords.top;
				} catch { return null; }
			}

			/**
			 * Typewriter：把光标行滚到 scroller 视口约 2/3 高度（中下），
			 * 末行也保持该高度（用 padding-bottom 兜底，见 milkdownEditorHtml）。
			 */
			function scrollCaretToRatio(ratio) {
				const scroller = scrollerEl();
				if (!scroller) return;
				let coords;
				try {
					coords = view.coordsAtPos(view.state.selection.from);
				} catch { return; }
				const rect = scroller.getBoundingClientRect();
				const caretDocY = coords.top - rect.top + scroller.scrollTop;
				const target = caretDocY - rect.height * ratio;
				const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
				scroller.scrollTop = Math.max(0, Math.min(maxScroll, target));
			}

			/** normal / focus：仅当光标完全离开可见区时 nearest 滚入。 */
			function ensureCaretInView() {
				if (typewriterEnabled(shell)) return;
				const scroller = scrollerEl();
				if (!scroller) return;
				let coords;
				try {
					coords = view.coordsAtPos(view.state.selection.from);
				} catch { return; }
				const rect = scroller.getBoundingClientRect();
				const margin = 24;
				if (coords.top >= rect.top + margin && coords.bottom <= rect.bottom - margin) {
					return;
				}
				const active = view.dom.querySelector('.vsword-focus-active');
				if (active && typeof active.scrollIntoView === 'function') {
					active.scrollIntoView({ block: 'nearest', behavior: 'auto' });
				} else {
					// fallback：按坐标微调 scrollTop
					if (coords.top < rect.top + margin) {
						scroller.scrollTop -= (rect.top + margin - coords.top);
					} else if (coords.bottom > rect.bottom - margin) {
						scroller.scrollTop += (coords.bottom - (rect.bottom - margin));
					}
				}
			}

			function maybeRecenter(force) {
				if (rafId) cancelAnimationFrame(rafId);
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					if (typewriterEnabled(shell)) {
						const y = currentCaretY();
						if (y == null) return;
						// line-change gate：8px ≈ 半行，避免每键抖动
						if (!force && lastCenterY >= 0 && Math.abs(y - lastCenterY) < 8) return;
						// 用户要求：中下约 2/3 高度（非 center）
						scrollCaretToRatio(2 / 3);
						lastCenterY = y;
						return;
					}
					lastCenterY = -1;
					// normal / focus（及 reading×focus）：光标出屏则跟随
					ensureCaretInView();
				});
			}

			// ---- T-3.13.3 · hover decoration bridge --------------------------------
			let hoverTimer = 0;
			let pendingCoords = null;

			function currentHoverPos() {
				return KEY.getState(view.state)?.hoverPos ?? null;
			}

			function setHoverPos(next) {
				const current = currentHoverPos();
				if (next === current) return;
				// 只 dispatch meta transaction, 不动 selection / doc.
				view.dispatch(view.state.tr.setMeta(KEY, { hoverPos: next }));
			}

			function flushHover() {
				hoverTimer = 0;
				if (!pendingCoords) return;
				if (!hoverEnabled(shell)) { pendingCoords = null; return; }
				const { left, top } = pendingCoords;
				pendingCoords = null;
				let posInfo = null;
				try { posInfo = view.posAtCoords({ left, top }); } catch { posInfo = null; }
				setHoverPos(posInfo ? posInfo.pos : null);
			}

			const onMouseMove = (e) => {
				if (!hoverEnabled(shell)) return;
				pendingCoords = { left: e.clientX, top: e.clientY };
				if (hoverTimer) return; // 50ms 内合并成一次 posAtCoords (AC-3.5)
				hoverTimer = setTimeout(flushHover, 50);
			};

			const onMouseLeave = () => {
				if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
				pendingCoords = null;
				// mouse 离开编辑器 → 只保留 cursor 行 (AC-3.3)
				setHoverPos(null);
			};

			view.dom.addEventListener('mousemove', onMouseMove);
			view.dom.addEventListener('mouseleave', onMouseLeave);

			// Recenter once on install so entering typewriter/reading lands nicely.
			maybeRecenter(true);

			// Observe shell attribute flips so switching typewriter on triggers an
			// immediate center (otherwise the user has to type a char first).
			// 同时: 切离 focus (substyle 非 focus) 时清 hover, 防止残留高亮.
			const attrObserver = shell ? new MutationObserver(() => {
				if (!hoverEnabled(shell) && currentHoverPos() !== null) {
					setHoverPos(null);
				}
				maybeRecenter(true);
			}) : null;
			if (attrObserver && shell) {
				attrObserver.observe(shell, { attributes: true, attributeFilter: ['data-substyle', 'data-mode'] });
			}

			return {
				update() { maybeRecenter(false); },
				destroy() {
					if (rafId) cancelAnimationFrame(rafId);
					if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
					view.dom.removeEventListener('mousemove', onMouseMove);
					view.dom.removeEventListener('mouseleave', onMouseLeave);
					attrObserver?.disconnect();
				},
			};
		},
	});
});

export const focusModePlugins = [focusAndContextPlugin];

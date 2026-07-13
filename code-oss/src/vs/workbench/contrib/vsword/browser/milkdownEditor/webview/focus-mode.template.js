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
 *    data-substyle  = normal | focus | typewriter   (mutually exclusive)
 *
 *  What this plugin still owns:
 *    (1) Decoration: `.vsword-focus-active vsword-edit-context` 挂在 cursor 所在
 *        top-level block, 以及 (仅 data-substyle=focus 时) 鼠标 hover 所在
 *        top-level block. CSS gates on data-substyle=focus.
 *    (2) Typewriter re-scroll: when data-substyle=typewriter AND the cursor's
 *        viewport Y crossed a line boundary, scroll caret to viewport 2/3.
 *    (3) normal / focus 完全同一套 caret-in-view：光标始终夹在视口上下安全区内
 *        （约 1 行高 margin），不使用 block.scrollIntoView（大段落下 caret 会出屏）。
 *--------------------------------------------------------------------------------------------*/

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const KEY = new PluginKey('vsword-focus-and-context');

/** 光标相对视口顶/底至少保留的行数（normal/focus 同一套）。 */
const CARET_EDGE_LINES = 1;

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

/**
 * 由 caret 视口坐标 + scroller 矩形算 scrollTop delta。
 * 顶/底各留 margin（约 1 行），保证光标不会跑到「画面外」。
 * @returns {number} delta（0 = 无需滚）
 */
export function computeCaretInViewDelta(coords, scrollerRect, margin) {
	if (!coords || !scrollerRect || scrollerRect.height <= 0) return 0;
	const m = Number.isFinite(margin) && margin >= 0 ? margin : 28;
	if (coords.top < scrollerRect.top + m) {
		return coords.top - (scrollerRect.top + m);
	}
	if (coords.bottom > scrollerRect.bottom - m) {
		return coords.bottom - (scrollerRect.bottom - m);
	}
	return 0;
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
			// ProseMirror 原生 scrollToSelection：与 ensureCaretInView 同量级 margin
			// （typewriter 路径会在 rAF 里覆盖 scrollTop，不受此干扰）
			scrollMargin: 32,
			scrollThreshold: 32,
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

			/**
			 * normal / focus（完全同一套）：按 **caret 坐标**（不是 block 节点）把光标
			 * 夹在视口上下安全区。禁止 element.scrollIntoView——大段落 block 仍可见时
			 * nearest 不滚，光标会出屏；focus 下 hover 装饰更新也不能打断本路径。
			 */
			function ensureCaretInView() {
				if (typewriterEnabled(shell)) return;
				const scroller = scrollerEl();
				if (!scroller) return;
				let coords;
				try {
					coords = view.coordsAtPos(view.state.selection.from);
				} catch { return; }
				const rect = scroller.getBoundingClientRect();
				if (rect.height <= 0) return;
				// 用当前 caret 行高估 margin（至少 24，约 1 行）
				const lineH = Math.max(20, Math.min(48, (coords.bottom - coords.top) || 28));
				const margin = Math.max(lineH * CARET_EDGE_LINES, Math.min(lineH * 1.25, rect.height * 0.08));
				const delta = computeCaretInViewDelta(coords, rect, margin);
				if (delta === 0) return;
				const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
				scroller.scrollTop = Math.max(0, Math.min(maxScroll, scroller.scrollTop + delta));
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
					// normal 与 focus 完全同一路径
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
				// 关键：只在 selection/doc 变化时跟随光标。
				// focus 模式下 mousemove → hover decoration tr 会频繁 update；
				// 若每次都 cancel+重排 rAF，会把 caret 跟随滚动画吞掉（用户反馈 focus 无跟随）。
				update(_v, prevState) {
					if (!prevState) {
						maybeRecenter(true);
						return;
					}
					const selChanged = !view.state.selection.eq(prevState.selection);
					const docChanged = !view.state.doc.eq(prevState.doc);
					if (selChanged || docChanged) {
						maybeRecenter(false);
					}
				},
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

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.13.4 · focus-mode typewriter 契约快照（pure helpers）
//
// **本文件是 focus-mode.template.js 中 typewriter 决策/查询逻辑的纯函数快照**，
// 用于让 typewriter 单测（PRD §4 AC-4.1 ~ 4.4）能在 node + jsdom 环境里直接跑，
// 避免 bundle 整个 Milkdown / ProseMirror 栈。
//
// **不改行为**（PRD §4 硬约束）：本模块目前不被 focus-mode.template.js import，
// 只作为契约文档 + 单测断言目标。template 里内联的 gate 与本模块必须**始终保持
// 等价**；任何一侧改动都要同步另一侧，否则 typewriter.test.ts 会失效但 template
// 未回归 —— 请把这里视作"验收标准的可执行副本"。
//
// 契约（与 focus-mode.template.js @T-3.12.3.a 完全等价）：
//   1) typewriterEnabled(shell) —— shell.getAttribute('data-substyle') === 'typewriter'
//        · template L53-58 内联实现
//   2) hoverEnabled(shell)      —— shell.getAttribute('data-substyle') === 'focus'
//        · template 内暂无独立函数，本模块预留供未来 T-3.13.3（hover 高亮）合并时复用
//   3) shouldRecenter({ lastCenterY, currentY, force, threshold }) —— line-change gate
//        · template L92-94 内联实现：
//            if (y == null) return;
//            if (!force && lastCenterY >= 0 && Math.abs(y - lastCenterY) < 8) return;
//        · 本 helper 反向表述：满足则返回 true（应 recenter）
//        · force=true 且 y 有效 → true
//        · lastCenterY < 0 且 y 有效 → true（首次强制）
//        · |currentY - lastCenterY| >= threshold（默认 8px）→ true
//        · 否则 → false
//   4) contentFitsInViewport(contentHeight, viewportHeight) —— AC-4.2 短文档判定
//        · content <= viewport → true（scrollIntoView 会自然 no-op · template 依赖浏览器行为）
//
// 设计约束：
// - 纯 JS，无任何 import。单测用 esbuild 直接 bundle，无外部依赖。
// - 与 template 保持严格一致；改动 template 里的 8px / substyle 语义时必须同步本文件
//   + 重跑 run-typewriter-test.mjs。

/**
 * @param {Element | null | undefined} shell
 * @returns {boolean}
 */
export function typewriterEnabled(shell) {
	if (!shell || typeof shell.getAttribute !== 'function') return false;
	return shell.getAttribute('data-substyle') === 'typewriter';
}

/**
 * @param {Element | null | undefined} shell
 * @returns {boolean}
 */
export function hoverEnabled(shell) {
	if (!shell || typeof shell.getAttribute !== 'function') return false;
	return shell.getAttribute('data-substyle') === 'focus';
}

/**
 * Line-change gate。决定当前 caret Y 是否已经跨过一个行边界，值得触发一次
 * typewriter 重定位（实现侧用 scrollTop 滚到视口 ratio=2/3，非 center）。
 *
 * @param {Object} params
 * @param {number} params.lastCenterY  上次成功 recenter 时的 caret viewport Y。-1 表示未记录。
 * @param {number | null} params.currentY 当前 caret viewport Y。null 表示 coords 取不到（如折叠 selection）。
 * @param {boolean} [params.force] 强制信号（首次安装 / substyle 切换 / 强制 recenter）。
 * @param {number} [params.threshold=8] intra-line 抖动阈值（默认 8px ≈ 半个行高）。
 * @returns {boolean} true 表示应当重定位；false 表示 skip。
 */
export function shouldRecenter({ lastCenterY, currentY, force, threshold }) {
	if (currentY == null || !Number.isFinite(currentY)) return false;
	const t = typeof threshold === 'number' && threshold >= 0 ? threshold : 8;
	if (force) return true;
	if (lastCenterY == null || lastCenterY < 0) return true;
	return Math.abs(currentY - lastCenterY) >= t;
}

/** Typewriter 目标视口高度比例（中下 2/3）。 */
export const TYPEWRITER_VIEWPORT_RATIO = 2 / 3;

/**
 * 计算 scroller 应设的 scrollTop，使 caret 文档 Y 落在视口 ratio 处。
 * @param {number} caretDocY  caret 相对 scroller 内容顶的 Y（含 scrollTop）
 * @param {number} viewportHeight
 * @param {number} maxScroll
 * @param {number} [ratio=2/3]
 */
export function computeTypewriterScrollTop(caretDocY, viewportHeight, maxScroll, ratio) {
	const r = typeof ratio === 'number' && ratio > 0 && ratio < 1 ? ratio : TYPEWRITER_VIEWPORT_RATIO;
	if (!Number.isFinite(caretDocY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
		return 0;
	}
	const target = caretDocY - viewportHeight * r;
	const max = Number.isFinite(maxScroll) && maxScroll > 0 ? maxScroll : 0;
	return Math.max(0, Math.min(max, target));
}

/**
 * AC-4.2 支持：判断内容是否已经完全装进视口。此时 scrollIntoView 会自然 no-op，
 * 不需要强制居中——但我们把判定纯化出来，方便测试断言"短文档不 force scroll"。
 *
 * @param {number} contentHeight  editor 内容高度（scrollHeight）
 * @param {number} viewportHeight editor 可见区域高度（clientHeight）
 * @returns {boolean}
 */
export function contentFitsInViewport(contentHeight, viewportHeight) {
	if (!Number.isFinite(contentHeight) || !Number.isFinite(viewportHeight)) return false;
	if (viewportHeight <= 0) return false;
	return contentHeight <= viewportHeight;
}

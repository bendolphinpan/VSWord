/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b.2 — mermaid view helpers.
//
// 纯函数：不 import Milkdown / DOM / mermaid，任何一处都可在 Node 侧单测里直接跑。
// 覆盖：
//   • getCodeBlockSource(node)         → 从 code_block PM Node 抽出源码（text 子节点拼接）
//   • buildThemedSource(src, isDark)   → per-render 前缀 `%%{init:{'theme':...}}%%`
//   • extractMermaidError(err)         → 从 mermaid parse/render 异常中拿人话
//   • mermaidIsEmpty(src)              → 空/纯空白判定 → 占位符
//   • autoSizeTextareaPx(src, opts)    → textarea 高度 clamp（复用 math-view 语义）
//   • normalizeMermaidSource(src)      → trim 尾部多余空行；保留内部结构（Round-trip 无副作用）

/**
 * 从 code_block ProseMirror Node 提取源码。
 * mermaid code_block 是 non-atom + text children，node.textContent 已足够；
 * 但为方便单测传入纯对象 mock，做一次 { textContent } 回退。
 */
export function getCodeBlockSource(node) {
	if (!node) return '';
	if (typeof node.textContent === 'string') return node.textContent;
	return '';
}

/**
 * 主题方案 B（PRD P-3）：per-render 拼 `%%{init:{'theme':'dark'|'default'}}%%` 前缀。
 * 若用户源码已经写了 `%%{init:...}%%`，我们不覆盖 —— 尊重用户显式配置。
 *
 * 注意：这里返回的字符串**只用于喂给 mermaid.render**，绝不写回 doc、绝不入盘。
 */
export function buildThemedSource(source, isDark) {
	const src = String(source ?? '');
	if (/^\s*%%\{[\s\S]*?\}%%/.test(src)) {
		// 用户已有 init frontmatter，尊重之。
		return src;
	}
	const theme = isDark ? 'dark' : 'default';
	// 单行紧凑格式，避免影响行号 / SVG viewBox 计算。
	return `%%{init:{'theme':'${theme}'}}%%\n${src}`;
}

/**
 * mermaid v11 parse/render 抛出的 error.hash 结构为
 *   { text, token, line, loc, expected }
 * 常规 Error 则回退到 message。
 */
export function extractMermaidError(err) {
	if (!err || typeof err !== 'object') return null;
	const hash = /** @type {any} */ (err).hash;
	if (hash && typeof hash === 'object') {
		const line = typeof hash.line === 'number' ? ` (行 ${hash.line + 1})` : '';
		const detail = String(hash.text || hash.token || '').slice(0, 120);
		return detail ? `Mermaid 语法错误${line}: ${detail}` : `Mermaid 语法错误${line}`;
	}
	const msg = String(/** @type {any} */ (err).message || err).split('\n')[0];
	return msg ? msg.replace(/^\s*(Error:\s*)?/, '').slice(0, 240) : 'Mermaid 渲染失败';
}

/** true 当源码没有任何可见字符（占位符触发）。 */
export function mermaidIsEmpty(src) {
	return !src || !String(src).trim();
}

/**
 * textarea 高度：按行数 clamp。mermaid 源码通常 5–30 行，min 更高一点。
 * 保持和 math-view 一致的语义签名，方便复用测试。
 */
export function autoSizeTextareaPx(source, { lineHeightPx = 20, padPx = 20, minPx = 96, maxPx = 480 } = {}) {
	const lines = String(source ?? '').split('\n').length;
	const raw = lines * lineHeightPx + padPx;
	return Math.max(minPx, Math.min(maxPx, raw));
}

/**
 * commit 时对源码做保守规整：**只 trim 尾部纯空白行**，保留头部缩进 / 内部空行 / 尾行末换行。
 * 目标：不引入无谓 diff、保 Round-trip 字节级保真的可能性。
 */
export function normalizeMermaidSource(input) {
	if (input == null) return '';
	const s = String(input);
	// 去掉纯末尾的 \n\n\n… 但保留最后一个换行（若有）。
	return s.replace(/(\r?\n)+$/g, '');
}

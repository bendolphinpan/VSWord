/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-seq.2 — js-sequence-diagrams view helpers.
//
// 纯函数：不 import Milkdown / DOM / sequence-diagram / raphael / underscore，
// 可在 Node 侧单测里直接跑。镜像 flowchart-view-helpers 的 API 形状，改动集中在
// 错误抽取（jison 报错格式）与主题选项（sequence 只有 simple / hand，暂只走 simple）。

/** 从 code_block ProseMirror Node 提取源码。 */
export function getCodeBlockSource(node) {
	if (!node) return '';
	if (typeof node.textContent === 'string') return node.textContent;
	return '';
}

/** true 当源码没有任何可见字符（占位符触发）。 */
export function sequenceIsEmpty(src) {
	return !src || !String(src).trim();
}

/** textarea 高度：按行数 clamp。sequence 源码常见 3–20 行。 */
export function autoSizeTextareaPx(source, { lineHeightPx = 20, padPx = 20, minPx = 96, maxPx = 480 } = {}) {
	const lines = String(source ?? '').split('\n').length;
	const raw = lines * lineHeightPx + padPx;
	return Math.max(minPx, Math.min(maxPx, raw));
}

/** commit 时对源码做保守规整：只 trim 尾部纯空白行；不改动头/内部（保 Round-trip）。 */
export function normalizeSequenceSource(input) {
	if (input == null) return '';
	const s = String(input);
	return s.replace(/(\r?\n)+$/g, '');
}

/**
 * js-sequence-diagrams（rokt33r fork，jison 0.4.15 生成的 parser）抛错常见形态：
 *   • "Parse error on line 3:\n  ...\nExpecting 'PARTICIPANT', got 'ACTOR'"
 *   • "Lexical error on line 5. Unrecognized text.\n..."
 *   • "Raphael or Snap.svg is required to be included."（drawSVG 无 renderer）
 * 我们只保留第一行 headline。
 */
export function extractSequenceError(err) {
	if (!err || typeof err !== 'object') return null;
	const msg = String(/** @type {any} */ (err).message || err).split('\n')[0];
	if (!msg) return 'Sequence 渲染失败';
	const cleaned = msg.replace(/^\s*(Error:\s*)?/, '').trim();
	return cleaned.slice(0, 240);
}

/**
 * 顶部红条 headline：单行 + 最多 maxLen 字符，超出补 `…`。
 */
export function formatErrorHeadline(err, maxLen = 80) {
	const raw = extractSequenceError(err) || 'Sequence 渲染失败';
	const oneLine = raw.split('\n')[0].trim();
	if (oneLine.length <= maxLen) return oneLine;
	return oneLine.slice(0, Math.max(1, maxLen - 1)) + '…';
}

/**
 * jison parser 错误 message 首行大多是 `Parse error on line N:` 或
 * `Lexical error on line N. …`。也兼容 `line N` / `at line N` 的裸格式。
 * 返回 1-based 行号或 null。
 */
export function parseErrorLineNumber(err) {
	if (!err || typeof err !== 'object') return null;
	const msg = String(/** @type {any} */ (err).message || '');
	const m = msg.match(/(?:parse\s+error\s+on\s+|lexical\s+error\s+on\s+|on\s+|at\s+)?line\s+(\d+)/i);
	if (m) {
		const n = Number(m[1]);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return null;
}

/**
 * 详情面板文本：多行、给复制/查看用。
 */
export function formatErrorStack(err) {
	if (err == null) return '';
	const parts = [];
	const head = extractSequenceError(err);
	if (head) parts.push(head);
	if (typeof err === 'object') {
		const stack = /** @type {any} */ (err).stack;
		if (typeof stack === 'string' && stack.trim()) {
			parts.push(stack.trim());
		} else {
			const msg = String(/** @type {any} */ (err).message || '');
			if (msg && !parts.some(p => p.includes(msg))) parts.push(msg);
		}
	} else {
		parts.push(String(err));
	}
	return parts.join('\n\n').trim();
}

/**
 * 定位光标到 textarea 里指定 1-based 行首。越界或非正整数行号 → 0。
 */
export function offsetOfLine(source, line) {
	const src = String(source ?? '');
	if (!Number.isFinite(line) || line <= 1) return 0;
	let off = 0;
	let currentLine = 1;
	while (currentLine < line && off < src.length) {
		const nl = src.indexOf('\n', off);
		if (nl < 0) return src.length;
		off = nl + 1;
		currentLine++;
	}
	return off;
}

/**
 * 构造 `diagram.drawSVG(container, options)` 的 options 参数。
 *
 * D-5：默认 `simple` 主题（不加载 WebFont，也不需要 Snap.svg）。`hand` 主题依赖
 * WebFontLoader + Snap.svg 且渲染慢一倍，opt-in 延后到 T-3.5b-flowseq.3。
 * 深色暂无原生 dark theme（fork 只有 simple / hand / snapSimple / snapHand）——
 * 我们仍返回 simple，颜色调优交给外层 CSS `.vsword-sequence[data-theme="dark"]`
 * 覆盖 SVG stroke/fill；PRD "好看放一放" 原则，先保功能。
 */
export function buildSequenceOptions(_isDark) {
	return { theme: 'simple' };
}

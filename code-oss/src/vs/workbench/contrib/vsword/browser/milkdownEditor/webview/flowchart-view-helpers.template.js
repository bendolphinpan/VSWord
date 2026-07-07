/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5b-flow.2 — Flowchart.js view helpers.
//
// 纯函数：不 import Milkdown / DOM / flowchart.js / raphael，可在 Node 侧单测里直接跑。
// 覆盖：
//   • getCodeBlockSource(node)           → 从 code_block PM Node 抽出源码
//   • flowchartIsEmpty(src)              → 空/纯空白判定 → 占位符
//   • autoSizeTextareaPx(src, opts)      → textarea 高度 clamp（mirror mermaid）
//   • normalizeFlowchartSource(src)      → trim 尾部纯空行，保 Round-trip
//   • extractFlowchartError(err)         → 从 flowchart.js parse 异常里拿人话
//   • formatErrorHeadline(err, maxLen)   → 单行截断的红条 headline
//   • parseErrorLineNumber(err)          → 尽力解析 1-based 行号
//   • formatErrorStack(err)              → 复制按钮用的多行详情
//   • offsetOfLine(source, line)         → textarea selectionStart 定位
//   • buildFlowchartOptions(isDark)      → drawSVG 的主题参数（light 全默认 / dark 保留常量点）
//   • flowchartLineOffset(source, line)  → 与 offsetOfLine 语义等价（对外露的别名）

/** 从 code_block ProseMirror Node 提取源码。 */
export function getCodeBlockSource(node) {
	if (!node) return '';
	if (typeof node.textContent === 'string') return node.textContent;
	return '';
}

/** true 当源码没有任何可见字符（占位符触发）。 */
export function flowchartIsEmpty(src) {
	return !src || !String(src).trim();
}

/** textarea 高度：按行数 clamp。Flowchart 源码常见 5–30 行。 */
export function autoSizeTextareaPx(source, { lineHeightPx = 20, padPx = 20, minPx = 96, maxPx = 480 } = {}) {
	const lines = String(source ?? '').split('\n').length;
	const raw = lines * lineHeightPx + padPx;
	return Math.max(minPx, Math.min(maxPx, raw));
}

/** commit 时对源码做保守规整：只 trim 尾部纯空白行；不改动头/内部。 */
export function normalizeFlowchartSource(input) {
	if (input == null) return '';
	const s = String(input);
	return s.replace(/(\r?\n)+$/g, '');
}

/**
 * Flowchart.js 抛错通常是普通 Error（内含手写解析器的位置信息藏在 message）；
 * 常见形态：
 *   • "Wrong char in flowchart definition: ..." — parse error
 *   • "Line N: ..." — 少数情况带行号
 *   • 其它内部报错
 */
export function extractFlowchartError(err) {
	if (!err || typeof err !== 'object') return null;
	const msg = String(/** @type {any} */ (err).message || err).split('\n')[0];
	if (!msg) return 'Flowchart 渲染失败';
	// 去掉 "Error: " 前缀
	const cleaned = msg.replace(/^\s*(Error:\s*)?/, '').trim();
	return cleaned.slice(0, 240);
}

/**
 * 顶部红条 headline：单行 + 最多 maxLen 字符，超出补 `…`。
 */
export function formatErrorHeadline(err, maxLen = 80) {
	const raw = extractFlowchartError(err) || 'Flowchart 渲染失败';
	const oneLine = raw.split('\n')[0].trim();
	if (oneLine.length <= maxLen) return oneLine;
	return oneLine.slice(0, Math.max(1, maxLen - 1)) + '…';
}

/**
 * 尽力从错误里解析 1-based 行号：flowchart.js 大多数错误不带行号，我们只从
 * message 里正则捕获 `line N` / `Line N` / `at line N`。返回 number 或 null。
 */
export function parseErrorLineNumber(err) {
	if (!err || typeof err !== 'object') return null;
	const msg = String(/** @type {any} */ (err).message || '');
	const m = msg.match(/(?:on\s+|at\s+)?line\s+(\d+)/i);
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
	const head = extractFlowchartError(err);
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
 * 构造 flowchart.js `Diagram.drawSVG(container, options)` 的 options 参数。
 *
 * light 主题：全部走 flowchart.js 默认；不覆盖任何色值 —— PRD "好看放一放" 原则。
 * dark 主题：预留几个必须的常量点（背景对比色），完整 dark palette 交给 T-3.5b-flowseq.3。
 *
 * 返回值只在 render 时喂给 drawSVG，不写回 doc，不入盘。
 */
export function buildFlowchartOptions(isDark) {
	if (!isDark) {
		return {
			'line-width': 2,
			'line-length': 50,
			'text-margin': 10,
			'font-size': 14,
		};
	}
	// dark：只覆盖对比度最要命的三点，其余走默认。
	return {
		'line-width': 2,
		'line-length': 50,
		'text-margin': 10,
		'font-size': 14,
		'font-color': '#e8e8e8',
		'line-color': '#a0a0a0',
		'element-color': '#a0a0a0',
		'fill': '#2b2b2b',
	};
}

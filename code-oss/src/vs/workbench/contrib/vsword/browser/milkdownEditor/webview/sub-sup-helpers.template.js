// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord T-3.5c.4 · Sub/Sup 装饰族 · 纯 helper（可 node 单测，无 Milkdown 依赖）
 *
 *  职责：
 *   1. 提供 `~x~` / `^x^` 单字符包裹的匹配正则（避开 GFM strikethrough `~~x~~`）
 *   2. 提供 `parseInlineText(text)` 把一段纯文本切成 mdast 节点数组（text 与 subscript/
 *      superscript 混排），供 remark visitor 在 text node 上就地替换使用
 *   3. 提供 `stringifyMark(kind, inner)` 把 mark 内容包回源码形式
 *
 *  设计约束（PRD F-17/18/19 · 决策锁 Q1=a）：
 *   - 只识别单波浪 `~x~` 与单 caret `^x^`；`~~x~~`（strikethrough）与 `^^x^^`（保留）不识别
 *   - 边界字符禁止空白，避免误吞到相邻单词
 *   - 保源码：mark 序列化写回 `~2~` / `^2^`，不改成 unicode 上下标
 *--------------------------------------------------------------------------------------------*/

// Lookbehind + lookahead 排除相邻同符号（避开 strikethrough `~~x~~` / 想象中的 `^^x^^`）。
// 内部至少 1 字符、无空白、无自身符号。
export const SUB_RE = /(?<!~)~(?!~)([^~\s]+?)(?<!~)~(?!~)/g;
export const SUP_RE = /(?<!\^)\^(?!\^)([^\^\s]+?)(?<!\^)\^(?!\^)/g;

/**
 * 输入原文，返回 mdast children：[{ type: 'text', value }] 或穿插 subscript/superscript 节点。
 * 顺序：先 sub 后 sup（同一次遍历不重叠——sub 已消费的区间不会再被 sup 扫）。
 * @param {string} text
 * @returns {Array<{ type: 'text'|'subscript'|'superscript', value?: string, children?: Array }>}
 */
export function parseInlineText(text) {
	if (typeof text !== 'string' || text.length === 0) {
		return [{ type: 'text', value: String(text ?? '') }];
	}
	const step1 = splitByPattern(text, SUB_RE, 'subscript');
	const out = [];
	for (const seg of step1) {
		if (seg.type === 'text' && seg.value) {
			out.push(...splitByPattern(seg.value, SUP_RE, 'superscript'));
		} else {
			out.push(seg);
		}
	}
	return coalesceText(out);
}

/**
 * 把一段 text 按 pattern 切成 [text, wrap, text, wrap, ...]。
 * 未匹配区仍是 `{ type: 'text' }`，匹配区变为 `{ type: kind, children: [{ type: 'text' }] }`。
 */
function splitByPattern(text, re, kind) {
	re.lastIndex = 0;
	if (!re.test(text)) return [{ type: 'text', value: text }];
	re.lastIndex = 0;
	const out = [];
	let cursor = 0;
	let m;
	while ((m = re.exec(text)) !== null) {
		if (m.index > cursor) out.push({ type: 'text', value: text.slice(cursor, m.index) });
		out.push({ type: kind, children: [{ type: 'text', value: m[1] }] });
		cursor = m.index + m[0].length;
	}
	if (cursor < text.length) out.push({ type: 'text', value: text.slice(cursor) });
	return out;
}

/** 合并相邻 text 节点、过滤空 text，保持 mdast 层干净。 */
function coalesceText(nodes) {
	const out = [];
	for (const n of nodes) {
		if (n.type === 'text') {
			if (!n.value) continue;
			const prev = out[out.length - 1];
			if (prev && prev.type === 'text') { prev.value += n.value; continue; }
		}
		out.push(n);
	}
	return out;
}

/**
 * 把 mark 内容序列化回源码字符串。
 * @param {'subscript'|'superscript'} kind
 * @param {string} inner 内部纯文本
 */
export function stringifyMark(kind, inner) {
	const marker = kind === 'subscript' ? '~' : '^';
	return `${marker}${inner}${marker}`;
}

/** kind → 源码 marker 字符（导出给序列化层使用）。 */
export const MARK_MARKER = Object.freeze({ subscript: '~', superscript: '^' });

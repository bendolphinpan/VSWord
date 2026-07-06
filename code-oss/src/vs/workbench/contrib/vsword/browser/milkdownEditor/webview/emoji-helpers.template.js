// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  VSWord T-3.5c.1 · Emoji shortcode 保源码 · 纯 helper（可 node 单测，无 Milkdown/npm 依赖）
 *
 *  职责：
 *   1. 提供 shortcode 正则 `EMOJI_RE`（宽松匹配 `:name:`，name 允许字母/数字/下划线/加号/减号）
 *   2. 提供 `parseInlineEmoji(text, resolver)` 把一段纯文本切成 mdast 节点数组
 *      （text 节点与 emoji 节点混排），供 remark visitor 在 text node 上就地替换
 *   3. 提供 `stringifyEmoji(name)` 把 mdast emoji 节点序列化回 `:name:` 源码
 *
 *  设计约束（PRD F-01/02/03/04）：
 *   - **保源码**：序列化写回 `:name:`，绝不写 unicode
 *   - **未识别兜底**：resolver 返回 null/false 的 shortcode 保留原文本，不进 emoji 节点
 *   - **不与 GFM 冲突**：正则不匹配 footnote `[^n]`（不含冒号）、任务列表 `[ ]`；`::` 空 shortcode 也不匹配
 *   - **helpers 零外部依赖**：node-emoji 在 .tmp 构建 dir 才有，本文件必须能在主 tsconfig 项目里被单测直接 import
 *--------------------------------------------------------------------------------------------*/

// 单冒号包裹、内部至少 1 字符、允许 [A-Za-z0-9_+-]。使用 /g 支持多次匹配。
// 边界：前后不吸空白/冒号，允许出现在句首/句尾。左侧禁止紧邻反斜杠转义 `\:smile:`。
// 简化起见：不做 lookbehind（早期 JS 支持问题在 target=es2022 下无关，但保持一致简单）。
export const EMOJI_RE = /:([A-Za-z0-9_+\-]+):/g;

/**
 * 把一段原文按 EMOJI_RE 切成 mdast 节点数组。
 * @param {string} text 原始文本
 * @param {(name: string) => (string | null | undefined)} resolver
 *   传入 shortcode 名字，返回其对应 unicode（string），或 null/undefined 表示未识别。
 *   典型注入：`(n) => nodeEmoji.get(n) || null`。
 * @returns {Array<{ type: 'text'|'emoji', value?: string, name?: string, unicode?: string }>}
 */
export function parseInlineEmoji(text, resolver) {
	if (typeof text !== 'string' || text.length === 0) {
		return [{ type: 'text', value: String(text ?? '') }];
	}
	if (typeof resolver !== 'function') {
		return [{ type: 'text', value: text }];
	}
	EMOJI_RE.lastIndex = 0;
	if (!EMOJI_RE.test(text)) return [{ type: 'text', value: text }];
	EMOJI_RE.lastIndex = 0;
	const out = [];
	let cursor = 0;
	let m;
	while ((m = EMOJI_RE.exec(text)) !== null) {
		const name = m[1];
		// 转义门槛：紧邻左侧一个反斜杠视为不匹配（`\:smile:` 保源码）。
		if (m.index > 0 && text[m.index - 1] === '\\') continue;
		const unicode = resolver(name);
		if (typeof unicode !== 'string' || unicode.length === 0) {
			// 未识别 → 保留 shortcode 文本原样，不消费。
			continue;
		}
		if (m.index > cursor) out.push({ type: 'text', value: text.slice(cursor, m.index) });
		out.push({ type: 'emoji', name, unicode });
		cursor = m.index + m[0].length;
	}
	if (cursor < text.length) out.push({ type: 'text', value: text.slice(cursor) });
	return coalesceText(out);
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
	// 若没有 emoji 节点，且首尾都是 text → 说明整段无匹配，直接归一成一个 text（下游简单）。
	if (out.length === 0) return [{ type: 'text', value: '' }];
	return out;
}

/**
 * 把 emoji 节点序列化回源码字符串。**始终写 shortcode，不写 unicode**。
 * @param {string} name shortcode 名字（不含冒号）
 * @returns {string} `:name:`
 */
export function stringifyEmoji(name) {
	const safe = typeof name === 'string' ? name.trim() : '';
	if (!safe) return '';
	return `:${safe}:`;
}

/**
 * 从匹配到的 shortcode `:name:` 中取出 name（辅助 InputRule）。
 * @param {string} raw 例如 `:smile:`
 * @returns {string | null}
 */
export function extractShortcodeName(raw) {
	if (typeof raw !== 'string') return null;
	const m = /^:([A-Za-z0-9_+\-]+):$/.exec(raw);
	return m ? m[1] : null;
}

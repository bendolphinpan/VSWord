// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.3.a · Find / Replace 纯函数 helpers。
 *
 *  这里只放**无 side effect 的纯函数**，便于 mocha 单测直接消费；PM Plugin 层和 UI
 *  层放在 find-plugin.template.js / find-widget.template.js（后续 b/c 卡）。
 *
 *  与 PRD 的对应：
 *    · §4.5 computeMatches / escapeRegExp（含空匹配 `re.lastIndex++` 兜底）
 *    · §4.7 applyReplaceOne / applyReplaceAll（反向遍历 · 单 tr · undo 一次）
 *    · §6 已知坑 1-4（`g` flag / 空匹配 / descendants 返回值 / atom NodeView 天然豁免）
 *    · §7 D-3（原生 RegExp） · D-8（> 10 万匹配 warn，不硬截断）
 *
 *  非目标：
 *    · widget DOM / 事件绑定（b 卡 · find-widget.template.js）
 *    · reading mode gate 兜底（c 卡 · applyReplaceOne / applyReplaceAll 内会再判一次
 *      mode；本卡先只暴露纯函数，state.mode 字段由 caller 传入）
 *    · localStorage 历史查询（PRD D-11 · 不做）
 *--------------------------------------------------------------------------------------------*/

// ---------------------------------------------------------------------------
// Type shims（供 IDE / 单测阅读；运行时不产生代码）
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FindMatch
 * @property {number} from  ProseMirror doc position（inclusive）
 * @property {number} to    ProseMirror doc position（exclusive）
 * @property {string} text  匹配到的原始文本
 */

/**
 * @typedef {Object} FindOptions
 * @property {boolean} caseSensitive
 * @property {boolean} wholeWord
 * @property {boolean} useRegex
 */

/**
 * @typedef {Object} FindState
 * @property {boolean} widgetOpen
 * @property {string}  query
 * @property {string=} replacement       仅 applyReplace* 消费
 * @property {FindOptions} options
 * @property {ReadonlyArray<FindMatch>} matches
 * @property {number}  activeIndex       0-based；-1 表示无匹配
 * @property {boolean} invalidRegex
 * @property {string=} mode              视图模式（'reading' / 'wysiwyg' / 'source'）；
 *                                       reading 时 applyReplace* 拒执行
 */

// ---------------------------------------------------------------------------
// escapeRegExp（PRD §4.5 · 与 MDN 推荐正则一致）
// ---------------------------------------------------------------------------

/**
 * 把用户输入当**字面量**用时的 RegExp 元字符转义。
 * caller 语义：useRegex=false 时先跑一次这个再拼 flags。
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
	if (typeof str !== 'string' || str.length === 0) { return ''; }
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// computeMatches（PRD §4.5 + §6 坑 1-4）
// ---------------------------------------------------------------------------

/**
 * 内部：把 (query, opts) 编译成一个 global RegExp。失败（SyntaxError）→ 返回 null。
 * @param {string} query
 * @param {FindOptions} opts
 * @returns {RegExp | null}
 */
function _buildRegExp(query, opts) {
	if (!query) { return null; }
	// PRD §6 坑 1：flags 必须至少含 'g'，否则 re.exec 循环会死循环。
	const flags = opts && opts.caseSensitive ? 'g' : 'gi';
	let pattern;
	if (opts && opts.useRegex) {
		// PRD §7 D-3：useRegex 直接吃用户 raw pattern；wholeWord 与 useRegex 组合以
		// 用户 regex 为准，不额外包 \b（避免 `.*` 被 `\b.*\b` 干扰）。
		pattern = query;
	} else {
		pattern = escapeRegExp(query);
		if (opts && opts.wholeWord) {
			// 字面量模式下：\b 前后夹裹整个 escaped pattern。
			pattern = `\\b${pattern}\\b`;
		}
	}
	try {
		return new RegExp(pattern, flags);
	} catch (_e) {
		return null;
	}
}

/**
 * 遍历 doc 内所有 text 节点，用 (query, opts) 编译的 RegExp 全量扫描，产出
 * 有序（doc pos 递增）的 FindMatch 数组。
 *
 * 语义：
 *   · query 为空 / 编译失败 → 返回 []
 *   · 空匹配（`.*` / `\b` 等）→ 每次 re.lastIndex++ 显式推进，避免死循环（PRD §4.5）
 *   · atom NodeView（mermaid / flow / seq / toc）无 text 子节点，天然豁免（PRD §6 坑 4）
 *   · 匹配数 > 10 万 → console.warn 但不截断（PRD D-8）
 *
 * @param {import('@milkdown/prose/model').Node} doc
 * @param {string} query
 * @param {FindOptions} opts
 * @returns {ReadonlyArray<FindMatch>}
 */
export function computeMatches(doc, query, opts) {
	if (!doc || typeof doc.descendants !== 'function') { return []; }
	if (typeof query !== 'string' || query.length === 0) { return []; }
	const re = _buildRegExp(query, opts || {});
	if (!re) { return []; }

	/** @type {Array<FindMatch>} */
	const matches = [];
	doc.descendants((node, pos) => {
		// PRD §6 坑 3：`return false` 停止递归 text 节点内部；`return true` 继续下钻。
		if (!node || node.isText !== true) { return true; }
		const text = typeof node.text === 'string' ? node.text : '';
		if (text.length === 0) { return false; }
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(text)) !== null) {
			if (m[0].length === 0) {
				// PRD §4.5 空匹配兜底：`.*` / `\b` / `(?=x)` 之类的零宽匹配
				// 会让 re.exec 卡住 lastIndex，必须显式推进 1 步。
				re.lastIndex++;
				continue;
			}
			// text 节点内 offset → doc 绝对 pos：pos 是 text 节点在 doc 里的
			// 起始位置（PM 语义），加上 m.index 得到 inline 绝对 from。
			matches.push({
				from: pos + m.index,
				to: pos + m.index + m[0].length,
				text: m[0],
			});
		}
		return false;
	});

	if (matches.length > 100000) {
		// PRD §7 D-8：> 10 万匹配加 warn；不硬截断，交给用户判断（DecorationSet
		// 构造 O(n) 已能承受，主要是提醒 UI 侧 count 显示可能刺眼）。
		try { console.warn('[vsword:find] matches > 100000, decoration may be slow'); } catch { /* noop */ }
	}
	return matches;
}

// ---------------------------------------------------------------------------
// applyReplaceOne / applyReplaceAll（PRD §4.7 · reading gate + 反向遍历）
// ---------------------------------------------------------------------------

/**
 * 内部：reading mode gate。state.mode === 'reading' → 拒替换（return true）。
 * @param {FindState} state
 * @returns {boolean}
 */
function _isReadOnly(state) {
	return !!(state && typeof state.mode === 'string' && state.mode === 'reading');
}

/**
 * 内部：把用户输入的 replacement 展开为**最终写入 doc 的字符串**。
 *
 * · useRegex=false：原样返回（不做 $1 / $& 展开）
 * · useRegex=true：在 match.text 上用「非 global」重编译的同规则 regex 跑一次
 *   `String.prototype.replace`，让原生 backref（$1 $2 $& $`）生效。
 *   命中失败（比如 regex 编译失败）→ 退化为字面量。
 *
 * 参考 PRD §4.7 无方向决策 a：正则 backref 走 RegExp[Symbol.replace] 默认语义。
 *
 * @param {FindMatch} match
 * @param {FindState} state
 * @param {string} replacement
 * @returns {string}
 */
function _expandReplacement(match, state, replacement) {
	const raw = typeof replacement === 'string' ? replacement : '';
	if (!state || !state.options || !state.options.useRegex) { return raw; }
	if (!match || typeof match.text !== 'string' || match.text.length === 0) { return raw; }
	// 重编译一次「非 global」regex，让 String.replace 只替换首个命中（等价于当前 match）。
	let re;
	try {
		re = new RegExp(state.query, state.options.caseSensitive ? '' : 'i');
	} catch { return raw; }
	try { return match.text.replace(re, raw); }
	catch { return raw; }
}

/**
 * 单条替换：把 state.matches[state.activeIndex] 的 [from, to] 替换成 replacement。
 *
 * 语义：
 *   · state.matches 为空 / activeIndex 越界 → return -1，不 dispatch
 *   · reading mode → return -1，不 dispatch（PRD §8 风险 6 兜底）
 *   · useRegex=true 时 replacement 支持 `$1` / `$&` 等原生 backref（PRD §4.7 默认 a）
 *   · 替换后返回的 hint 是 `min(activeIndex, matches.length - 2)`，caller 侧
 *     应在 doc-changed listener 里重算 matches / clamp activeIndex；本函数
 *     只做单条替换 · 不重算
 *
 * @param {{ state: any, dispatch: (tr: any) => void }} view - PM EditorView 的最小子集
 * @param {FindState} state
 * @param {string} replacement
 * @returns {number} new activeIndex hint（-1 表示无匹配 / 拒执行）
 */
export function applyReplaceOne(view, state, replacement) {
	if (!view || !view.state || typeof view.dispatch !== 'function') { return -1; }
	if (!state || !Array.isArray(state.matches) || state.matches.length === 0) { return -1; }
	if (typeof state.activeIndex !== 'number' || state.activeIndex < 0 || state.activeIndex >= state.matches.length) { return -1; }
	if (_isReadOnly(state)) { return -1; }
	const m = state.matches[state.activeIndex];
	const replText = _expandReplacement(m, state, replacement);
	const schema = view.state.schema;
	let tr = view.state.tr;
	if (replText.length === 0) {
		// 空替换 = 删除匹配区间（PM 语义：replaceWith 空 slice 用 delete）。
		tr = tr.delete(m.from, m.to);
	} else {
		tr = tr.replaceWith(m.from, m.to, schema.text(replText));
	}
	view.dispatch(tr);
	// hint：真实 index 由 doc-changed listener 定；这里只给「下一个位置」参考值。
	return Math.min(state.activeIndex, state.matches.length - 2);
}

/**
 * 全部替换：反向遍历 state.matches，累积到单个 tr，一次 dispatch。
 *
 * 语义：
 *   · reading mode / matches 为空 → return 0，不 dispatch
 *   · **反向遍历**（i = matches.length - 1 → 0）避免 offset 漂移：先动的是最靠后
 *     的匹配，它的替换不影响前面 match 的 from/to（PRD §6 坑 · §8 风险 2）
 *   · 单 tr 累积 → undo 一次撤销全部（PRD §4.7）
 *   · replacement 为空 → 走 tr.delete；否则 tr.replaceWith(schema.text(...))
 *   · useRegex=true 时逐条走 `_expandReplacement` 让 $1/$& 生效（PRD §4.7 默认 a）
 *   · replacement 含 `\n` → 单条 text node 存不下，本 PR 不做（PRD §4.7 P2）
 *
 * @param {{ state: any, dispatch: (tr: any) => void }} view
 * @param {FindState} state
 * @param {string} replacement
 * @returns {number} 替换条数
 */
export function applyReplaceAll(view, state, replacement) {
	if (!view || !view.state || typeof view.dispatch !== 'function') { return 0; }
	if (!state || !Array.isArray(state.matches) || state.matches.length === 0) { return 0; }
	if (_isReadOnly(state)) { return 0; }
	const schema = view.state.schema;
	let tr = view.state.tr;
	let count = 0;
	// 反向遍历：i 从末尾往前，前面的 match.from/to 不受影响。
	for (let i = state.matches.length - 1; i >= 0; i--) {
		const m = state.matches[i];
		if (!m || typeof m.from !== 'number' || typeof m.to !== 'number') { continue; }
		const replText = _expandReplacement(m, state, replacement);
		if (replText.length === 0) {
			tr = tr.delete(m.from, m.to);
		} else {
			tr = tr.replaceWith(m.from, m.to, schema.text(replText));
		}
		count++;
	}
	if (count > 0) { view.dispatch(tr); }
	return count;
}

// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 *  T-3.7c.3.a · Find PM Plugin。
 *
 *  职责：把 computeMatches 的产物包装成 DecorationSet 挂到 EditorView.props
 *  →  find widget 打开时 → 高亮所有匹配 · active 匹配额外挂 vsword-find-match-active
 *  →  find widget 关闭 / query 空 / invalidRegex → DecorationSet.empty
 *
 *  数据流：
 *    · state.apply(tr) 每次事务：
 *        1) 若 doc 未变 且 无显式 recompute meta → oldSet.map(tr.mapping, tr.doc) 保 O(k)
 *        2) 否则 → computeMatches → buildDecorationSet
 *    · 显式 recompute：widget 侧改 query / options / activeIndex 后
 *        `tr.setMeta(findPluginKey, { recompute: true })`
 *
 *  关键约束：
 *    · getFindState 是**外部注入**的闭包（widget 侧持有），plugin 不引用全局
 *    · plugin.spec 本身无 mutable 状态（只有 DecorationSet 挂在 state 里，跟着
 *      PM state fork）
 *    · 单测里用 mock getFindState + 手工 tr 触发 apply 即可覆盖 · 无需真 Milkdown
 *
 *  Milkdown 6.x 挂载：外面用 `$prose(() => createFindPlugin(() => stateRef))`
 *  包一层（参考 toc-view / focus-mode / wikilink-autocomplete）。
 *--------------------------------------------------------------------------------------------*/

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { computeMatches } from './find-widget-helpers.mjs';

export const findPluginKey = new PluginKey('vsword-find');

/**
 * 构造 find plugin。参数 getFindState 是**只读**的 FindState 读取器；widget
 * 侧持有真源，plugin 只在事务级读一次。
 *
 * @param {() => import('./find-widget-helpers.mjs').FindState} getFindState
 * @returns {Plugin}
 */
export function createFindPlugin(getFindState) {
	if (typeof getFindState !== 'function') {
		// 兜底：外面忘了传 → 永远返回空 state。避免 apply 里 undefined.query。
		getFindState = () => ({
			widgetOpen: false,
			query: '',
			options: { caseSensitive: false, wholeWord: false, useRegex: false },
			matches: [],
			activeIndex: -1,
			invalidRegex: false,
		});
	}
	return new Plugin({
		key: findPluginKey,
		state: {
			init: () => DecorationSet.empty,
			apply(tr, oldSet, _oldEditorState, newState) {
				const meta = tr.getMeta(findPluginKey);
				const forceRecompute = !!(meta && meta.recompute);
				// PRD §4.4：doc 未变 且 无 recompute meta → map old decorations 保持
				// 位置（O(k) 位置映射，比重算 O(text.length) 便宜）。
				if (!forceRecompute && !tr.docChanged) {
					return oldSet.map(tr.mapping, tr.doc);
				}
				const st = getFindState();
				if (!st || !st.widgetOpen || !st.query || st.invalidRegex) {
					return DecorationSet.empty;
				}
				let matches;
				try {
					matches = computeMatches(newState.doc, st.query, st.options || {});
				} catch (_e) {
					return DecorationSet.empty;
				}
				return _buildDecorationSet(newState.doc, matches, st.activeIndex);
			},
		},
		props: {
			decorations(state) { return this.getState(state); },
		},
	});
}

/**
 * 把 matches 数组拍平成 DecorationSet；activeIndex 命中的那条额外挂 active class。
 * 独立函数便于单测直接断言 DecorationSet.find(...) 数量 / class 值。
 *
 * @param {any} doc
 * @param {ReadonlyArray<{from: number, to: number}>} matches
 * @param {number} activeIndex
 * @returns {DecorationSet}
 */
export function _buildDecorationSet(doc, matches, activeIndex) {
	if (!Array.isArray(matches) || matches.length === 0) {
		return DecorationSet.empty;
	}
	const decos = matches.map((m, i) => Decoration.inline(m.from, m.to, {
		class: i === activeIndex
			? 'vsword-find-match vsword-find-match-active'
			: 'vsword-find-match',
	}));
	return DecorationSet.create(doc, decos);
}

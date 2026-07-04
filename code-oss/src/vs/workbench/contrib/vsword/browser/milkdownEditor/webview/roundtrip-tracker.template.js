// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.1 · Round-trip dirty tracker plugin（ProseMirror）
//
// 决策全锁：
//   Qa1=a schema attrs.blockId + PluginState —— 本 plugin 就是 PluginState 的持有者；
//   Qd1=a webview 上报 dirtyBlockContents: Record<blockId,string>；
//   Qqa1=a nanoid session 内稳定；
//
// 数据流：
//   entry.template.js →
//     · load 完成后主机 postMessage('init', markdown) → webview parse →
//       roundtrip-parser-hook.buildSessionFromMdast → mount 阶段一次性把 blockId
//       灌到 top-level 节点 attrs（对齐 Qa1=a）→ postMessage('sessionReady', …）
//     · 每次 editor.action(ctx => ctx.get(listenerCtx).markdownUpdated) 时：
//       plugin.getState(view.state) 拿 dirtyBlocks（Set<blockId>） →
//       组装 dirtyBlockContents = { blockId: 从当前 PM doc 顶级节点序列化出的片段 } →
//       postMessage('markdownUpdated', { markdown, dirtyBlocks, dirtyBlockContents, sessionEpoch }).
//
// 归 dirty 的判定：
//   appendTransaction 里遍历 tr.steps，用 step.getMap() 把每步的 from/to 映射回
//   pre-step 位置；命中的 top-level 节点的 blockId 加入 dirty。
//   split（一个块变两块）: 父块 blockId 存活，另一半 allocate 新 id，两者都 dirty。
//   merge（两块合成一块）: 位置在前那个的 blockId 存活，被吞的 release，存活块 dirty。
//
// 这里只声明 PluginState 与 appendTransaction 逻辑。真正的 attrs.blockId 灌注 &
// dirtyBlockContents 组装 helper 也在本文件；entry.template.js 通过 install*() 挂载。

import { Plugin, PluginKey } from '@milkdown/prose/state';

const ROUNDTRIP_TRACKER_KEY = new PluginKey('vsword-roundtrip-tracker');

/**
 * PluginState 形状 —— 不可变，appendTransaction 里每次产出新对象。
 * @typedef {{
 *   sessionEpoch: number,
 *   dirtyBlocks: ReadonlySet<string>,   // set of blockId
 *   blockIdByPos: ReadonlyMap<number, string>,  // pre-step position (top-level 节点起点) → blockId
 * }} TrackerState
 */

/**
 * 构建 tracker plugin。参数化以便测试 & 让 entry.template.js 从外部注入 allocator。
 *
 * @param {{
 *   allocator: { allocate(): string, has(id: string): boolean, reserve(id: string): boolean, release(id: string): void },
 *   getSessionEpoch: () => number,
 * }} deps
 * @returns {Plugin}
 */
export function createRoundtripTrackerPlugin(deps) {
	return new Plugin({
		key: ROUNDTRIP_TRACKER_KEY,
		state: {
			init(_conf, state) {
				return {
					sessionEpoch: deps.getSessionEpoch(),
					dirtyBlocks: new Set(),
					blockIdByPos: collectTopLevel(state.doc),
				};
			},
			apply(tr, oldValue, _oldState, newState) {
				const reset = tr.getMeta(ROUNDTRIP_TRACKER_KEY);
				if (reset && reset.kind === 'reset') {
					// session 换代（load / revert / externalChange 后 mount 重挂）。
					return {
						sessionEpoch: reset.epoch ?? deps.getSessionEpoch(),
						dirtyBlocks: new Set(),
						blockIdByPos: collectTopLevel(newState.doc),
					};
				}
				if (!tr.docChanged) return oldValue;
				return applyTransaction(oldValue, tr, newState, deps);
			},
		},
	});
}

/**
 * 遍历 top-level 节点，返回 pos → blockId 的 Map。
 * pos 是节点在 doc 里的起点（top-level 节点的 startPos）。若某节点 attrs.blockId 缺失，
 * 记录一个 sentinel '' 供 apply 阶段补 allocate（应急路径，正常路径 mount 时已灌好）。
 */
function collectTopLevel(doc) {
	const map = new Map();
	if (!doc || !doc.forEach) return map;
	let pos = 0;
	doc.forEach((child, offset) => {
		const id = child && child.attrs && child.attrs.blockId ? child.attrs.blockId : '';
		map.set(offset, id);
		pos = offset;
	});
	return map;
}

/**
 * 每次 dispatch 的 dirty 归并。
 * 算法：
 *   1) 遍历 tr.steps，对每一步用 step.getMap() 把 modified range 映射回 pre-step。
 *   2) 找出 pre-step 里覆盖到的 top-level 节点位置（利用 oldValue.blockIdByPos），
 *      把对应 blockId 加入 dirty。
 *   3) 重新扫描 newState.doc 的 top-level 节点：
 *      · 有 attrs.blockId 且在 pool 里 → 保留。
 *      · attrs.blockId 缺失（split 出的新块）→ deps.allocator.allocate() 分配。
 *        对新分配的 id 立刻加入 dirty（对齐 split/merge 承接规则）。
 *      · 旧 pos 上的 blockId 在 newState 里找不到起点 → merge 掉了 → release。
 *   4) 产出新的 blockIdByPos。
 */
function applyTransaction(oldValue, tr, newState, deps) {
	const dirty = new Set(oldValue.dirtyBlocks);

	// Step 1+2：命中 pre-step 位置的 top-level blockId → dirty。
	for (const step of tr.steps) {
		const map = step.getMap();
		// Steps in ReplaceStep / ReplaceAroundStep 通过 forEach 暴露被替换的区段。
		// 若 step 类型不支持 forEach（很罕见），跳过 dirty 归并只做位置重扫。
		if (typeof map.forEach !== 'function') continue;
		map.forEach((oldStart, oldEnd) => {
			// 命中的 blockId：oldValue.blockIdByPos 里每个 pos 覆盖 [pos, pos + node.nodeSize)。
			// 我们没有 pre-step 的 doc 引用，但 oldValue.blockIdByPos 的 key 集就是 pre-step top-level 起点。
			// 判断：任何 key ≤ oldEnd 且下一个 key > oldStart（或最后一段）→ 命中。
			const positions = [...oldValue.blockIdByPos.keys()].sort((a, b) => a - b);
			for (let i = 0; i < positions.length; i++) {
				const from = positions[i];
				const to = i + 1 < positions.length ? positions[i + 1] : Number.POSITIVE_INFINITY;
				if (to <= oldStart) continue;
				if (from >= oldEnd) break;
				const id = oldValue.blockIdByPos.get(from);
				if (id) dirty.add(id);
			}
		});
	}

	// Step 3：重扫 newState 顶层节点，补齐 attrs.blockId 缺失。
	// 注意：本函数**不改** doc，只读；attrs.blockId 的填充由 mount 阶段（对新块由 view.dispatch
	// 追一个 setNodeMarkup transaction）完成 —— 但我们可以在 apply 里为「新出现」的位置预分配
	// 一个 id 放进 map，让上层看得到，等下一个 tick view 层再回写 attrs。
	const nextMap = new Map();
	const newDoc = newState.doc;
	const seen = new Set();
	newDoc.forEach((child, offset) => {
		const attrId = child && child.attrs && child.attrs.blockId ? child.attrs.blockId : null;
		let id = attrId;
		if (id && deps.allocator.has(id)) {
			// 保留。
		} else if (id && !deps.allocator.has(id)) {
			// attrs 里带了个 pool 外的 id（外部 paste？）—— reserve 或重分配。
			if (!deps.allocator.reserve(id)) {
				id = deps.allocator.allocate();
			}
		} else {
			// split 出的新块 —— 分配新 id。
			id = deps.allocator.allocate();
			dirty.add(id);
		}
		nextMap.set(offset, id);
		seen.add(id);
	});

	// Step 4：清理 merge 掉的旧 blockId（在 oldValue.blockIdByPos 里但 newState 已消失）。
	for (const oldId of oldValue.blockIdByPos.values()) {
		if (!oldId) continue;
		if (!seen.has(oldId)) {
			deps.allocator.release(oldId);
			dirty.delete(oldId);  // 已被删除的块不需要作为 dirty 上报（它不再存在）
		}
	}

	return {
		sessionEpoch: oldValue.sessionEpoch,
		dirtyBlocks: dirty,
		blockIdByPos: nextMap,
	};
}

/**
 * 从 EditorState 拿 tracker state；未挂载时返回 null。
 * @param {EditorState} state
 * @returns {TrackerState | null}
 */
export function getTrackerState(state) {
	return ROUNDTRIP_TRACKER_KEY.getState(state) || null;
}

/** 供 host session ready 后 reset 时使用。 */
export const ROUNDTRIP_TRACKER_META_KEY = ROUNDTRIP_TRACKER_KEY;

/**
 * 便捷读取：拿到当前 dirtyBlocks 数组。
 * @param {EditorState} state
 */
export function getDirtyBlocks(state) {
	const s = getTrackerState(state);
	return s ? [...s.dirtyBlocks] : [];
}

/**
 * 组装 dirtyBlockContents：blockId → 该块在当前 doc 里的 markdown 片段。
 * 需要一个 nodeSerializer 回调 —— 因为片段化 remark stringify 只有 milkdown 的 serializerCtx
 * 能可靠完成；本函数不硬绑 serializerCtx，接受一个 (node) => string。
 *
 * @param {EditorState} state
 * @param {(node) => string} nodeSerializer   将单个 top-level node 序列化为 markdown 片段。
 * @returns {Record<string, string>}
 */
export function packDirtyBlockContents(state, nodeSerializer) {
	const s = getTrackerState(state);
	if (!s) return {};
	const dirty = s.dirtyBlocks;
	if (dirty.size === 0) return {};
	const out = {};
	state.doc.forEach((child, offset) => {
		const id = s.blockIdByPos.get(offset);
		if (id && dirty.has(id)) {
			try { out[id] = nodeSerializer(child); }
			catch { /* 单块序列化失败 → 让 host 降级到 C 全文路径 */ }
		}
	});
	return out;
}

/**
 * 派发 reset meta —— entry.template.js 在 sessionReady 之后调，把 tracker 状态重置到
 * 「新 session, dirty 清空」的起点。
 * @param {EditorView} view
 * @param {number} epoch
 */
export function resetTracker(view, epoch) {
	view.dispatch(view.state.tr.setMeta(ROUNDTRIP_TRACKER_KEY, { kind: 'reset', epoch }));
}

/** 单元测试导出。 */
export const __TEST__ = {
	ROUNDTRIP_TRACKER_KEY,
	collectTopLevel,
	applyTransaction,
};

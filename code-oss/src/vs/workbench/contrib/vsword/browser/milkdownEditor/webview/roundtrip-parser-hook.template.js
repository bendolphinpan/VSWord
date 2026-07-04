// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.1 · Round-trip parser hook
//
// 决策全锁：
//   Q1=c 混合保真度；Qa1=a schema attrs.blockId + PluginState；Qd2=a blockId 不持久化；
//   Qqa1=a nanoid session 内稳定，跨 session 重分配；
//
// 本文件是 webview 侧解析期钩子。**不改** Milkdown 的 parser 契约，而是提供一个纯
// remark AST 遍历函数：
//   · 输入：remark 解析出来的 mdast root + 原文字符串 + 一个 allocator（依赖注入，
//     避免 webview 侧跨目录引用 roundtrip/ 下的 TS 模块，因为 esbuild alias 规则
//     只处理 sibling `.mjs → .template.js` 重写）。
//   · 输出：session snapshot（blockOrder / blockRanges / interstitial / coverage）+
//     mapping（blockId ↔ mdast node），供 tracker plugin 把 blockId 灌到 PM 节点。
//
// 「灌注 attrs.blockId」由 tracker 在 mount 阶段完成 —— 解析期只做纯数据采集。

/** 覆盖率阈值单一入口。webview 侧不导 roundtripSession.ts，这里独立声明保持一致值。 */
export const VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE = 0.95;

/**
 * @param {object} root         remark AST 根节点（type === 'root'，children 是 top-level 数组）。
 * @param {string} sourceText   与 mdast position.offset 对齐的原始字符串（含 BOM/换行原样）。
 * @param {number} epoch        session epoch —— 每次 load 递增。
 * @param {{ allocate(): string }} allocator  只用 allocate 一个方法，其余交由调用方。
 * @returns {{ blockOrder, blockRanges, interstitial, coverage, epoch, mapping }}
 */
export function buildSessionFromMdast(root, sourceText, epoch, allocator) {
	const blockOrder = [];
	const blockRanges = new Map();
	const mapping = [];

	// 只处理 top-level children —— T-3.8.1 契约：session 只跟踪一级块，不下探。
	// list_item / table_row 等嵌套块的 dirty 语义按整个 top-level list / table 计。
	const children = (root && Array.isArray(root.children)) ? root.children : [];

	for (const node of children) {
		const pos = node && node.position;
		if (!pos || !pos.start || !pos.end) continue;
		const from = pos.start.offset;
		const to = pos.end.offset;
		if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
		if (from < 0 || to > sourceText.length) continue;

		const id = allocator.allocate();
		blockOrder.push(id);
		blockRanges.set(id, [from, to]);
		mapping.push({ blockId: id, mdastNode: node, range: [from, to] });
	}

	const interstitial = [];
	{
		let cursor = 0;
		for (const id of blockOrder) {
			const [from, to] = blockRanges.get(id);
			interstitial.push([cursor, from]);
			cursor = to;
		}
		interstitial.push([cursor, sourceText.length]);
	}

	const coverage = computeCoverage(sourceText, blockRanges.values());

	return {
		epoch,
		blockOrder,
		blockRanges,
		interstitial,
		coverage,
		mapping,
	};
}

/**
 * 覆盖率 = 所有 blockRanges 的字符数之和 / sourceText.length。空串返回 1（vacuous 安全）。
 */
export function computeCoverage(sourceText, blockRanges) {
	if (!sourceText.length) return 1;
	let covered = 0;
	for (const [from, to] of blockRanges) {
		if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
		if (to <= from) continue;
		const lo = Math.max(0, from);
		const hi = Math.min(sourceText.length, to);
		if (hi > lo) covered += hi - lo;
	}
	return Math.max(0, Math.min(1, covered / sourceText.length));
}

/**
 * 打包 sessionReady 消息载荷（Webview → Host）。Map 转 Record 以便 JSON 结构化克隆。
 * @param {ReturnType<typeof buildSessionFromMdast>} sessionData
 * @param {{ hasBOM: boolean, newlineStyle: string }} envInfo
 */
export function packSessionReady(sessionData, envInfo) {
	const blockRanges = {};
	for (const [id, r] of sessionData.blockRanges) blockRanges[id] = [r[0], r[1]];
	const safe = sessionData.coverage >= VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE;
	return {
		type: 'sessionReady',
		epoch: sessionData.epoch,
		blockOrder: [...sessionData.blockOrder],
		blockRanges,
		interstitial: sessionData.interstitial.map(r => [r[0], r[1]]),
		coverage: sessionData.coverage,
		hasBOM: !!(envInfo && envInfo.hasBOM),
		newlineStyle: (envInfo && envInfo.newlineStyle) || 'none',
		safe,
	};
}

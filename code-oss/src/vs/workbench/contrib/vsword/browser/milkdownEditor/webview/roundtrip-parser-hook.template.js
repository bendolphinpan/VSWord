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
 * T-3.5c.5b：检测一段 [from, to) 的 source 切片是不是 setext heading。
 * 复用 setext-helpers.mjs 的实现，避免规则分叉。
 */
import { parseSetextHeading } from './setext-helpers.mjs';
function parseSetextBlock(sourceText, from, to) {
	if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
	if (to <= from) return null;
	const lo = Math.max(0, from);
	const hi = Math.min(sourceText.length, to);
	if (hi <= lo) return null;
	return parseSetextHeading(sourceText.slice(lo, hi));
}

/**
 * @param {object} root         remark AST 根节点（type === 'root'，children 是 top-level 数组）。
 * @param {string} sourceText   与 mdast position.offset 对齐的原始字符串（含 BOM/换行原样）。
 * @param {number} epoch        session epoch —— 每次 load 递增。
 * @param {{ allocate(): string }} allocator  只用 allocate 一个方法，其余交由调用方。
 * @returns {{ blockOrder, blockRanges, interstitial, coverage, epoch, mapping, setextHints }}
 */
export function buildSessionFromMdast(root, sourceText, epoch, allocator) {
	const blockOrder = [];
	const blockRanges = new Map();
	const mapping = [];

	// 只处理 top-level children —— T-3.8.1 契约：session 只跟踪一级块，不下探。
	// list_item / table_row 等嵌套块的 dirty 语义按整个 top-level list / table 计。
	const children = (root && Array.isArray(root.children)) ? root.children : [];

	// T-3.5c.5b：先收集 setext hints（与 blockOrder 顺序对齐），保持数据流
	// 单向 —— 不在循环里重复 slice。
	/** @type {Array<{ kind: 'h1' | 'h2', text: string, char: '=' | '-', charCount: number } | null>} */
	const setextHints = [];

	for (const node of children) {
		const pos = node && node.position;
		if (!pos || !pos.start || !pos.end) {
			setextHints.push(null);
			continue;
		}
		const from = pos.start.offset;
		const to = pos.end.offset;
		if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from
			|| from < 0 || to > sourceText.length) {
			setextHints.push(null);
			continue;
		}

		const id = allocator.allocate();
		blockOrder.push(id);
		blockRanges.set(id, [from, to]);
		mapping.push({ blockId: id, mdastNode: node, range: [from, to] });

		// T-3.5c.5b：仅 heading 才可能是 setext；其它块跳过 slice/parse（大文档 open 减负）
		if (node.type === 'heading') {
			setextHints.push(parseSetextBlock(sourceText, from, to));
		} else {
			setextHints.push(null);
		}
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
		// T-3.5c.5b：setext hints（与 blockOrder 对齐）。
		setextHints,
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
		// T-3.5c.5b：setext hints（与 blockOrder 对齐的纯数组）。
		// 这里不复用 blockOrder 索引，因为 host 不需要按 id 反查，只需要
		// 拿到原始数据流以便测试/回放。
		setextHints: (sessionData.setextHints || []).map(h => h ? {
			kind: h.kind, text: h.text, char: h.char, charCount: h.charCount,
		} : null),
	};
}

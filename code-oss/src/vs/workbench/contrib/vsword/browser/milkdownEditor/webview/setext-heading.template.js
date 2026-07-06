// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.5b · Setext heading 保真 —— post-process stringifier。
//
// 目的（PRD F-20 / AC-10 / §8 T-3.5c.5b）：
//   原文是 setext（`Title\n====` = h1，`Title\n----` = h2）时，回写仍按 setext；
//   用户主动改标题内容或级别时按 remark 默认（不强制写回 setext）。
//
// 实现路线（首选：setext-aware serializer，per-PRD 降级路径之外的实施选择）：
//   - remark-stringify 默认 `setext: false`，会把 setext heading 强制改写成 ATX。
//   - 我们**不改** remark-stringify 全局选项（保持全文档 ATX 风格，避
//     免对纯 ATX 文档引入不必要换行 + 与 PRD「用户主动改标题按 remark 默认」
//     一致），而是在序列化后做一次**针对性后处理**：
//       · 用纯 helper 从 sourceText + blockRanges 构造「setext hint 表」
//         （hint.text → FIFO queue）。
//       · 逐行扫描 markdown，遇到 ATX 标题行（`^#{1,2} .+`）时查 hint 队列：
//         - 命中且 depth 一致 → 改写为 `text\n====...` / `text\n----...`，
//           并消费一个 hint。
//         - 命中但 depth 不一致（用户改了级别）→ 保持 ATX。
//         - 未命中（用户改了文本 / 新增标题）→ 保持 ATX。
//   - 这一路线**不依赖** ProseMirror 节点 attrs.blockId（mount 阶段是否灌好
//     不影响本逻辑），也不依赖 tracker plugin state，零侵入、纯数据流。
//
// 与 R5 降级路径的关系：
//   本实现是首选（setext-aware serializer 的轻量变体），没撞墙。
//   万一以后 hint queue 出现 race / 文档结构大幅变化造成 ATX 误回写，
//   退路就是把 rewriteSetextHeadings 调用去掉，回到 remark 默认（ATX）。
//   两种行为都通过 setextHeadingConfig 控制，单行 `enabled: false` 即可降级。

import {
	buildSetextHintQueueFromSource,
	rewriteSetextHeadings,
} from './setext-helpers.mjs';

/**
 * 单例配置。
 * - enabled: false → 整个 setext 后处理跳过，回退到 remark 默认 ATX。
 * - lastHintQueue: 上一次构造的 hint 队列（test-only 入口，外部勿改）。
 */
let _enabled = true;
let _lastHintQueue = null;

/**
 * 安装 / 卸载后处理入口。
 *
 * @param {{ sourceText: string, blockRanges: Iterable<readonly [number, number]> }} payload
 *   - sourceText：当前 session 打开时的原文（含 BOM 原样）。
 *   - blockRanges：与 sourceText 偏移对齐的 [from, to] 区间。
 *   调用后内部的 hint queue 即构建完成，每次 serialize() 都会消费。
 */
export function configureSetextHeading(payload) {
	if (!payload || typeof payload.sourceText !== 'string') {
		// 没原文信息就清空队列。
		_lastHintQueue = new Map();
		return;
	}
	_lastHintQueue = buildSetextHintQueueFromSource(
		payload.sourceText,
		payload.blockRanges || [],
	);
}

/**
 * 关闭 setext 后处理（回退到 remark 默认 ATX）。
 * 测试 / 调试 / 紧急降级用。
 */
export function disableSetextHeading() {
	_enabled = false;
}

/** 重新启用。 */
export function enableSetextHeading() {
	_enabled = true;
}

/**
 * 给定 remark 序列化产出的 markdown 字符串，应用 setext 后处理。
 * 不可变：原字符串不被改。
 *
 * @param {string} markdown
 * @returns {string}
 */
export function postProcessSetextHeadings(markdown) {
	if (!_enabled) return markdown;
	if (!_lastHintQueue || _lastHintQueue.size === 0) return markdown;
	// 拷贝一份 queue 避免消费时污染下一次 serialize（serializer 多次调用场景：
	// 监听器在 dirty 期间可能调用多次，每次必须从同一 hint 集合出发）。
	const queue = new Map();
	for (const [k, v] of _lastHintQueue) {
		queue.set(k, v.slice());
	}
	return rewriteSetextHeadings(markdown, queue);
}

/**
 * 当前 hint queue 状态（test-only 入口）。返回的 Map 是只读快照。
 */
export function peekSetextHintQueue() {
	if (!_lastHintQueue) return new Map();
	return new Map(_lastHintQueue);
}

/** 单元测试导出。 */
export const __TEST__ = {
	configureSetextHeading,
	postProcessSetextHeadings,
	disableSetextHeading,
	enableSetextHeading,
	peekSetextHintQueue,
};

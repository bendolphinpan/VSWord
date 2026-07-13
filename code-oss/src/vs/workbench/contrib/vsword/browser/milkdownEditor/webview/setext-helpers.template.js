// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.5c.5b · Setext heading 保真 —— 纯函数辅助。
//
// 目的（PRD F-20 / T-3.5c.5b）：
//   原文是 setext（`Title\n====` = h1，`Title\n----` = h2）时，回写仍按 setext；
//   用户主动改标题内容或级别时按 remark 默认（不强制写回 setext）。
//
// 实现要点：
//   - 这些函数**不依赖** @milkdown/* / remark，只吃字符串吐出结构化数据。
//   - 由 webview/setext-heading.template.js 在 init 阶段调用 buildSetextHintMap()
//     构造 hint 表，在 serialize 阶段调用 rewriteSetextHeadings() 改写 ATX 行。
//   - 兼容 LF / CRLF：先归一化再匹配；settext 只识别 `=`（h1）/ `-`（h2）连续 1+ 个。
//
// 边界规则（与 mdast-util-to-markdown 一致）：
//   - underline 行只能有同一种 `=` 或 `-`，且后面无内容；空 / 含其他字符 → 非 setext。
//   - title 行可以有任何字符（除换行），trim 后用作 hint.text。
//   - 长度：title 行长度不限，underline 至少 1 个 `=` 或 `-`。
//
// 不处理嵌套（setext 不会出现在嵌套场景：setext 是块级语法）。

/**
 * 匹配 setext heading 一段文本。`Title\n=====` 或 `Title\n-----` 这种。
 * 捕获组：1 = title, 2 = underline char, 3 = underline length（用 char 自身重复次数推算）。
 *
 * 注意：输入应当是单一块（不含前后空行）—— caller 负责切到 block-level。
 */
const SETEXT_UNDERLINE_RE = /^([^\r\n]+)\r?\n([=\-])\2*\s*$/;

/**
 * 把 CRLF / CR 统一成 LF，方便正则匹配。
 * @param {string} text
 */
function normalizeNewlines(text) {
	if (typeof text !== 'string') return '';
	return text.replace(/\r\n?/g, '\n');
}

/**
 * 解析单块文本是否为 setext heading。
 * @param {string} blockText  已是 block 级别（不含前后空行）的字符串。
 * @returns {{ kind: 'h1' | 'h2', text: string, char: '=' | '-', charCount: number } | null}
 */
export function parseSetextHeading(blockText) {
	if (typeof blockText !== 'string') return null;
	const normalized = normalizeNewlines(blockText);
	// 块必须恰好两行：title + underline。带前后空行 / 多余行的都视作非 setext。
	const lines = normalized.split('\n');
	if (lines.length !== 2) return null;
	const title = lines[0];
	const underline = lines[1];
	if (!title || !underline) return null;
	const m = SETEXT_UNDERLINE_RE.exec(title + '\n' + underline);
	if (!m) return null;
	const text = title.trim();
	if (!text) return null;
	const char = m[2];
	if (char !== '=' && char !== '-') return null;
	// underline 字符数用整段 underline 行的长度（去尾空白后）。
	const charCount = underline.replace(/\s+$/, '').length;
	return {
		kind: char === '=' ? 'h1' : 'h2',
		text,
		char,
		charCount,
	};
}

/**
 * 从原文的 blockRange 序列里收集 setext hints。
 * 返回一个 hint 数组，按 blockOrder 顺序对齐（每个 blockId 对应一个 hint 或 null）。
 *
 * @param {Iterable<readonly [number, number]>} blockRanges
 *   Iterable of [from, to] 区间。键（blockId）不关心，只用 values 顺序。
 * @param {string} sourceText  与区间偏移对齐的原文。
 * @returns {Array<{ kind: 'h1' | 'h2', text: string, char: '=' | '-', charCount: number } | null>}
 */
export function collectSetextHints(blockRanges, sourceText) {
	const out = [];
	for (const range of blockRanges) {
		if (!range || range.length !== 2) { out.push(null); continue; }
		const [from, to] = range;
		if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
			out.push(null); continue;
		}
		const block = sourceText.slice(Math.max(0, from), Math.min(sourceText.length, to));
		out.push(parseSetextHeading(block));
	}
	return out;
}

/**
 * 把 hint 数组展平成一个 Map<text, hint[]> —— 同一文本出现多次时按出现顺序消费。
 * 供后续 rewriteSetextHeadings 用。
 *
 * @param {Array<{ kind: 'h1' | 'h2', text: string, char: '=' | '-', charCount: number } | null>} hints
 */
export function buildSetextHintQueue(hints) {
	const queue = new Map();
	for (const h of hints) {
		if (!h) continue;
		const list = queue.get(h.text) || [];
		list.push(h);
		queue.set(h.text, list);
	}
	return queue;
}

/**
 * 把 markdown 字符串里的 ATX 标题改写为 setext —— 规则：
 *   1. 行首匹配 `^(#{1,2})\s+(.+?)\s*#*\s*$` 的视为 ATX 标题。
 *   2. 取 `# ` 后的文字作为 heading text，深度由 `#` 个数决定。
 *   3. 在 hintQueue 里查找 text 对应的 hint；若 depth === hint 深度（h1→1 个 #，h2→2 个 #），
 *      则弹出该 hint 并把整行重写为 `text\n====`（或 `text\n----`）。
 *   4. 其他情况保持 ATX 不动。
 *
 * 同一段 markdown 里的多个相同 text：queue 维护一个 FIFO 指针，逐次消费。
 * queue 耗尽时退回到 ATX（视为用户改了 text）。
 *
 * @param {string} markdown
 * @param {Map<string, Array<{ kind: 'h1' | 'h2', char: '=' | '-', charCount: number }>>} hintQueue
 * @returns {string}
 */
export function rewriteSetextHeadings(markdown, hintQueue) {
	if (typeof markdown !== 'string' || markdown.length === 0) return markdown;
	if (!(hintQueue instanceof Map) || hintQueue.size === 0) return markdown;

	const lines = markdown.split('\n');
	const out = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const m = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!m) {
			out.push(line);
			i += 1;
			continue;
		}
		const depth = m[1].length;
		const text = m[2];
		const list = hintQueue.get(text);
		if (!list || list.length === 0) {
			// 没有 hint 命中 → 保持 ATX。
			out.push(line);
			i += 1;
			continue;
		}
		// 找到第一个 depth 匹配的 hint（FIFO 内取首个匹配的；耗尽的扔掉）。
		let consumed = null;
		let consumedIdx = -1;
		for (let k = 0; k < list.length; k++) {
			const h = list[k];
			if ((h.kind === 'h1' && depth === 1) || (h.kind === 'h2' && depth === 2)) {
				consumed = h;
				consumedIdx = k;
				break;
			}
		}
		if (!consumed) {
			out.push(line);
			i += 1;
			continue;
		}
		// 弹出消费掉的 hint。
		list.splice(consumedIdx, 1);
		if (list.length === 0) hintQueue.delete(text);

		// 改写成 setext：`text\n=====`（charCount 个）。
		// 跟随原行后的空行（典型 ATX 后有 \n\n）也吃掉 1 个空行（setext 自带 1 个 \n）。
		out.push(text);
		out.push(consumed.char.repeat(Math.max(1, consumed.charCount || 1)));
		// setext 自身占 2 行，ATX 也是 1 行。下一轮循环 i+=1 即可。
		// 如果 ATX 原文是 1 个换行（# Title\nbody）—— 不补空行。
		// 如果 ATX 原文是 # Title\n\nbody —— setext 同样需要 1 个空行隔开下一段。
		// 我们这里把 setext 写成 2 行（line + underline），下游的换行照常按 markdown 规则处理。
		i += 1;
	}
	return out.join('\n');
}

/**
 * 单元测试 / 上层 utils 用的便捷包装：从一段完整 sourceText 出发构造 hintQueue。
 *
 * @param {string} sourceText
 * @param {Iterable<readonly [number, number]>} blockRanges
 */
export function buildSetextHintQueueFromSource(sourceText, blockRanges) {
	const hints = collectSetextHints(blockRanges, sourceText);
	return buildSetextHintQueue(hints);
}

/**
 * RD-1 · O(N) 行扫描收集 setext hints —— **不**跑 remark-parse。
 *
 * 与 createEditor 旧路径对齐：只识别「空行分隔的 top-level 两行块」
 * （title + `===`/`---` underline），与 {@link parseSetextHeading} 契约一致。
 * 跳过 fenced code（``` / ~~~）内的伪 setext。
 *
 * 动机：entry 曾在 Editor.make 前 `unified().use(remarkParse).parse(整篇)`，
 * 1MB 纯 parse 约 0.5s，且与 Milkdown 内 GFM parse 重复占内存。
 *
 * @param {string} sourceText
 * @returns {Array<{ kind: 'h1' | 'h2', text: string, char: '=' | '-', charCount: number } | null>}
 */
export function scanSetextHintsFromSource(sourceText) {
	const text = normalizeNewlines(sourceText);
	if (!text) { return []; }
	const lines = text.split('\n');
	/** @type {Array<{ kind: 'h1' | 'h2', text: string, char: '=' | '-', charCount: number }>} */
	const hints = [];
	let inFence = false;
	let fenceMarker = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// CommonMark fence open/close（只看行首 ``` / ~~~）
		const fenceOpen = /^(```+|~~~+)/.exec(line);
		if (fenceOpen) {
			const marker = fenceOpen[1][0] === '`' ? '`' : '~';
			const run = fenceOpen[1];
			if (!inFence) {
				inFence = true;
				fenceMarker = run[0];
			} else if (run[0] === fenceMarker && run.length >= 3) {
				inFence = false;
				fenceMarker = '';
			}
			continue;
		}
		if (inFence) { continue; }

		// top-level 块起点：文件头或前一行为空
		const prevBlank = i === 0 || lines[i - 1].trim() === '';
		if (!prevBlank) { continue; }
		if (i + 1 >= lines.length) { break; }
		if (line.trim() === '') { continue; }

		const underline = lines[i + 1];
		// 块在 underline 后结束：EOF 或下一空行（与 parseSetextHeading 两行块一致）
		const afterOk = i + 2 >= lines.length || lines[i + 2].trim() === '';
		if (!afterOk) { continue; }

		const h = parseSetextHeading(line + '\n' + underline);
		if (h) {
			hints.push(h);
			i += 1; // 跳过 underline
		}
	}
	return hints;
}

/**
 * 从全文 O(N) 扫描构造 setext hint queue（无 remark、无 blockRanges）。
 * @param {string} sourceText
 */
export function buildSetextHintQueueFromSourceScan(sourceText) {
	return buildSetextHintQueue(scanSetextHintsFromSource(sourceText));
}

/** 单元测试导出。 */
export const __TEST__ = {
	SETEXT_UNDERLINE_RE,
	parseSetextHeading,
	collectSetextHints,
	buildSetextHintQueue,
	rewriteSetextHeadings,
	buildSetextHintQueueFromSource,
	scanSetextHintsFromSource,
	buildSetextHintQueueFromSourceScan,
	normalizeNewlines,
};

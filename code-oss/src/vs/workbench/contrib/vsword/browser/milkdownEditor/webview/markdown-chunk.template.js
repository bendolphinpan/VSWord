// @ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RD-1.2 / RD-1.4b · 大文档 progressive open 的纯函数分块。
//
// 背景（ADR 0003）：remark-gfm 中 **table** 扩展在 ~1MB 上 ~8s+，且随长度超线性。
// 策略：按安全边界把全文切成首屏 + 后续 chunk；首屏先喂给 Milkdown，其余 yield 后
// 通过 parser + tr.insert 追加，降低 time-to-interactive。
//
// RD-1.4b：table 密度高时 **自适应缩小** first/next chunk，避免单块 GFM-table 超线性爆炸。
//
// 安全边界（尽量）：
//   - 不在 fenced code（``` / ~~~）内切开
//   - 优先在空行 `\n\n` 处切开
//   - 尽量不在 GFM 表格块中间切开（连续以 `|` 开头或 table separator 的行）

/** 超过此字符数启用 progressive（UTF-16 length，与 String.length 一致）。 */
export const VSWORD_LARGE_DOC_CHARS = 180_000;

/**
 * 首屏目标大小（可略超到下一个安全点）。
 * RD-1.4：默认 48k；且默认 **不** 后台灌满全文，按滚动按需追加（见 entry）。
 * RD-1.4b：table 密文档由 resolveProgressiveChunkSizes 下调。
 */
export const VSWORD_FIRST_CHUNK_CHARS = 48_000;

/** 后续每块目标大小（滚动接近底部时再加载一块）。 */
export const VSWORD_NEXT_CHUNK_CHARS = 48_000;

/** table 中密：首屏 / 后续（字符）。 */
export const VSWORD_FIRST_CHUNK_CHARS_TABLE_MED = 32_000;
export const VSWORD_NEXT_CHUNK_CHARS_TABLE_MED = 24_000;
/** table 高密。 */
export const VSWORD_FIRST_CHUNK_CHARS_TABLE_HIGH = 24_000;
export const VSWORD_NEXT_CHUNK_CHARS_TABLE_HIGH = 16_000;

/**
 * 估算 GFM 表格行占比 [0,1]。
 * 对超长文只采样：头 8k 行扫描预算内扫完全文行指针步进（O(n) 字符，可接受）。
 * @param {string} text
 * @returns {number}
 */
export function estimateTableDensity(text) {
	if (typeof text !== 'string' || text.length === 0) { return 0; }
	let lines = 0;
	let tableLines = 0;
	let i = 0;
	const n = text.length;
	// 采样上限：最多统计 ~2e5 行，避免极端巨文件卡死（仍 O(chars) 扫一遍但行计数有 cap）
	const maxLines = 200_000;
	while (i < n && lines < maxLines) {
		let j = text.indexOf('\n', i);
		if (j === -1) { j = n; }
		const line = text.slice(i, j);
		lines++;
		if (looksLikeTableLine(line)) { tableLines++; }
		i = j + 1;
	}
	if (lines === 0) { return 0; }
	return tableLines / lines;
}

/**
 * RD-1.4b · 按 table 密度选 first/next chunk 目标。
 * @param {string} text
 * @returns {{ firstMax: number, nextMax: number, tableDensity: number, tier: 'low'|'med'|'high' }}
 */
export function resolveProgressiveChunkSizes(text) {
	const tableDensity = estimateTableDensity(text);
	if (tableDensity >= 0.20) {
		return {
			firstMax: VSWORD_FIRST_CHUNK_CHARS_TABLE_HIGH,
			nextMax: VSWORD_NEXT_CHUNK_CHARS_TABLE_HIGH,
			tableDensity,
			tier: 'high',
		};
	}
	if (tableDensity >= 0.05) {
		return {
			firstMax: VSWORD_FIRST_CHUNK_CHARS_TABLE_MED,
			nextMax: VSWORD_NEXT_CHUNK_CHARS_TABLE_MED,
			tableDensity,
			tier: 'med',
		};
	}
	return {
		firstMax: VSWORD_FIRST_CHUNK_CHARS,
		nextMax: VSWORD_NEXT_CHUNK_CHARS,
		tableDensity,
		tier: 'low',
	};
}

/**
 * @param {string} text
 * @param {number} preferMax  希望的切点上界（不含）
 * @returns {number} 安全切点 [1..text.length]；找不到则 text.length
 */
export function findSafeSplitOffset(text, preferMax) {
	if (typeof text !== 'string' || text.length === 0) { return 0; }
	if (!Number.isFinite(preferMax) || preferMax <= 0) { return text.length; }
	if (preferMax >= text.length) { return text.length; }

	// 预扫描 fence 区间，避免 O(n²)
	const fenceMask = buildFenceMask(text);
	const hardMax = Math.min(text.length, Math.floor(preferMax * 1.25) + 2048);
	const softMin = Math.floor(preferMax * 0.55);

	// 从 preferMax 向后找最近的安全 \n\n（不越过 hardMax）
	for (let i = preferMax; i < hardMax - 1; i++) {
		if (text.charCodeAt(i) === 10 /* \n */ && text.charCodeAt(i + 1) === 10) {
			const at = i + 2;
			if (!fenceMask[i] && !isInsideTableRegion(text, at, fenceMask)) {
				return at;
			}
		}
	}

	// 再向前找（不低于 softMin）
	for (let i = preferMax - 1; i >= softMin; i--) {
		if (text.charCodeAt(i) === 10 && i + 1 < text.length && text.charCodeAt(i + 1) === 10) {
			const at = i + 2;
			if (!fenceMask[i] && !isInsideTableRegion(text, at, fenceMask)) {
				return at;
			}
		}
	}

	// 退路：任意换行且不在 fence
	for (let i = preferMax; i < hardMax; i++) {
		if (text.charCodeAt(i) === 10 && !fenceMask[i]) {
			return i + 1;
		}
	}
	for (let i = preferMax - 1; i >= softMin; i--) {
		if (text.charCodeAt(i) === 10 && !fenceMask[i]) {
			return i + 1;
		}
	}

	return Math.min(text.length, hardMax);
}

/**
 * @param {string} text
 * @param {number} [firstMax]
 * @param {number} [nextMax]
 * @returns {string[]} 至少 1 段；拼接应等于原文（无丢失）
 */
export function splitMarkdownProgressive(
	text,
	firstMax = VSWORD_FIRST_CHUNK_CHARS,
	nextMax = VSWORD_NEXT_CHUNK_CHARS,
) {
	if (typeof text !== 'string' || text.length === 0) { return ['']; }
	if (text.length <= firstMax) { return [text]; }

	/** @type {string[]} */
	const chunks = [];
	let offset = 0;
	let target = firstMax;

	while (offset < text.length) {
		const remain = text.length - offset;
		if (remain <= target * 1.15) {
			chunks.push(text.slice(offset));
			break;
		}
		const localPrefer = Math.min(text.length, offset + target);
		let cut = findSafeSplitOffset(text, localPrefer);
		if (cut <= offset) {
			// 强制前进，避免死循环
			cut = Math.min(text.length, offset + target);
		}
		chunks.push(text.slice(offset, cut));
		offset = cut;
		target = nextMax;
	}

	// 完整性：拼接还原
	// （调用方单测断言；运行时不 throw 以免坏文档卡死）
	return chunks;
}

/** 是否应对该文档走 progressive。 */
export function shouldUseProgressiveOpen(text, threshold = VSWORD_LARGE_DOC_CHARS) {
	return typeof text === 'string' && text.length > threshold;
}

/**
 * fence 位图：index i 为 true 表示该字符落在 fenced code 内（含围栏行）。
 * @param {string} text
 * @returns {Uint8Array}
 */
export function buildFenceMask(text) {
	const mask = new Uint8Array(text.length);
	let inFence = false;
	let fenceChar = 0; // 96=` 126=~
	let i = 0;
	while (i < text.length) {
		// 行首
		if (i === 0 || text.charCodeAt(i - 1) === 10) {
			const c = text.charCodeAt(i);
			if (c === 96 || c === 126) {
				let j = i;
				while (j < text.length && text.charCodeAt(j) === c) { j++; }
				const run = j - i;
				if (run >= 3) {
					if (!inFence) {
						inFence = true;
						fenceChar = c;
					} else if (fenceChar === c && run >= 3) {
						// 关闭围栏：整行都算 fence
						const lineEnd = text.indexOf('\n', i);
						const end = lineEnd === -1 ? text.length : lineEnd + 1;
						for (let k = i; k < end; k++) { mask[k] = 1; }
						inFence = false;
						fenceChar = 0;
						i = end;
						continue;
					}
				}
			}
		}
		if (inFence) { mask[i] = 1; }
		i++;
	}
	return mask;
}

/**
 * 粗判 offset 是否落在表格块中（向前看最近非空行是否像 table）。
 * @param {string} text
 * @param {number} offset
 * @param {Uint8Array} fenceMask
 */
function isInsideTableRegion(text, offset, fenceMask) {
	if (offset <= 0 || offset >= text.length) { return false; }
	if (fenceMask[offset]) { return false; }
	// 找当前行起点
	let lineStart = offset;
	while (lineStart > 0 && text.charCodeAt(lineStart - 1) !== 10) { lineStart--; }
	// 向上最多看 8 行
	let cursor = lineStart;
	for (let n = 0; n < 8 && cursor > 0; n++) {
		let prevEnd = cursor - 1; // points at \n
		if (prevEnd > 0 && text.charCodeAt(prevEnd) === 10) {
			// blank line → 离开表格块
			let ps = prevEnd;
			while (ps > 0 && text.charCodeAt(ps - 1) !== 10) { ps--; }
			const prevLine = text.slice(ps, prevEnd);
			if (prevLine.trim() === '') { return false; }
			if (looksLikeTableLine(prevLine)) { return true; }
			// 非 table 行且非空 → 不在 table
			return false;
		}
		break;
	}
	// 当前行自身
	let lineEnd = text.indexOf('\n', lineStart);
	if (lineEnd === -1) { lineEnd = text.length; }
	return looksLikeTableLine(text.slice(lineStart, lineEnd));
}

/** @param {string} line */
function looksLikeTableLine(line) {
	const t = line.trim();
	if (!t) { return false; }
	if (t.charCodeAt(0) === 124 /* | */) { return true; }
	// separator: ---|--- or |---|---|
	if (/^\|?[\s:\-]+\|[\s:\-|]+$/.test(t)) { return true; }
	return false;
}

export const __TEST__ = {
	VSWORD_LARGE_DOC_CHARS,
	VSWORD_FIRST_CHUNK_CHARS,
	VSWORD_NEXT_CHUNK_CHARS,
	VSWORD_FIRST_CHUNK_CHARS_TABLE_MED,
	VSWORD_NEXT_CHUNK_CHARS_TABLE_MED,
	VSWORD_FIRST_CHUNK_CHARS_TABLE_HIGH,
	VSWORD_NEXT_CHUNK_CHARS_TABLE_HIGH,
	findSafeSplitOffset,
	splitMarkdownProgressive,
	shouldUseProgressiveOpen,
	buildFenceMask,
	looksLikeTableLine,
	estimateTableDensity,
	resolveProgressiveChunkSizes,
};

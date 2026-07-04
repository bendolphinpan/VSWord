/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.1 · Round-trip 保真层 · session 数据结构 & 覆盖率 / newline / BOM 检测辅助。
//
// 决策全锁（继承 PRD + 技术方案 + 测试方案）：
//   Q1=c 混合保真度；Qa1=a schema attrs.blockId + PluginState；Qa2=c 整篇 + 选区两命令；
//   Qa3=a 严格 byte-for-byte；Qd1=a webview 上报 dirtyBlockContents；
//   Qd2=a blockId 不持久化，只活运行时；Qd3=a formatSelection 严格 block 对齐；
//   Qqa1=a nanoid session 内稳定，跨 session 重分配；
//   Qqa3=b perf p95 写 test/reports/roundtrip-perf.jsonl。
//
// 本模块是纯数据结构 + 纯函数。不依赖 vscode / DOM / Milkdown / ProseMirror，
// 可以在 Node 单元测试里裸跑（Runner A + Runner B 都能吃）。

export type BlockId = string;

/**
 * UTF-16 code unit 半开区间 [from, to)。与 remark position.offset 对齐，与 String.slice 语义一致。
 * 有意不用磁盘 UTF-8 byte 偏移 —— CJK / emoji 混排下 byte 边界不落在 code point 上，
 * 切片会产 mojibake；code unit 边界受 remark 保证。
 */
export type SrcRange = readonly [from: number, to: number];

export type NewlineStyle = 'LF' | 'CRLF' | 'CR' | 'mixed' | 'none';

/**
 * 覆盖率阈值：session 覆盖原文的比例低于该阈值时视作 range-map 不安全，
 * save 强制走全文 remark 降级（对齐 AC-5）。
 * 常量单一入口，webview 与主机侧共读。
 */
export const VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE = 0.95;

/** BOM 字符（UTF-16 code point 0xFEFF），单一字符，写入首位表示 UTF-8 BOM。 */
export const BOM_CHAR = '\uFEFF';

/**
 * 主机侧 session 快照。webview 首次 sessionReady 后由主机构建，
 * MilkdownWorkingCopy.save() 消费。冷冻不可变。
 */
export interface IRoundtripSession {
	readonly epoch: number;
	/** load 时读到的原文（含 BOM，UTF-16 String）—— 与 blockRanges / interstitial 的偏移对齐。 */
	readonly sourceText: string;
	readonly hasBOM: boolean;
	readonly newlineStyle: NewlineStyle;
	readonly blockOrder: readonly BlockId[];
	readonly blockRanges: ReadonlyMap<BlockId, SrcRange>;
	/** 长度必须 = blockOrder.length + 1；覆盖首、每对相邻块之间、尾的原样区。 */
	readonly interstitial: readonly SrcRange[];
	readonly coverage: number;
	/** coverage >= VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE 且 ranges 结构自洽。 */
	isSafe(): boolean;
}

// ---------------------------------------------------------------------------
// coverage / safety
// ---------------------------------------------------------------------------

/**
 * 覆盖率 = 所有 blockRanges 的字符数之和 / sourceText.length。
 * 不计 interstitial —— interstitial 是"块之外"的字节，与 block 覆盖率无关，
 * 但会被 save-path 增量拼接时原样保留（AC-2）。
 * sourceText 为空时返回 1（vacuous 安全）。
 * 若单个 range 越界，clamp 到 [0, sourceText.length] 后再计入。
 */
export function computeCoverage(sourceText: string, blockRanges: Iterable<SrcRange>): number {
	if (!sourceText.length) { return 1; }
	let covered = 0;
	for (const [from, to] of blockRanges) {
		if (!Number.isFinite(from) || !Number.isFinite(to)) { continue; }
		if (to <= from) { continue; }
		const lo = Math.max(0, from);
		const hi = Math.min(sourceText.length, to);
		if (hi > lo) { covered += hi - lo; }
	}
	return Math.max(0, Math.min(1, covered / sourceText.length));
}

/**
 * 结构自检 —— 判定 session 是否可以作为增量拼接的基线。
 *   1. coverage 达到 VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE
 *   2. interstitial 数量 = blockOrder.length + 1
 *   3. blockRanges 里每个 id 都存在且合法（[from, to) 有序 & 边界内）
 *   4. blockRanges 按 blockOrder 单调递增、互不重叠
 *   5. interstitial 每段自身合法
 * 返回 false 时 save 路径必须降级到 C（全文 remark）。
 */
export function isSessionSafe(session: {
	readonly sourceText: string;
	readonly blockOrder: readonly BlockId[];
	readonly blockRanges: ReadonlyMap<BlockId, SrcRange>;
	readonly interstitial: readonly SrcRange[];
	readonly coverage: number;
}): boolean {
	if (session.coverage < VSWORD_MILKDOWN_ROUNDTRIP_MIN_COVERAGE) { return false; }
	if (session.interstitial.length !== session.blockOrder.length + 1) { return false; }

	let prevEnd = 0;
	for (const id of session.blockOrder) {
		const r = session.blockRanges.get(id);
		if (!r) { return false; }
		const [from, to] = r;
		if (!Number.isFinite(from) || !Number.isFinite(to)) { return false; }
		if (from < 0 || to > session.sourceText.length) { return false; }
		if (to <= from) { return false; }
		if (from < prevEnd) { return false; }  // 与上一块重叠
		prevEnd = to;
	}
	for (const [from, to] of session.interstitial) {
		if (!Number.isFinite(from) || !Number.isFinite(to)) { return false; }
		if (from < 0 || to > session.sourceText.length) { return false; }
		if (to < from) { return false; }  // interstitial 允许空段（to === from）
	}
	return true;
}

// ---------------------------------------------------------------------------
// newline / BOM detection
// ---------------------------------------------------------------------------

/** 首字符是 U+FEFF 视作 BOM。传入空串返回 false。 */
export function hasBOM(sourceText: string): boolean {
	return sourceText.length > 0 && sourceText.charCodeAt(0) === 0xFEFF;
}

/**
 * 检测换行风格。
 *   - 'none': 无换行
 *   - 'LF' / 'CRLF' / 'CR': 全文只有一种
 *   - 'mixed': 同一文档出现多种
 * CR 后紧跟 LF 记为 CRLF 而非 CR+LF 混合（micromark 语义）。
 */
export function detectNewlineStyle(sourceText: string): NewlineStyle {
	let hasCRLF = false;
	let hasLF = false;
	let hasCR = false;
	for (let i = 0; i < sourceText.length; i++) {
		const c = sourceText.charCodeAt(i);
		if (c === 0x0D) {
			if (i + 1 < sourceText.length && sourceText.charCodeAt(i + 1) === 0x0A) {
				hasCRLF = true;
				i++;  // 吞掉 LF
			} else {
				hasCR = true;
			}
		} else if (c === 0x0A) {
			hasLF = true;
		}
	}
	const kinds = (hasCRLF ? 1 : 0) + (hasLF ? 1 : 0) + (hasCR ? 1 : 0);
	if (kinds === 0) { return 'none'; }
	if (kinds > 1) { return 'mixed'; }
	if (hasCRLF) { return 'CRLF'; }
	if (hasLF) { return 'LF'; }
	return 'CR';
}

// ---------------------------------------------------------------------------
// session factory
// ---------------------------------------------------------------------------

export interface RoundtripSessionInit {
	readonly epoch: number;
	readonly sourceText: string;
	readonly blockOrder: readonly BlockId[];
	readonly blockRanges: ReadonlyMap<BlockId, SrcRange>;
	readonly interstitial: readonly SrcRange[];
}

/**
 * 构建一个不可变 session；coverage / newlineStyle / hasBOM / isSafe 自动派生。
 * blockRanges / interstitial 需要在传入前构建好；本函数不做校准，只做派生 + 自检封装。
 */
export function createRoundtripSession(init: RoundtripSessionInit): IRoundtripSession {
	const coverage = computeCoverage(init.sourceText, init.blockRanges.values());
	const _hasBOM = hasBOM(init.sourceText);
	const _newlineStyle = detectNewlineStyle(init.sourceText);
	const snapshot = {
		epoch: init.epoch,
		sourceText: init.sourceText,
		hasBOM: _hasBOM,
		newlineStyle: _newlineStyle,
		blockOrder: init.blockOrder,
		blockRanges: init.blockRanges,
		interstitial: init.interstitial,
		coverage,
	};
	return Object.freeze({
		...snapshot,
		isSafe: () => isSessionSafe(snapshot),
	});
}

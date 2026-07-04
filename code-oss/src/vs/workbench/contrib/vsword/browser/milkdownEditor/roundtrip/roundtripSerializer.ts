/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.2 · save-path 决策树 + 增量拼接。
//
// 三分支保存策略（继承 T-3.8.1 决策锁 Q1=c 混合保真度 / Qa3=a 严格 byte-for-byte）：
//
//   A（byte-for-byte）—— dirty 集合为空、session 结构完好、_openedBytes 缓存在手：
//                       直接把 _openedBytes 原样回写。任何格式化/换行/BOM 全部保住。
//   B（增量 remark）—— session isSafe() 且所有 dirty blockId 都能在 session 中找到，
//                     并且 dirtyBlockContents 覆盖全部 dirty block：
//                     把 interstitial + 未 dirty 的原文 block 切片 + dirty 块的新 markdown
//                     串成新的 UTF-16 字符串，再 UTF-8 编码。
//   C（全文 remark）—— 兜底：session 缺失 / 不安全 / _openedBytes 缺 / dirtyBlockId 越界 /
//                     dirtyBlockContents 覆盖不全 / assembleIncremental 抛异常。
//                     由调用方直接把当前编辑器 serialize 出来的整篇 markdown 写盘。
//
// 本模块是纯函数模块，不依赖 vscode / DOM / Milkdown。Runner A 单测可以裸跑。

import { IRoundtripSession } from './roundtripSession.js';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type SavePath = 'A' | 'B' | 'C';

/**
 * pickSavePath 的输入 —— 全部为快照值，避免在决策阶段回调 view / state。
 */
export interface PickSavePathInput {
	/** T-3.8.1 host 侧 session 快照；未 sessionReady 或 outdated 时为 null。 */
	readonly session: IRoundtripSession | null;
	/**
	 * tracker plugin 报上来的 dirty blockId 集合。整篇 dirty（webview 未开 tracker /
	 * 首次 markdownUpdated 之前）时传 null；无 dirty 时传空数组。
	 */
	readonly dirtyBlockIds: readonly string[] | null;
	/**
	 * 与 dirtyBlockIds 一一对应的最新 markdown 片段。key 必须包含每一个 dirty blockId，
	 * 否则视作覆盖不全，降级到 C。
	 */
	readonly dirtyBlockContents: Readonly<Record<string, string>> | null;
	/** load() 落地的原始磁盘字节（含 BOM），A 分支必需。 */
	readonly openedBytes: Uint8Array | null;
	/**
	 * 强制走某分支，用于 format 命令：
	 *   forcePath='C' —— formatDocument（整篇 remark）
	 *   forcePath='B' —— formatSelection（严格 block 对齐后的增量 remark）
	 *   缺省 —— 走完整决策树。
	 */
	readonly forcePath?: SavePath;
}

// ---------------------------------------------------------------------------
// pickSavePath
// ---------------------------------------------------------------------------

/**
 * save-path 决策树（纯函数）。至少覆盖下列 8 个分支：
 *   1) forcePath='C' → C
 *   2) forcePath='B' + session safe + dirty 全部在 session 内 + contents 覆盖齐 → B
 *   3) forcePath='B' 但 session 不安全 → C（强制回退保正确性）
 *   4) openedBytes==null → C
 *   5) session==null → C
 *   6) session.isSafe()===false → C
 *   7) dirtyBlockIds==null → C（整篇 dirty，无法增量）
 *   8) dirtyBlockIds.length===0 → A（byte-for-byte 回写）
 *   9) 存在 dirty blockId 不在 session.blockOrder → C（session outdated）
 *   10) dirtyBlockContents 覆盖不全（含 null）→ C
 *   11) 默认 → B
 */
export function pickSavePath(input: PickSavePathInput): SavePath {
	const { session, dirtyBlockIds, dirtyBlockContents, openedBytes, forcePath } = input;

	if (forcePath === 'C') {
		return 'C';
	}

	// 无 session / session 不安全 → 强制 C。
	// forcePath='B' 也不例外：session 不安全时 B 拼不出 byte-safe 结果。
	if (!session || !session.isSafe()) {
		return 'C';
	}

	if (forcePath === 'B') {
		// 需要 dirty 集合已知且 contents 覆盖齐；否则退到 C。
		if (!dirtyBlockIds || !dirtyBlockContents) { return 'C'; }
		if (!allDirtyKnown(session, dirtyBlockIds)) { return 'C'; }
		if (!allContentsPresent(dirtyBlockIds, dirtyBlockContents)) { return 'C'; }
		return 'B';
	}

	// 完全整篇 dirty（tracker 尚未挂载） —— 无法增量。
	if (dirtyBlockIds === null) {
		return 'C';
	}

	// 空 dirty + 有原字节 → byte-for-byte 回写。
	if (dirtyBlockIds.length === 0) {
		return openedBytes ? 'A' : 'C';
	}

	// dirty blockId 越界 / contents 缺失 → C。
	if (!allDirtyKnown(session, dirtyBlockIds)) { return 'C'; }
	if (!dirtyBlockContents || !allContentsPresent(dirtyBlockIds, dirtyBlockContents)) { return 'C'; }

	return 'B';
}

function allDirtyKnown(session: IRoundtripSession, ids: readonly string[]): boolean {
	for (const id of ids) {
		if (!session.blockRanges.has(id)) { return false; }
	}
	return true;
}

function allContentsPresent(ids: readonly string[], contents: Readonly<Record<string, string>>): boolean {
	for (const id of ids) {
		const v = contents[id];
		if (typeof v !== 'string') { return false; }
	}
	return true;
}

// ---------------------------------------------------------------------------
// assembleIncremental
// ---------------------------------------------------------------------------

/**
 * B 分支拼装：按 session.blockOrder + session.interstitial 交错拼接，
 * 对 dirty block 用 dirtyBlockContents[id] 替换（可能改变长度），
 * 未 dirty block 用 session.sourceText.slice(from, to) 原样保留（byte-safe）。
 *
 * 拼装规则（对齐 T-3.8.1 决策锁）：
 *   - 结果的换行 / BOM 由 session.sourceText 前后 interstitial 直接携带，不额外注入。
 *   - dirty 片段之间的分隔符靠 interstitial 兜底：如果 remark 序列化产物末尾没有换行，
 *     只要下一段 interstitial 是原文换行区就自然衔接。
 *   - 若某 dirty 片段拼进去后与相邻 interstitial 组合出「块内嵌换行 → 破坏结构」，
 *     那属于业务级异常，交给上层降级；本函数只负责机械拼接。
 *
 * 抛异常 = pickSavePath 侧宣告的 fallback：
 *   - session 结构自检没过（防守二次）
 *   - dirty content 里含有非字符串
 *
 * UTF-8 编码：使用全局 TextEncoder，与 IFileService writeFile 侧 `.toString()` 语义对齐。
 * TextEncoder 会把 U+FEFF 编成三个字节 EF BB BF —— 与磁盘上的 UTF-8 BOM 相同。
 *
 * 返回：新的 Uint8Array（拥有独立底层 ArrayBuffer，调用方可自由 slice）。
 */
export function assembleIncremental(
	session: IRoundtripSession,
	dirtyBlockContents: Readonly<Record<string, string>>,
): Uint8Array {
	if (!session.isSafe()) {
		throw new Error('assembleIncremental: session is not safe');
	}
	if (session.interstitial.length !== session.blockOrder.length + 1) {
		throw new Error('assembleIncremental: interstitial length mismatch');
	}

	const parts: string[] = [];
	const src = session.sourceText;

	for (let i = 0; i < session.blockOrder.length; i++) {
		// 前置 interstitial（首个即 sourceText[0..firstBlock.from]，含 BOM 与文首空行）。
		const [gapFrom, gapTo] = session.interstitial[i];
		parts.push(src.slice(gapFrom, gapTo));

		const blockId = session.blockOrder[i];
		const range = session.blockRanges.get(blockId);
		if (!range) {
			throw new Error(`assembleIncremental: missing range for ${blockId}`);
		}
		const [from, to] = range;

		const dirtyContent = Object.prototype.hasOwnProperty.call(dirtyBlockContents, blockId)
			? dirtyBlockContents[blockId]
			: undefined;
		if (dirtyContent !== undefined) {
			if (typeof dirtyContent !== 'string') {
				throw new Error(`assembleIncremental: non-string content for ${blockId}`);
			}
			parts.push(dirtyContent);
		} else {
			parts.push(src.slice(from, to));
		}
	}
	// 尾 interstitial（含文末换行）。
	const tail = session.interstitial[session.interstitial.length - 1];
	parts.push(src.slice(tail[0], tail[1]));

	const joined = parts.join('');
	return encodeUtf8(joined);
}

// ---------------------------------------------------------------------------
// encoding helpers
// ---------------------------------------------------------------------------

/**
 * UTF-16 → UTF-8。Node 与浏览器都提供 TextEncoder；测试环境（mocha node）里同样可用。
 * 显式创建一个独立 Uint8Array（拷贝一份），避免 TextEncoder 内部缓冲复用带来的别名问题。
 */
export function encodeUtf8(text: string): Uint8Array {
	const enc = new TextEncoder();
	const raw = enc.encode(text);
	// 复制一份，切断底层 buffer 复用。
	const out = new Uint8Array(raw.length);
	out.set(raw);
	return out;
}

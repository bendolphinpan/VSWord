/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.8.1 · blockId 分配器
//
// 决策全锁：
//   Qa1=a schema attrs.blockId + PluginState —— webview 侧 PluginState 持 range-map，
//        block-level 节点在 attrs 或 decoration data-block-id 上带这个 id；
//   Qqa1=a nanoid session 内稳定，跨 session 重分配 —— blockId 是 session-scoped，
//        磁盘不留 VSWord 痕迹（对齐 Qd2=a）。
//
// ID 格式：'b_' + 8 位 base36 + 单调后缀（冲突时 '_1' / '_2' …）
//   · 8 位 base36 ≈ 41 bit 熵，对 5MB 文档冲突概率 <1e-6；
//   · 单调后缀在极端冲突（外部灌 fixed seed）时提供确定性 fallback。
//
// 本模块不依赖 vscode / DOM / ProseMirror。webview 侧与主机侧共用同一份逻辑，
// 通过 esbuild alias 直接引用（webview 也是 ts→bundled js）。

const BLOCK_ID_PREFIX = 'b_';
const BLOCK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BLOCK_ID_RANDOM_LEN = 8;

/** 格式正则：base 部分 'b_' + 8 位 base36；后缀 '_N' 可选，N 是十进制单调整数。 */
export const BLOCK_ID_RE = /^b_[0-9a-z]{8}(?:_\d+)?$/;

export interface IRandomSource {
	/** 生成 [0, 1) 的浮点数，语义与 Math.random 完全一致。允许注入以做确定性测试。 */
	(): number;
}

/**
 * session 内 blockId 分配器 —— 生产一次，走 session 全程；不跨 session。
 *
 * 用法：
 *   const alloc = new BlockIdAllocator();
 *   const id = alloc.allocate();  // 'b_x7k2m9p1'
 *   alloc.reserve('b_x7k2m9p1');  // 从外部（webview 迁移过来的旧 attrs）灌入
 *   alloc.release('b_...')         // block 被删时释放（可选：不释放也不会溢出）
 */
export class BlockIdAllocator {

	private readonly _rand: IRandomSource;
	private readonly _used = new Set<string>();

	constructor(rand: IRandomSource = Math.random) {
		this._rand = rand;
	}

	/**
	 * 生成新 id 并占位。冲突时递增后缀。极端场景 —— 8 位 base36 全部占满 —— 才会
	 * 落到后缀分支；正常路径上 8 位随机足够。
	 */
	allocate(): string {
		const base = this._randomBase();
		if (!this._used.has(base)) {
			this._used.add(base);
			return base;
		}
		// 冲突：单调递增后缀。
		let suffix = 1;
		let candidate = `${base}_${suffix}`;
		while (this._used.has(candidate)) {
			suffix++;
			candidate = `${base}_${suffix}`;
		}
		this._used.add(candidate);
		return candidate;
	}

	/**
	 * 尝试保留外部提供的 id（例如 webview 首次 sessionReady 时把上一版 attrs.blockId 灌进来）。
	 * 只有当 id 格式合法且未占用时才成功；返回是否被接纳。
	 * 不接纳的调用方应该走 allocate() 得到新 id。
	 */
	reserve(id: string): boolean {
		if (!BLOCK_ID_RE.test(id)) { return false; }
		if (this._used.has(id)) { return false; }
		this._used.add(id);
		return true;
	}

	/** 主动释放（block 被 merge / delete 后）。未占用的 id 释放为 no-op。 */
	release(id: string): void {
		this._used.delete(id);
	}

	has(id: string): boolean {
		return this._used.has(id);
	}

	get size(): number {
		return this._used.size;
	}

	/** 仅供测试断言：返回一个只读视图。 */
	snapshot(): ReadonlySet<string> {
		return new Set(this._used);
	}

	private _randomBase(): string {
		let out = BLOCK_ID_PREFIX;
		const alphaLen = BLOCK_ID_ALPHABET.length;
		for (let i = 0; i < BLOCK_ID_RANDOM_LEN; i++) {
			const idx = Math.floor(this._rand() * alphaLen);
			out += BLOCK_ID_ALPHABET.charAt(idx === alphaLen ? alphaLen - 1 : idx);
		}
		return out;
	}
}

/**
 * split / merge 承接规则（供 tracker plugin 消费）：
 *
 *   split A → A + A':
 *     · 原 A.blockId 留给「起始位置在原 range 内」的那个块（通常是第一个）。
 *     · 另一半新 allocate。
 *   merge A + B → C:
 *     · 保留 A.blockId（位置在前的）。
 *     · release(B.blockId)。
 *
 * 这里给一个 helper，供 webview tracker plugin 在 appendTransaction 里直接调用。
 */
export function inheritOnSplit(
	alloc: BlockIdAllocator,
	sourceId: string,
): { readonly keep: string; readonly fresh: string } {
	// 输入 id 必须已在池中；否则调用方 bug。为保守，若未在池中则先 reserve 再走。
	if (!alloc.has(sourceId)) { alloc.reserve(sourceId); }
	return { keep: sourceId, fresh: alloc.allocate() };
}

export function inheritOnMerge(
	alloc: BlockIdAllocator,
	firstId: string,
	secondId: string,
): string {
	if (firstId === secondId) { return firstId; }
	alloc.release(secondId);
	return firstId;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.9.2.c · IME composition 纯函数状态机
//
// 本模块把 T-3.9.2.a 人肉 IME 检查表（微软拼音 / 搜狗 / Google 日文 IME / MS Korean）
// 的合规行为固化成一个可回归的状态机，让上层 webview 侧的 IME 交互（未来若被
// Milkdown / ProseMirror 升级破坏）能被 mocha 单测提前发现。
//
// 契约（对齐 PRD §4.4 6 case）：
//   1) compositionstart → compositionupdate → compositionend：只在 end 时把 buffer
//      内容写入 doc，中间态**不动** doc。
//   2) composition 中间按 backspace：只删 composition buffer，不动 doc（走
//      handleBackspace()）。
//   3) composition 期间外部触发 auto-save：save 被 queue，等 compositionend 后 flush。
//   4) 连续两次 composition：第二次 start 时 buffer 必须已清空，doc 状态是前一次
//      end 后的干净结果。
//   5) composition 中 Escape（IME 取消）：doc 保持进 composition 前的状态，buffer 丢弃。
//   6) 段末位置 composition：cursor 位置正确、doc 追加在末尾。
//
// 设计约束：
// - 纯 JS 模块（.template.js），不 import 任何 @milkdown/* 或 prosemirror-*，测试
//   可直接在 node（甚至无 jsdom）里跑，最小化依赖。
// - 上层 webview 集成时把 ProseMirror 的 view/tr 桥进来（see integration notes at
//   bottom），本文件只负责纯逻辑。

/**
 * @typedef {Object} ImeCompositionState
 * @property {boolean} composing - 是否正处于 composition
 * @property {string}  buffer    - 当前 composition buffer（未提交进 doc 的候选文字）
 * @property {string}  doc       - 文档全文（简化模型：单字符串）
 * @property {number}  cursor    - 光标偏移（0 = 段首，doc.length = 段末）
 * @property {string|null} docSnapshotBeforeComposition - 进 composition 前的 doc（Escape 回滚用）
 * @property {number|null} cursorSnapshotBeforeComposition - 进 composition 前的 cursor
 * @property {boolean} pendingAutoSave - composition 期间是否有 auto-save 被推迟
 * @property {number}  autoSaveFlushCount - 累计触发过多少次真正的 save flush（含延后 flush）
 */

/**
 * 创建一个 IME composition 状态机。
 *
 * @param {Object} opts
 * @param {string} [opts.initialDoc='']    - 初始 doc 内容
 * @param {number} [opts.initialCursor=0]  - 初始 cursor 位置
 * @param {() => void} [opts.onAutoSaveFlush] - 真正 flush save 时的副作用回调
 * @returns {ReturnType<typeof _make>}
 */
export function createImeCompositionState(opts) {
	return _make(opts || {});
}

function _make(opts) {
	const state = /** @type {ImeCompositionState} */ ({
		composing: false,
		buffer: '',
		doc: typeof opts.initialDoc === 'string' ? opts.initialDoc : '',
		cursor: Number.isInteger(opts.initialCursor)
			? Math.max(0, Math.min(opts.initialCursor, (opts.initialDoc || '').length))
			: (opts.initialDoc || '').length,
		docSnapshotBeforeComposition: null,
		cursorSnapshotBeforeComposition: null,
		pendingAutoSave: false,
		autoSaveFlushCount: 0,
	});

	const onAutoSaveFlush = typeof opts.onAutoSaveFlush === 'function' ? opts.onAutoSaveFlush : null;

	function _flushAutoSave() {
		state.autoSaveFlushCount++;
		if (onAutoSaveFlush) { onAutoSaveFlush(); }
	}

	/**
	 * compositionstart：进 composition，快照当前 doc + cursor 用于潜在的 Escape 回滚。
	 * 幂等：若已 composing，忽略（真实浏览器不会连发 start，防御性处理）。
	 * @param {string} [initialData='']
	 */
	function handleCompositionStart(initialData) {
		if (state.composing) { return; }
		state.composing = true;
		state.buffer = typeof initialData === 'string' ? initialData : '';
		state.docSnapshotBeforeComposition = state.doc;
		state.cursorSnapshotBeforeComposition = state.cursor;
	}

	/**
	 * compositionupdate：候选文字变化，只更新 buffer，doc 不动。
	 * @param {string} data
	 */
	function handleCompositionUpdate(data) {
		if (!state.composing) { return; }
		state.buffer = typeof data === 'string' ? data : '';
	}

	/**
	 * compositionend：把 buffer 提交进 doc（cursor 位置处 splice），退出 composing。
	 * 若期间有 pending auto-save，此刻 flush。
	 * @param {string} [finalData]
	 */
	function handleCompositionEnd(finalData) {
		if (!state.composing) { return; }
		const commit = typeof finalData === 'string' ? finalData : state.buffer;
		if (commit.length > 0) {
			state.doc = state.doc.slice(0, state.cursor) + commit + state.doc.slice(state.cursor);
			state.cursor = state.cursor + commit.length;
		}
		state.composing = false;
		state.buffer = '';
		state.docSnapshotBeforeComposition = null;
		state.cursorSnapshotBeforeComposition = null;

		if (state.pendingAutoSave) {
			state.pendingAutoSave = false;
			_flushAutoSave();
		}
	}

	/**
	 * composition 中按 backspace：只删 buffer 的末字符，doc 不动。
	 * 若 buffer 已空且用户仍按 backspace（IME 交给 host 处理）→ 返回 false，让调用方
	 * 走非 composition 路径。
	 * @returns {boolean} true 表示被 composition 消费；false 表示 buffer 已空、host 需接管
	 */
	function handleBackspace() {
		if (!state.composing) { return false; }
		if (state.buffer.length === 0) {
			return false;
		}
		state.buffer = state.buffer.slice(0, -1);
		return true;
	}

	/**
	 * composition 中 Escape：IME 取消，回滚到进 composition 前的 doc / cursor 快照。
	 * 若期间有 pending auto-save，因为 doc 未变更 → 依然 flush（保守：既然 host 认为该
	 * save，取消 IME 后立即执行）。
	 */
	function handleEscape() {
		if (!state.composing) { return; }
		if (state.docSnapshotBeforeComposition !== null) {
			state.doc = state.docSnapshotBeforeComposition;
		}
		if (state.cursorSnapshotBeforeComposition !== null) {
			state.cursor = state.cursorSnapshotBeforeComposition;
		}
		state.composing = false;
		state.buffer = '';
		state.docSnapshotBeforeComposition = null;
		state.cursorSnapshotBeforeComposition = null;

		if (state.pendingAutoSave) {
			state.pendingAutoSave = false;
			_flushAutoSave();
		}
	}

	/**
	 * 外部（host / auto-save timer）请求 save：
	 * - composing 中 → 挂 pending，不真正触发 flush。
	 * - 非 composing → 立即 flush。
	 * @returns {'flushed' | 'pending'}
	 */
	function requestAutoSave() {
		if (state.composing) {
			state.pendingAutoSave = true;
			return 'pending';
		}
		_flushAutoSave();
		return 'flushed';
	}

	/**
	 * 非 composition 下的直接输入（配合场景 6：在段末追加 composition 前，先在段中
	 * 输入一些字建立起始 doc，可用此 API）。
	 * @param {string} text
	 */
	function insertAtCursor(text) {
		if (state.composing) { return; }
		if (typeof text !== 'string' || text.length === 0) { return; }
		state.doc = state.doc.slice(0, state.cursor) + text + state.doc.slice(state.cursor);
		state.cursor += text.length;
	}

	/**
	 * 移动 cursor（配合 case 6 段末定位）。
	 * @param {number} pos
	 */
	function setCursor(pos) {
		if (!Number.isInteger(pos)) { return; }
		state.cursor = Math.max(0, Math.min(pos, state.doc.length));
	}

	function snapshot() {
		// 返回不可变快照，便于测试断言。
		return {
			composing: state.composing,
			buffer: state.buffer,
			doc: state.doc,
			cursor: state.cursor,
			pendingAutoSave: state.pendingAutoSave,
			autoSaveFlushCount: state.autoSaveFlushCount,
		};
	}

	return {
		handleCompositionStart,
		handleCompositionUpdate,
		handleCompositionEnd,
		handleBackspace,
		handleEscape,
		requestAutoSave,
		insertAtCursor,
		setCursor,
		snapshot,
	};
}

// ---------------------------------------------------------------------------
// Integration notes（webview 侧未来接线时读这段）：
// ---------------------------------------------------------------------------
// - ProseMirror 侧真正的 composition 事件在 EditorProps.handleDOMEvents 里拦，
//   映射到本模块的 handleComposition{Start,Update,End}。
// - view.composing / view.input.composing 是 PM 内部标志；本模块的 `composing`
//   仅镜像"逻辑上是否在 composition"，不承担 PM 的 selection/DOM 同步。
// - auto-save 通路：milkdownWorkingCopy.scheduleAutoSave 触发的 setTimeout 到期时
//   如果 view.composing 为 true，应先 requestAutoSave() → 'pending'，让本模块
//   负责在 compositionend 后 flush。
// - Escape 键路由：view-mode-actions.ts 已把 Escape 降到 EditorContrib-10 优先级
//   （见文件 L195 注释），IME cancel 会先被 IME 吞；本模块只需处理"IME 已释放但
//   状态机需回滚 doc 快照"这一分支。

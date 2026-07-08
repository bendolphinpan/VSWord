/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.9.2.c · IME composition 单元测试
//
// 覆盖 PRD §4.4 的 6 个必要 case，作为 T-3.9.2.a 人肉 IME 回归表的代码化承接。
// 依赖：jsdom（拿到 CompositionEvent 构造器） + ime-composition-state.template.js
//       纯函数状态机。ProseMirror 桥接由 webview 侧集成时做（见 template 底部
//       Integration notes），本文件只负责状态机语义回归。
//
// 单跑命令：
//   node code-oss/test/scripts/run-ime-composition-test.mjs
// Gate G 通道由 gate-g.mjs 拉起（T-3.9.4 汇总，本卡不改 gate-g）。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
// @ts-ignore — .template.js 是纯 JS 模块，无 .d.ts。
import { createImeCompositionState } from '../../browser/milkdownEditor/webview/ime-composition-state.template.js';

// ---------------------------------------------------------------------------
// jsdom + CompositionEvent 工具
// ---------------------------------------------------------------------------

/**
 * 建一个最小 jsdom，暴露 CompositionEvent 构造器（用作真实事件对象来源）。
 * 状态机本身不吃事件对象，但 6 case 里我们要模拟真实浏览器事件序列 → 通过 jsdom
 * 拿到浏览器兼容的 event 构造器，然后从 event.data 取值喂给状态机。
 */
function makeDom() {
	const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
		url: 'http://localhost/',
	});
	return dom;
}

function makeCompositionEvent(w: any, type: string, data: string): { type: string; data: string } {
	return new w.CompositionEvent(type, { data: data || '' });
}

function makeKeyboardEvent(w: any, key: string): { key: string } {
	return new w.KeyboardEvent('keydown', { key });
}

// ---------------------------------------------------------------------------
// Suites — 6 必要 case（PRD §4.4）
// ---------------------------------------------------------------------------

suite('T-3.9.2.c · IME composition 状态机 · 6 必要 case', () => {

	test('case 1 · start → update → end：文档新增 "你好" 一次', () => {
		const dom = makeDom();
		const w = dom.window;
		const ime = createImeCompositionState({ initialDoc: '', initialCursor: 0 });

		// compositionstart: 用户按下 IME，候选窗浮出，data 一般为空
		const evStart = makeCompositionEvent(w, 'compositionstart', '');
		ime.handleCompositionStart(evStart.data);
		assert.strictEqual(ime.snapshot().composing, true, 'compositionstart 后应进入 composing');
		assert.strictEqual(ime.snapshot().doc, '', 'start 时 doc 不变');
		assert.strictEqual(ime.snapshot().buffer, '');

		// compositionupdate: IME 逐步选中候选
		ime.handleCompositionUpdate(makeCompositionEvent(w, 'compositionupdate', '你').data);
		assert.strictEqual(ime.snapshot().buffer, '你', 'update 后 buffer=你');
		assert.strictEqual(ime.snapshot().doc, '', 'update 阶段 doc 不动');

		ime.handleCompositionUpdate(makeCompositionEvent(w, 'compositionupdate', '你好').data);
		assert.strictEqual(ime.snapshot().buffer, '你好');
		assert.strictEqual(ime.snapshot().doc, '');

		// compositionend: 用户确认候选，data = 最终提交的字符串
		ime.handleCompositionEnd(makeCompositionEvent(w, 'compositionend', '你好').data);
		const s = ime.snapshot();
		assert.strictEqual(s.composing, false, 'end 后离开 composing');
		assert.strictEqual(s.doc, '你好', 'end 后 doc 提交为 "你好"');
		assert.strictEqual(s.buffer, '', 'end 后 buffer 清空');
		assert.strictEqual(s.cursor, 2, 'cursor 推进到提交文字末尾');
	});

	test('case 2 · composition 中间按 backspace：只删 buffer，不动 doc', () => {
		const ime = createImeCompositionState({ initialDoc: 'ABC', initialCursor: 3 });

		ime.handleCompositionStart('');
		ime.handleCompositionUpdate('nih'); // 拼音串
		ime.handleCompositionUpdate('niha');
		ime.handleCompositionUpdate('nihao');
		assert.strictEqual(ime.snapshot().buffer, 'nihao');
		assert.strictEqual(ime.snapshot().doc, 'ABC', 'buffer 变化期间 doc 保持 ABC');

		// 用户在候选栏按 backspace 删拼音尾字符
		const consumed1 = ime.handleBackspace();
		assert.strictEqual(consumed1, true, 'buffer 非空时 backspace 应被 composition 消费');
		assert.strictEqual(ime.snapshot().buffer, 'niha', 'backspace 只删 buffer 尾字符');
		assert.strictEqual(ime.snapshot().doc, 'ABC', 'doc 保持 ABC 不动');

		// 连删 4 下，把 buffer 清空
		ime.handleBackspace();
		ime.handleBackspace();
		ime.handleBackspace();
		ime.handleBackspace();
		assert.strictEqual(ime.snapshot().buffer, '', 'buffer 已空');

		// buffer 空时再按 backspace，composition 交给 host
		const consumed2 = ime.handleBackspace();
		assert.strictEqual(consumed2, false, 'buffer 空时 backspace 交给 host');
		assert.strictEqual(ime.snapshot().doc, 'ABC', '交出后本模块仍不动 doc');
	});

	test('case 3 · composition 期间 auto-save timer 触发：save 被延迟到 compositionend 后', () => {
		const flushLog = /** @type {number[]} */ ([]);
		const ime = createImeCompositionState({
			initialDoc: '前置',
			initialCursor: 2,
			onAutoSaveFlush: () => { flushLog.push(Date.now()); },
		});

		ime.handleCompositionStart('');
		ime.handleCompositionUpdate('h');
		ime.handleCompositionUpdate('ha');
		ime.handleCompositionUpdate('哈');

		// composition 中间 host 侧 auto-save timer 到期
		const result1 = ime.requestAutoSave();
		assert.strictEqual(result1, 'pending', 'composing 中 auto-save 必须挂 pending');
		assert.strictEqual(ime.snapshot().pendingAutoSave, true);
		assert.strictEqual(ime.snapshot().autoSaveFlushCount, 0, 'flush 尚未发生');
		assert.strictEqual(flushLog.length, 0, 'onAutoSaveFlush 回调尚未触发');

		// 期间又来一次 auto-save 请求（真实 host 可能会重排一次） → 仍 pending，不重复 flush
		const result2 = ime.requestAutoSave();
		assert.strictEqual(result2, 'pending');
		assert.strictEqual(ime.snapshot().autoSaveFlushCount, 0);

		// compositionend → 挂起的 auto-save 被 flush
		ime.handleCompositionEnd('哈');
		const s = ime.snapshot();
		assert.strictEqual(s.composing, false);
		assert.strictEqual(s.doc, '前置哈', 'end 后 doc = 前置 + 哈');
		assert.strictEqual(s.pendingAutoSave, false, 'pending 已消费');
		assert.strictEqual(s.autoSaveFlushCount, 1, 'flush 恰好一次');
		assert.strictEqual(flushLog.length, 1, 'onAutoSaveFlush 恰好触发一次');
	});

	test('case 4 · 快速连续两次 composition：中间无残留 buffer', () => {
		const ime = createImeCompositionState({ initialDoc: '', initialCursor: 0 });

		// 第一次
		ime.handleCompositionStart('');
		ime.handleCompositionUpdate('你');
		ime.handleCompositionUpdate('你好');
		ime.handleCompositionEnd('你好');

		let s = ime.snapshot();
		assert.strictEqual(s.doc, '你好');
		assert.strictEqual(s.buffer, '', '第一次 end 后 buffer 空');
		assert.strictEqual(s.composing, false);
		assert.strictEqual(s.cursor, 2);

		// 第二次立即开始
		ime.handleCompositionStart('');
		s = ime.snapshot();
		assert.strictEqual(s.composing, true);
		assert.strictEqual(s.buffer, '', '第二次 start 时 buffer 必须已清空');
		assert.strictEqual(s.doc, '你好', '第二次 start 时 doc 保持第一次 end 的结果');

		ime.handleCompositionUpdate('世');
		ime.handleCompositionUpdate('世界');
		ime.handleCompositionEnd('世界');

		s = ime.snapshot();
		assert.strictEqual(s.doc, '你好世界', '两次 composition 依次拼接');
		assert.strictEqual(s.buffer, '');
		assert.strictEqual(s.cursor, 4);
	});

	test('case 5 · composition 中 Escape（IME 取消）：doc 保持进 composition 前状态', () => {
		const dom = makeDom();
		const w = dom.window;
		const ime = createImeCompositionState({ initialDoc: '开头', initialCursor: 2 });

		ime.handleCompositionStart('');
		ime.handleCompositionUpdate('xie');
		ime.handleCompositionUpdate('写');
		assert.strictEqual(ime.snapshot().doc, '开头', 'composition 期间 doc 未变');
		assert.strictEqual(ime.snapshot().buffer, '写');

		// 用户按 Escape 取消候选
		const esc = makeKeyboardEvent(w, 'Escape');
		assert.strictEqual(esc.key, 'Escape', 'jsdom KeyboardEvent 构造正常');
		ime.handleEscape();

		const s = ime.snapshot();
		assert.strictEqual(s.composing, false, 'Escape 后离开 composing');
		assert.strictEqual(s.buffer, '', 'Escape 后 buffer 丢弃');
		assert.strictEqual(s.doc, '开头', 'doc 回滚（保持进 composition 前状态）');
		assert.strictEqual(s.cursor, 2, 'cursor 也回滚');

		// 再启动一次 composition 应该完全正常（不残留快照）
		ime.handleCompositionStart('');
		ime.handleCompositionUpdate('对');
		ime.handleCompositionEnd('对');
		assert.strictEqual(ime.snapshot().doc, '开头对', 'Escape 后仍能正常 composition');
	});

	test('case 6 · 段末位置 composition：cursor 位置正确', () => {
		const ime = createImeCompositionState({ initialDoc: 'Hello World', initialCursor: 0 });

		// 先把 cursor 挪到段末
		ime.setCursor('Hello World'.length);
		assert.strictEqual(ime.snapshot().cursor, 11);

		// 段末追加空格 + composition
		ime.insertAtCursor(' ');
		assert.strictEqual(ime.snapshot().doc, 'Hello World ');
		assert.strictEqual(ime.snapshot().cursor, 12);

		ime.handleCompositionStart('');
		ime.handleCompositionUpdate('n');
		ime.handleCompositionUpdate('ni');
		ime.handleCompositionUpdate('你');
		ime.handleCompositionUpdate('你好');
		assert.strictEqual(ime.snapshot().doc, 'Hello World ', 'update 期间段末 doc 不变');
		assert.strictEqual(ime.snapshot().buffer, '你好');

		ime.handleCompositionEnd('你好');
		const s = ime.snapshot();
		assert.strictEqual(s.doc, 'Hello World 你好', '段末 composition 正确追加到末尾');
		assert.strictEqual(s.cursor, s.doc.length, 'cursor 停在段末新位置');
		assert.strictEqual(s.buffer, '');
	});
});

// ---------------------------------------------------------------------------
// Suites — 补强 case（jsdom CompositionEvent 兼容 + 边界防御）
// ---------------------------------------------------------------------------

suite('T-3.9.2.c · IME composition · jsdom 事件构造与防御', () => {

	test('jsdom CompositionEvent 构造器可用且 data 字段透传', () => {
		const dom = makeDom();
		const w = dom.window;
		assert.strictEqual(typeof w.CompositionEvent, 'function', 'jsdom 暴露 CompositionEvent');
		const e1 = new w.CompositionEvent('compositionstart', { data: '' });
		assert.strictEqual(e1.type, 'compositionstart');
		assert.strictEqual(e1.data, '');
		const e2 = new w.CompositionEvent('compositionend', { data: '你好' });
		assert.strictEqual(e2.data, '你好', 'CJK data 字段正确透传');
	});

	test('未进 composition 时 handleCompositionUpdate / End / Backspace / Escape 均无副作用', () => {
		const ime = createImeCompositionState({ initialDoc: 'ABC', initialCursor: 3 });

		ime.handleCompositionUpdate('随便');
		ime.handleCompositionEnd('随便');
		const consumed = ime.handleBackspace();
		ime.handleEscape();

		const s = ime.snapshot();
		assert.strictEqual(s.doc, 'ABC', '非 composing 状态所有 composition API 都不动 doc');
		assert.strictEqual(s.buffer, '');
		assert.strictEqual(s.composing, false);
		assert.strictEqual(s.cursor, 3);
		assert.strictEqual(consumed, false, 'backspace 未被 composition 消费');
	});

	test('非 composing 下 requestAutoSave 立即 flush', () => {
		let flushed = 0;
		const ime = createImeCompositionState({
			initialDoc: 'x',
			initialCursor: 1,
			onAutoSaveFlush: () => { flushed++; },
		});
		const r = ime.requestAutoSave();
		assert.strictEqual(r, 'flushed');
		assert.strictEqual(flushed, 1);
		assert.strictEqual(ime.snapshot().autoSaveFlushCount, 1);
	});
});

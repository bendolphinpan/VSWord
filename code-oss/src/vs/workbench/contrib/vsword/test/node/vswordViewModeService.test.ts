/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.a · VSWordViewModeService 单元测试
//
// 覆盖 DoD §4 的 10 条：
//   1. 默认状态 realtime + focus=off + typewriter=off，ContextKey 一致
//   2. setMode('source') 后 mode='source'，ContextKey source=true / realtime=false
//   3. source ↔ reading 互斥（三态互斥保持）
//   4. toggleFocus 幂等（翻转两次回到起点）
//   5. onDidChangeMode 只在真变化时 fire（重复 setMode 同值不 fire）
//   6. changed 数组精确（focus / mode / typewriter 各一次）
//   7. setMode(reading) 不动 focus/typewriter 的 raw 值（M-5 叠加保留）
//   8. setMode(source) 同样不动 raw 值（M-6 stored 保留）
//   9. dispose 后再调 setMode / toggleFocus 不 fire
//   10. dispose 后 5 个 ContextKey 复位到默认值
//
// dispose 顺序说明：ensureNoDisposablesAreLeakedInTestSuite 内置的 afterEach 会
// 先于用户 teardown 触发（LIFO 注册），因此不能在 teardown 中释放，必须在每个
// test 末尾主动 `disposables.dispose()`。

import * as assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import {
	IViewModeChangeEvent,
	VSWordViewModeService,
} from '../../browser/milkdownEditor/viewMode/vswordViewModeService.js';

function make(): {
	svc: VSWordViewModeService;
	ctx: MockContextKeyService;
	disposables: DisposableStore;
} {
	const disposables = new DisposableStore();
	const ctx = new MockContextKeyService();
	const svc = disposables.add(new VSWordViewModeService(ctx));
	return { svc, ctx, disposables };
}

function ctxValue(ctx: MockContextKeyService, key: string): unknown {
	return ctx.getContextKeyValue(key);
}

suite('VSWord T-3.7b.a · VSWordViewModeService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('默认状态：realtime + focus=off + typewriter=off，ContextKey 与内存一致', () => {
		const { svc, ctx, disposables } = make();
		assert.deepStrictEqual(svc.currentMode, { mode: 'realtime', focus: false, typewriter: false });
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.realtime'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.reading'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.source'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.focus'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.typewriter'), false);
		disposables.dispose();
	});

	test('setMode(source) 更新 mode + ContextKey source=true, realtime=false', () => {
		const { svc, ctx, disposables } = make();
		svc.setMode('source');
		assert.strictEqual(svc.currentMode.mode, 'source');
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.source'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.realtime'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.reading'), false);
		disposables.dispose();
	});

	test('source ↔ reading 互斥：切换 reading 后 source 落 false', () => {
		const { svc, ctx, disposables } = make();
		svc.setMode('source');
		svc.setMode('reading');
		assert.strictEqual(svc.currentMode.mode, 'reading');
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.reading'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.source'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.realtime'), false);
		disposables.dispose();
	});

	test('toggleFocus 幂等：翻转两次回到起点', () => {
		const { svc, ctx, disposables } = make();
		svc.toggleFocus();
		assert.strictEqual(svc.currentMode.focus, true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.focus'), true);
		svc.toggleFocus();
		assert.strictEqual(svc.currentMode.focus, false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.focus'), false);
		disposables.dispose();
	});

	test('onDidChangeMode 只在真变化时 fire（重复 setMode 同值不 fire）', () => {
		const { svc, disposables } = make();
		let fireCount = 0;
		svc.onDidChangeMode(() => { fireCount++; }, undefined, disposables);

		svc.setMode('realtime'); // no-op（默认已是 realtime）
		assert.strictEqual(fireCount, 0);

		svc.setMode('reading'); // 真变化 → fire
		assert.strictEqual(fireCount, 1);

		svc.setMode('reading'); // 同值 no-op
		assert.strictEqual(fireCount, 1);
		disposables.dispose();
	});

	test('changed 数组精确：只 focus 变 → [focus]；只 mode 变 → [mode]；只 typewriter 变 → [typewriter]', () => {
		const { svc, disposables } = make();
		const events: IViewModeChangeEvent[] = [];
		svc.onDidChangeMode(e => events.push(e), undefined, disposables);

		svc.toggleFocus();
		assert.deepStrictEqual(events[0].changed, ['focus']);
		assert.strictEqual(events[0].prev.focus, false);
		assert.strictEqual(events[0].next.focus, true);

		svc.setMode('reading');
		assert.deepStrictEqual(events[1].changed, ['mode']);
		assert.strictEqual(events[1].prev.mode, 'realtime');
		assert.strictEqual(events[1].next.mode, 'reading');

		svc.toggleTypewriter();
		assert.deepStrictEqual(events[2].changed, ['typewriter']);
		assert.strictEqual(events[2].next.typewriter, true);
		disposables.dispose();
	});

	test('setMode(reading) 不动 focus/typewriter 的 raw 值（PRD §3 · M-5 叠加保留）', () => {
		const { svc, disposables } = make();
		svc.toggleFocus();
		svc.toggleTypewriter();
		const before = svc.currentMode;
		assert.strictEqual(before.focus, true);
		assert.strictEqual(before.typewriter, true);

		const events: IViewModeChangeEvent[] = [];
		svc.onDidChangeMode(e => events.push(e), undefined, disposables);

		svc.setMode('reading');
		assert.strictEqual(svc.currentMode.mode, 'reading');
		assert.strictEqual(svc.currentMode.focus, true);
		assert.strictEqual(svc.currentMode.typewriter, true);
		// changed 只应含 'mode'
		assert.deepStrictEqual(events[0].changed, ['mode']);
		disposables.dispose();
	});

	test('setMode(source) 同样不动 focus/typewriter 的 raw 值（PRD §3 · M-6 stored 保留）', () => {
		const { svc, ctx, disposables } = make();
		svc.toggleFocus();
		svc.toggleTypewriter();
		svc.setMode('source');
		assert.strictEqual(svc.currentMode.focus, true);
		assert.strictEqual(svc.currentMode.typewriter, true);
		// ContextKey 直接反映 raw 值（UI 层组合 when 表达式自己屏蔽 source 下视觉效果）
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.focus'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.typewriter'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.source'), true);
		disposables.dispose();
	});

	test('dispose 后再调 setMode / toggleFocus 不再 fire，也不改状态', () => {
		const { svc, disposables } = make();
		let fireCount = 0;
		svc.onDidChangeMode(() => { fireCount++; }, undefined, disposables);
		disposables.dispose(); // 触发 svc.dispose()

		svc.setMode('reading');
		svc.toggleFocus();
		svc.toggleTypewriter();
		assert.strictEqual(fireCount, 0);
		// 状态保留在 dispose 时的快照
		assert.strictEqual(svc.currentMode.mode, 'realtime');
		assert.strictEqual(svc.currentMode.focus, false);
	});

	test('dispose 后 5 个 ContextKey 复位到 RawContextKey 默认值', () => {
		const { svc, ctx, disposables } = make();
		// 先把状态搅乱
		svc.setMode('reading');
		svc.toggleFocus();
		svc.toggleTypewriter();
		// 复核变更后 ContextKey 已跟随
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.reading'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.focus'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.typewriter'), true);

		disposables.dispose(); // 触发 svc.dispose() → ContextKey.reset()

		// dispose 后 reset() 回落到 RawContextKey 声明的默认值
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.realtime'), true);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.reading'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.source'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.focus'), false);
		assert.strictEqual(ctxValue(ctx, 'vsword.viewMode.typewriter'), false);
	});
});

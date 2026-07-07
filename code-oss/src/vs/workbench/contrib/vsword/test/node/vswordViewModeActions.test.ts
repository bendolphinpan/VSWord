/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.b · VSWord 视图模式 Action2 单元测试
//
// 覆盖 DoD §5 ≥ 4 case：
//   1. cycleMode：realtime → reading → source → realtime（三步循环）
//   2. toggleSource 幂等（source ↔ realtime）
//   3. toggleReading 幂等（reading ↔ realtime）
//   4. toggleFocus 调用后 service.toggleFocus 被触发
//   5. toggleTypewriter 调用后 service.toggleTypewriter 被触发
//   6. setRealtime：从 reading 直接切到 realtime
//   7. setRealtime：从 source 直接切到 realtime
//   8. openAsText Action 存在且 run 不抛（TODO stub）
//
// Mock 策略：Action2 单测不需要跑完整 VS Code kernel —— 直接 `new` 出 Action class，
// 手动传 mock ServicesAccessor（一个函数：service id → mock 实现），调 run(accessor)，
// 断言 mock service 记录的调用轨迹。
//
// 注意：import Action 文件会顺带跑 registerAction2 / registerWorkbenchContribution2
// 副作用，但对独立 mocha 进程无害（Registry 只是被 push），不影响断言。

import * as assert from 'assert';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { VswordMilkdownMode } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';
import { IViewModeState, IVSWordViewModeService } from '../../browser/milkdownEditor/viewMode/vswordViewModeService.js';
import {
	VswordCycleModeAction,
	VswordOpenAsTextAction,
	VswordSetRealtimeAction,
	VswordToggleFocusAction,
	VswordToggleReadingAction,
	VswordToggleSourceAction,
	VswordToggleTypewriterAction,
} from '../../browser/milkdownEditor/viewMode/vswordViewModeActions.js';

// ---------------------------------------------------------------------------
// mock 基础
// ---------------------------------------------------------------------------

interface MockViewModeService extends IVSWordViewModeService {
	// 调用轨迹
	readonly calls: {
		setMode: VswordMilkdownMode[];
		toggleFocus: number;
		toggleTypewriter: number;
	};
	// 便于测试直接设置底层 mode（模拟"当前"状态）
	_setInternalMode(mode: VswordMilkdownMode): void;
}

function createMockService(initialMode: VswordMilkdownMode = 'realtime'): MockViewModeService {
	let mode: VswordMilkdownMode = initialMode;
	let focus = false;
	let typewriter = false;
	const calls = {
		setMode: [] as VswordMilkdownMode[],
		toggleFocus: 0,
		toggleTypewriter: 0,
	};
	const svc: MockViewModeService = {
		_serviceBrand: undefined,
		get currentMode(): IViewModeState {
			return { mode, focus, typewriter };
		},
		setMode(next: VswordMilkdownMode): void {
			calls.setMode.push(next);
			mode = next;
		},
		toggleFocus(): void {
			calls.toggleFocus++;
			focus = !focus;
		},
		toggleTypewriter(): void {
			calls.toggleTypewriter++;
			typewriter = !typewriter;
		},
		// dummy event（Action 层用不到）
		onDidChangeMode: () => ({ dispose: () => { /* noop */ } }),
		calls,
		_setInternalMode(m: VswordMilkdownMode): void {
			mode = m;
		},
	};
	return svc;
}

interface MockLog {
	readonly warns: string[];
}

function createMockLogService(): ILogService & MockLog {
	const warns: string[] = [];
	// 只挖出 warn 一路真实；其余方法给成 no-op（Action stub 只调 warn）
	const noop = () => { /* noop */ };
	return {
		_serviceBrand: undefined as unknown as undefined,
		onDidChangeLogLevel: (() => ({ dispose: noop })) as unknown as ILogService['onDidChangeLogLevel'],
		getLevel: (() => 0) as unknown as ILogService['getLevel'],
		setLevel: noop as unknown as ILogService['setLevel'],
		trace: noop as unknown as ILogService['trace'],
		debug: noop as unknown as ILogService['debug'],
		info: noop as unknown as ILogService['info'],
		warn: ((msg: unknown) => { warns.push(String(msg)); }) as unknown as ILogService['warn'],
		error: noop as unknown as ILogService['error'],
		flush: noop as unknown as ILogService['flush'],
		warns,
	} as unknown as ILogService & MockLog;
}

/**
 * 构造一个最小 ServicesAccessor：只回答 IVSWordViewModeService / ILogService。
 * Action 之外任何 accessor.get 都会抛错，方便 catch 未预期的依赖漂移。
 */
function createAccessor(svc: MockViewModeService, log?: ILogService & MockLog): ServicesAccessor {
	return {
		get<T>(id: unknown): T {
			if (id === IVSWordViewModeService) {
				return svc as unknown as T;
			}
			if (id === ILogService) {
				return (log ?? createMockLogService()) as unknown as T;
			}
			throw new Error(`unexpected service id in mock accessor: ${String((id as { _serviceBrand?: string })?._serviceBrand ?? id)}`);
		},
	} as unknown as ServicesAccessor;
}

// ---------------------------------------------------------------------------
// suite
// ---------------------------------------------------------------------------

suite('VSWord T-3.7b.b · vswordViewModeActions', () => {
	test('cycleMode: realtime → reading → source → realtime（三步循环 · Ctrl+/）', () => {
		const svc = createMockService('realtime');
		const acc = createAccessor(svc);
		const action = new VswordCycleModeAction();

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'reading');

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'source');

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'realtime');

		assert.deepStrictEqual(svc.calls.setMode, ['reading', 'source', 'realtime']);
	});

	test('toggleSource 幂等（source ↔ realtime）', () => {
		const svc = createMockService('realtime');
		const acc = createAccessor(svc);
		const action = new VswordToggleSourceAction();

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'source');

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'realtime');

		assert.deepStrictEqual(svc.calls.setMode, ['source', 'realtime']);
	});

	test('toggleReading 幂等（reading ↔ realtime）', () => {
		const svc = createMockService('realtime');
		const acc = createAccessor(svc);
		const action = new VswordToggleReadingAction();

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'reading');

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'realtime');
	});

	test('toggleFocus 调用后 service.toggleFocus 被触发一次', () => {
		const svc = createMockService();
		const acc = createAccessor(svc);
		const action = new VswordToggleFocusAction();

		action.run(acc);
		assert.strictEqual(svc.calls.toggleFocus, 1);
		assert.strictEqual(svc.currentMode.focus, true);

		action.run(acc);
		assert.strictEqual(svc.calls.toggleFocus, 2);
		assert.strictEqual(svc.currentMode.focus, false);
	});

	test('toggleTypewriter 调用后 service.toggleTypewriter 被触发一次', () => {
		const svc = createMockService();
		const acc = createAccessor(svc);
		const action = new VswordToggleTypewriterAction();

		action.run(acc);
		assert.strictEqual(svc.calls.toggleTypewriter, 1);
		assert.strictEqual(svc.currentMode.typewriter, true);
	});

	test('setRealtime：从 reading 直达 realtime（Escape 场景）', () => {
		const svc = createMockService('reading');
		const acc = createAccessor(svc);
		const action = new VswordSetRealtimeAction();

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'realtime');
		assert.deepStrictEqual(svc.calls.setMode, ['realtime']);
	});

	test('setRealtime：从 source 直达 realtime（Escape 场景）', () => {
		const svc = createMockService('source');
		const acc = createAccessor(svc);
		const action = new VswordSetRealtimeAction();

		action.run(acc);
		assert.strictEqual(svc.currentMode.mode, 'realtime');
	});

	test('openAsText Action 存在且 run 不抛（TODO stub · log warn 记录）', () => {
		const svc = createMockService();
		const log = createMockLogService();
		const acc = createAccessor(svc, log);
		const action = new VswordOpenAsTextAction();

		assert.doesNotThrow(() => action.run(acc));
		// 走 log.warn stub 分支
		assert.strictEqual(log.warns.length, 1);
		assert.ok(log.warns[0].includes('openAsText'));
		// 不应该动 view mode 状态
		assert.deepStrictEqual(svc.calls.setMode, []);
		assert.strictEqual(svc.calls.toggleFocus, 0);
	});

	test('Action id 常量匹配 PRD §4.1 表格', () => {
		assert.strictEqual(VswordCycleModeAction.ID, 'vsword.viewMode.cycleMode');
		assert.strictEqual(VswordToggleSourceAction.ID, 'vsword.viewMode.toggleSource');
		assert.strictEqual(VswordToggleReadingAction.ID, 'vsword.viewMode.toggleReading');
		assert.strictEqual(VswordSetRealtimeAction.ID, 'vsword.viewMode.setRealtime');
		assert.strictEqual(VswordToggleFocusAction.ID, 'vsword.viewMode.toggleFocus');
		assert.strictEqual(VswordToggleTypewriterAction.ID, 'vsword.viewMode.toggleTypewriter');
		assert.strictEqual(VswordOpenAsTextAction.ID, 'vsword.viewMode.openAsText');
	});
});

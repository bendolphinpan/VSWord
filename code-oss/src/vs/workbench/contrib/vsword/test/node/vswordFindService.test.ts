/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.c2 · IVSWordFindService + host 命令 + protocol.find.stateChanged 单元测试
//
// 覆盖 c2 卡 §5 的 4 条：
//   1. setState 部分更新，其他字段保持不变
//   2. onDidChangeState fire 次数 = setState 调用次数
//   3. 命令 `vsword.find.open` 执行后 → service.state.open === true
//   4. protocol `find.stateChanged` payload（去掉 type 字段后）→ service.setState 收敛为对应 state
//
// mock 策略：
//   · service 直接 `new VSWordFindService()`（no ContextKey 依赖，纯内存 state）
//   · Action2 单测用 mock ServicesAccessor（回答 IVSWordFindService + IEditorService）
//   · IEditorService 只需要 `activeEditor: null` —— 命令走 no-op postMessage 分支，
//     仍会执行 setState（这是 host 侧镜像的乐观写入路径）
//
// 参考：`vswordViewModeService.test.ts`（service 直构）+
//       `vswordViewModeActions.test.ts`（mock accessor 模式）

import * as assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import {
	FindState,
	IVSWordFindService,
	VSWORD_FIND_DEFAULT_STATE,
} from '../../common/vswordFindService.js';
import { VSWordFindService } from '../../browser/milkdownEditor/find/vswordFindService.js';
import {
	VswordFindCloseAction,
	VswordFindOpenAction,
	VswordFindReplaceOpenAction,
} from '../../browser/milkdownEditor/find/vswordFindCommands.js';

/**
 * 构造最小 ServicesAccessor：只回答 IVSWordFindService / IEditorService。
 * IEditorService.activeEditor = null → command 走 no-op postMessage 分支，
 * 但依然会调 service.setState —— 这正是我们要断言的路径。
 */
function createAccessor(svc: IVSWordFindService): ServicesAccessor {
	const fakeEditorService = {
		_serviceBrand: undefined,
		activeEditor: null,
	} as unknown as IEditorService;
	return {
		get<T>(id: unknown): T {
			if (id === IVSWordFindService) {
				return svc as unknown as T;
			}
			if (id === IEditorService) {
				return fakeEditorService as unknown as T;
			}
			throw new Error(`unexpected service id in mock accessor: ${String((id as { _serviceBrand?: string })?._serviceBrand ?? id)}`);
		},
	} as unknown as ServicesAccessor;
}

suite('VSWord T-3.7c.3.c2 · VSWordFindService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('默认 state = VSWORD_FIND_DEFAULT_STATE（open=false / query=空 / activeIndex=-1）', () => {
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());
		assert.deepStrictEqual(svc.state, VSWORD_FIND_DEFAULT_STATE);
		assert.strictEqual(svc.state.open, false);
		assert.strictEqual(svc.state.query, '');
		assert.strictEqual(svc.state.activeIndex, -1);
		disposables.dispose();
	});

	test('setState 部分更新：只覆盖 partial 提供的字段，其他保持不变', () => {
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());

		svc.setState({ open: true, query: 'hello', matchCount: 3, activeIndex: 0 });
		assert.strictEqual(svc.state.open, true);
		assert.strictEqual(svc.state.query, 'hello');
		assert.strictEqual(svc.state.matchCount, 3);
		assert.strictEqual(svc.state.activeIndex, 0);
		// 未提供字段保持默认值
		assert.strictEqual(svc.state.replaceQuery, '');
		assert.strictEqual(svc.state.caseSensitive, false);
		assert.strictEqual(svc.state.wholeWord, false);
		assert.strictEqual(svc.state.regex, false);

		// 二次 setState 只动 caseSensitive —— 其他 7 字段必须原样保留
		svc.setState({ caseSensitive: true });
		assert.strictEqual(svc.state.caseSensitive, true);
		assert.strictEqual(svc.state.open, true, 'open 应保持 true');
		assert.strictEqual(svc.state.query, 'hello', 'query 应保持 hello');
		assert.strictEqual(svc.state.matchCount, 3, 'matchCount 应保持 3');
		assert.strictEqual(svc.state.activeIndex, 0, 'activeIndex 应保持 0');

		disposables.dispose();
	});

	test('onDidChangeState fire 次数 = setState 调用次数（不做 shallow-equal 判等）', () => {
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());
		let fireCount = 0;
		const events: FindState[] = [];
		svc.onDidChangeState(e => { fireCount++; events.push(e); }, undefined, disposables);

		svc.setState({ open: true });
		svc.setState({ query: 'a' });
		svc.setState({ query: 'a' });        // 同值再写：service 不做判等 → 依然 fire
		svc.setState({ matchCount: 2 });

		assert.strictEqual(fireCount, 4, 'fire 一次 setState 一次');
		assert.strictEqual(events[0].open, true);
		assert.strictEqual(events[1].query, 'a');
		assert.strictEqual(events[3].matchCount, 2);
		disposables.dispose();
	});

	test('setState 忽略非法输入（null / 非 object），且 dispose 后再调不 fire', () => {
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());
		let fireCount = 0;
		svc.onDidChangeState(() => { fireCount++; }, undefined, disposables);

		// 非法输入不触发 fire，也不改状态
		svc.setState(null as unknown as Partial<FindState>);
		svc.setState('bad' as unknown as Partial<FindState>);
		assert.strictEqual(fireCount, 0);
		assert.deepStrictEqual(svc.state, VSWORD_FIND_DEFAULT_STATE);

		// 一次正常 setState
		svc.setState({ open: true });
		assert.strictEqual(fireCount, 1);

		// dispose 后再 setState 不 fire、不改状态
		svc.dispose();
		svc.setState({ open: false, query: 'xxx' });
		assert.strictEqual(fireCount, 1, 'dispose 后不再 fire');
		assert.strictEqual(svc.state.open, true, 'dispose 后 state 冻结在最后快照');

		disposables.dispose();
	});

	test('命令 vsword.find.open：run 后 service.state.open === true', () => {
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());
		const acc = createAccessor(svc);

		assert.strictEqual(svc.state.open, false, '初始为 false');
		new VswordFindOpenAction().run(acc);
		assert.strictEqual(svc.state.open, true, 'find.open 后 open=true');

		disposables.dispose();
	});

	test('命令 vsword.find.replace.open + vsword.find.close：open 状态可来回切换', () => {
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());
		const acc = createAccessor(svc);

		new VswordFindReplaceOpenAction().run(acc);
		assert.strictEqual(svc.state.open, true, 'replace.open 后 open=true');

		new VswordFindCloseAction().run(acc);
		assert.strictEqual(svc.state.open, false, 'find.close 后 open=false');

		disposables.dispose();
	});

	test('protocol find.stateChanged 消息 → service.setState 收敛为对应 state', () => {
		// 模拟 milkdownEditorContribution 的分派逻辑：`const { type: _t, ...partial } = msg`
		// 然后 `findService.setState(partial)` —— 这里直接复现同样的解构 + 转发。
		const disposables = new DisposableStore();
		const svc = disposables.add(new VSWordFindService());

		const msg = {
			type: 'find.stateChanged' as const,
			open: true,
			query: 'foo',
			matchCount: 5,
			activeIndex: 2,
			caseSensitive: true,
		};
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { type: _type, ...partial } = msg;
		svc.setState(partial);

		assert.strictEqual(svc.state.open, true);
		assert.strictEqual(svc.state.query, 'foo');
		assert.strictEqual(svc.state.matchCount, 5);
		assert.strictEqual(svc.state.activeIndex, 2);
		assert.strictEqual(svc.state.caseSensitive, true);
		// 未提供字段仍为默认
		assert.strictEqual(svc.state.replaceQuery, '');
		assert.strictEqual(svc.state.wholeWord, false);
		assert.strictEqual(svc.state.regex, false);

		// 再收一条只带 activeIndex 变化的消息 —— 其他字段必须原样保留
		const msg2 = { type: 'find.stateChanged' as const, activeIndex: 3 };
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { type: _t2, ...partial2 } = msg2;
		svc.setState(partial2);
		assert.strictEqual(svc.state.activeIndex, 3);
		assert.strictEqual(svc.state.query, 'foo', 'query 应保持 foo');
		assert.strictEqual(svc.state.matchCount, 5, 'matchCount 应保持 5');

		disposables.dispose();
	});
});

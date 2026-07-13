/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.e · 组合矩阵单元测试（旧 PRD 3×2×2 双 toggle）
//
// ⚠️ RD-4 / 0005（2026-07-13）：本 suite **整表 pending / 陈旧**。
// 现行语义是 substyle radio（normal|focus|typewriter）+ T-3.13.2 reading×三档，
// 权威回归在 `viewModes.test.ts` / `modeSwitchComponent.test.ts`。
// 勿再按 data-focus / data-typewriter 双属性扩展本文件；删档延后到清理债。
//
// 历史说明（归档）：
//   覆盖旧 PRD §3 的 6 条组合矩阵；shell data-focus/data-typewriter + service + ContextKey。
//   source 模式下 shell 视觉屏蔽、stored 保留。

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { VswordMilkdownMode } from '../../browser/milkdownEditor/milkdownEditorProtocol.js';
import { VSWordViewModeService } from '../../browser/milkdownEditor/viewMode/vswordViewModeService.js';
// @ts-ignore — .template.js 是纯 JS 模块，运行期靠 esbuild bundle 解析。
import { createModeController } from '../../browser/milkdownEditor/webview/mode-controller.template.js';

// ---------------------------------------------------------------------------
// 类型与工具
// ---------------------------------------------------------------------------

type MatrixAction =
	| 'noop'
	| 'toggleFocus'
	| 'toggleTypewriter'
	| { setMode: VswordMilkdownMode };

interface MatrixInit {
	mode: VswordMilkdownMode;
	focus: 'on' | 'off';
	typewriter: 'on' | 'off';
}

// mode-controller.template.js 是纯 JS 模块，不带类型；这里给 ctrl 用最小结构类型，
// 具体字段用 (m: string) 而不是 VswordMilkdownMode，因为 JS 侧运行期只做 valid mode 检查。
interface ModeControllerHandle {
	getMode(): string;
	isFocusOn(): boolean;
	isTypewriterOn(): boolean;
	switchTo(m: string, opts?: { silent?: boolean }): void;
	setFocus(on: boolean): void;
	setTypewriter(on: boolean): void;
}

interface MatrixHarness {
	dom: JSDOM;
	shell: HTMLElement;
	ctrl: ModeControllerHandle;
	svc: VSWordViewModeService;
	ctx: MockContextKeyService;
	disposables: DisposableStore;
}

function bootstrap(): MatrixHarness {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div class="vsword-md-shell" data-mode="realtime" data-focus="off" data-typewriter="off">
			<button class="vsword-md-mode-btn" data-mode="realtime" aria-pressed="true"></button>
			<button class="vsword-md-mode-btn" data-mode="reading" aria-pressed="false"></button>
			<button class="vsword-md-mode-btn" data-mode="source" aria-pressed="false"></button>
			<button class="vsword-md-toggle-btn" data-toggle="focus" aria-pressed="false"></button>
			<button class="vsword-md-toggle-btn" data-toggle="typewriter" aria-pressed="false"></button>
			<textarea id="milkdown-source"></textarea>
		</div>
	</body></html>`, { url: 'http://localhost/' });
	// @ts-ignore — controller 依赖 window.addEventListener + rAF
	globalThis.window = dom.window;
	// @ts-ignore
	globalThis.document = dom.window.document;
	// @ts-ignore
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;

	const shell = dom.window.document.querySelector('.vsword-md-shell') as HTMLElement;
	const buttons = dom.window.document.querySelectorAll('.vsword-md-mode-btn');
	const toggleButtons = dom.window.document.querySelectorAll('.vsword-md-toggle-btn');
	const sourceTextarea = dom.window.document.getElementById('milkdown-source') as HTMLTextAreaElement;

	let md = '# hello';
	const ctrl = createModeController({
		shell, buttons, toggleButtons, sourceTextarea,
		getMarkdown: () => md,
		setMarkdown: (v: string) => { md = v; },
		vscode: { postMessage: () => { /* noop: 矩阵测试不校验 host 消息 */ } },
	});

	const disposables = new DisposableStore();
	const ctx = new MockContextKeyService();
	const svc = disposables.add(new VSWordViewModeService(ctx));

	return { dom, shell, ctrl, svc, ctx, disposables };
}

/** 把 init 状态同步施加到 controller 和 service。 */
function primeInit(harness: MatrixHarness, init: MatrixInit): void {
	const { ctrl, svc } = harness;

	// mode（默认 realtime，仅在非 realtime 时需切）
	if (init.mode !== 'realtime') {
		ctrl.switchTo(init.mode, { silent: true });
		svc.setMode(init.mode);
	}

	// focus/typewriter 独立开关（默认 off，仅在 on 时需 toggle）
	// 注意：先把 mode 拨到位后再切 toggle —— PRD M-4/M-5/M-6 的 init 包含 focus=on
	// 且 M-6 从 realtime + focus=on 出发（不是从 source 出发），所以顺序无歧义。
	if (init.focus === 'on') {
		ctrl.setFocus(true);
		svc.toggleFocus();
	}
	if (init.typewriter === 'on') {
		ctrl.setTypewriter(true);
		svc.toggleTypewriter();
	}
}

/** 把 action 同步施加到 controller 和 service。 */
function applyAction(harness: MatrixHarness, act: MatrixAction): void {
	const { ctrl, svc } = harness;

	if (act === 'noop') {
		return;
	}
	if (act === 'toggleFocus') {
		ctrl.setFocus(!ctrl.isFocusOn());
		svc.toggleFocus();
		return;
	}
	if (act === 'toggleTypewriter') {
		ctrl.setTypewriter(!ctrl.isTypewriterOn());
		svc.toggleTypewriter();
		return;
	}
	if (typeof act === 'object' && 'setMode' in act) {
		ctrl.switchTo(act.setMode);
		svc.setMode(act.setMode);
		return;
	}
}

interface AttrExpect {
	'data-mode': VswordMilkdownMode;
	'data-focus': 'on' | 'off';
	'data-typewriter': 'on' | 'off';
}

function assertShellAttrs(shell: HTMLElement, expect: AttrExpect, caseId: string): void {
	assert.strictEqual(shell.getAttribute('data-mode'), expect['data-mode'],
		`${caseId} · shell data-mode`);
	assert.strictEqual(shell.getAttribute('data-focus'), expect['data-focus'],
		`${caseId} · shell data-focus`);
	assert.strictEqual(shell.getAttribute('data-typewriter'), expect['data-typewriter'],
		`${caseId} · shell data-typewriter`);
}

function assertServiceState(
	svc: VSWordViewModeService,
	expect: { mode: VswordMilkdownMode; focus: boolean; typewriter: boolean },
	caseId: string,
): void {
	assert.strictEqual(svc.currentMode.mode, expect.mode, `${caseId} · service.mode`);
	assert.strictEqual(svc.currentMode.focus, expect.focus, `${caseId} · service.focus (raw)`);
	assert.strictEqual(svc.currentMode.typewriter, expect.typewriter, `${caseId} · service.typewriter (raw)`);
}

function assertContextKeys(
	ctx: MockContextKeyService,
	expect: { mode: VswordMilkdownMode; focus: boolean; typewriter: boolean },
	caseId: string,
): void {
	assert.strictEqual(ctx.getContextKeyValue('vsword.viewMode.realtime'), expect.mode === 'realtime',
		`${caseId} · ContextKey vsword.viewMode.realtime`);
	assert.strictEqual(ctx.getContextKeyValue('vsword.viewMode.reading'), expect.mode === 'reading',
		`${caseId} · ContextKey vsword.viewMode.reading`);
	assert.strictEqual(ctx.getContextKeyValue('vsword.viewMode.source'), expect.mode === 'source',
		`${caseId} · ContextKey vsword.viewMode.source`);
	assert.strictEqual(ctx.getContextKeyValue('vsword.viewMode.focus'), expect.focus,
		`${caseId} · ContextKey vsword.viewMode.focus (raw)`);
	assert.strictEqual(ctx.getContextKeyValue('vsword.viewMode.typewriter'), expect.typewriter,
		`${caseId} · ContextKey vsword.viewMode.typewriter (raw)`);
}

// ---------------------------------------------------------------------------
// suite · 组合矩阵 M-1 … M-6
// ---------------------------------------------------------------------------
//
// [T-3.12.3.a · 2026-07-09] 整个 suite 暂 skip.
//
// 原因: v1 (T-3.7b.e) 假设 focus / typewriter 是两个独立 boolean toggle，DOM 上
// 用 `data-focus=on|off` + `data-typewriter=on|off` 两属性并存。v2 (T-3.12.3.a,
// docs/plans/003-phase3-mode-orthogonality.md) 把两者合并为单一 substyle radio
// (`data-substyle=normal|focus|typewriter`, 三选一互斥), 与 svc.toggleFocus /
// toggleTypewriter (host 侧仍是独立 boolean) 不再 1:1 对齐 —— M-4 (focus=on +
// tw=on) 在 v2 里 shell 只显示 substyle=<后 set 者>, 而 service state raw 值
// 保持独立 boolean 语义, 三处一致断言不再成立。
//
// PRD §7 T-3.12.3.c 定义了 v2 语义下的新矩阵单测 (M-1..M-7, 由 qa profile 落地).
// 本文件保留骨架供后续参考; 待 3.c 完成后, 由该卡决定是删除还是重写为 v2 一致性
// 测试 (controller substyle radio ↔ host preferenceUpdate focus/typewriter 派生
// 值 ↔ service state ↔ ContextKey 四处一致).
suite.skip('VSWord T-3.7b.e · 组合矩阵 M-1 … M-6（PRD §3 · 三处一致断言）', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('M-1 · realtime + focus=off + tw=off + noop（首启默认）', () => {
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'off', typewriter: 'off' });
		applyAction(h, 'noop');

		assertShellAttrs(h.shell, {
			'data-mode': 'realtime', 'data-focus': 'off', 'data-typewriter': 'off',
		}, 'M-1');
		assertServiceState(h.svc, { mode: 'realtime', focus: false, typewriter: false }, 'M-1');
		assertContextKeys(h.ctx, { mode: 'realtime', focus: false, typewriter: false }, 'M-1');

		h.disposables.dispose();
	});

	test('M-2 · realtime + toggleFocus → focus=on（US-3 主场景）', () => {
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'off', typewriter: 'off' });
		applyAction(h, 'toggleFocus');

		assertShellAttrs(h.shell, {
			'data-mode': 'realtime', 'data-focus': 'on', 'data-typewriter': 'off',
		}, 'M-2');
		assertServiceState(h.svc, { mode: 'realtime', focus: true, typewriter: false }, 'M-2');
		assertContextKeys(h.ctx, { mode: 'realtime', focus: true, typewriter: false }, 'M-2');

		h.disposables.dispose();
	});

	test('M-3 · realtime + toggleTypewriter → tw=on（US-4 主场景）', () => {
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'off', typewriter: 'off' });
		applyAction(h, 'toggleTypewriter');

		assertShellAttrs(h.shell, {
			'data-mode': 'realtime', 'data-focus': 'off', 'data-typewriter': 'on',
		}, 'M-3');
		assertServiceState(h.svc, { mode: 'realtime', focus: false, typewriter: true }, 'M-3');
		assertContextKeys(h.ctx, { mode: 'realtime', focus: false, typewriter: true }, 'M-3');

		h.disposables.dispose();
	});

	test('M-4 · realtime + focus=on + toggleTypewriter → 两开关叠加（合法）', () => {
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'on', typewriter: 'off' });
		applyAction(h, 'toggleTypewriter');

		assertShellAttrs(h.shell, {
			'data-mode': 'realtime', 'data-focus': 'on', 'data-typewriter': 'on',
		}, 'M-4');
		assertServiceState(h.svc, { mode: 'realtime', focus: true, typewriter: true }, 'M-4');
		assertContextKeys(h.ctx, { mode: 'realtime', focus: true, typewriter: true }, 'M-4');

		h.disposables.dispose();
	});

	test('M-5 · realtime + focus=on + tw=on → setMode(reading)（US-2 · focus/tw 叠加保留）', () => {
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'on', typewriter: 'on' });
		applyAction(h, { setMode: 'reading' });

		// reading 下 focus/typewriter 视觉照常生效（与 source 不同）
		assertShellAttrs(h.shell, {
			'data-mode': 'reading', 'data-focus': 'on', 'data-typewriter': 'on',
		}, 'M-5');
		assertServiceState(h.svc, { mode: 'reading', focus: true, typewriter: true }, 'M-5');
		assertContextKeys(h.ctx, { mode: 'reading', focus: true, typewriter: true }, 'M-5');

		h.disposables.dispose();
	});

	test('M-6 · realtime + focus=on + tw=on → setMode(source)（US-1 · 视觉禁用 · stored 保留）', () => {
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'on', typewriter: 'on' });
		applyAction(h, { setMode: 'source' });

		// (a) shell attribute：source 视觉屏蔽 focus/typewriter → 全 off
		assertShellAttrs(h.shell, {
			'data-mode': 'source', 'data-focus': 'off', 'data-typewriter': 'off',
		}, 'M-6');

		// (b) service state：raw 值不动（PRD §3 M-6 备注 + D-2）
		assertServiceState(h.svc, { mode: 'source', focus: true, typewriter: true }, 'M-6');

		// (c) ContextKey：直接反映 raw 值（PRD §4.2 · UI when 表达式自己屏蔽视觉）
		assertContextKeys(h.ctx, { mode: 'source', focus: true, typewriter: true }, 'M-6');

		// (d) M-6 stored 保留额外断言：service currentMode.focus / typewriter 的 raw 值
		//     与切换前一致（对齐 vswordViewModeService.test.ts L151-163 已验证的语义）
		assert.strictEqual(h.svc.currentMode.focus, true, 'M-6 · stored focus 保留 raw=on');
		assert.strictEqual(h.svc.currentMode.typewriter, true, 'M-6 · stored typewriter 保留 raw=on');

		h.disposables.dispose();
	});

	// -------------------------------------------------------------------- 边界补充

	test('边界 · M-6 之后 setMode(realtime) 恢复视觉：shell data-focus/tw 回到 on', () => {
		// PRD D-2 隐含约束：source→realtime 切离后 stored 值恢复视觉；
		// 本 case 验证 mode-controller 恢复 shell attrs + service state 依旧 raw=on。
		const h = bootstrap();
		primeInit(h, { mode: 'realtime', focus: 'on', typewriter: 'on' });
		applyAction(h, { setMode: 'source' });
		applyAction(h, { setMode: 'realtime' });

		assertShellAttrs(h.shell, {
			'data-mode': 'realtime', 'data-focus': 'on', 'data-typewriter': 'on',
		}, 'edge-source-exit');
		assertServiceState(h.svc, { mode: 'realtime', focus: true, typewriter: true }, 'edge-source-exit');
		assertContextKeys(h.ctx, { mode: 'realtime', focus: true, typewriter: true }, 'edge-source-exit');

		h.disposables.dispose();
	});
});

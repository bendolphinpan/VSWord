/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.b · VSWord 视图模式命令化
//
// 本卡范围：把 T-3.7b.a 中央状态服务的能力暴露成命令面板可见的 7 条 Action2 + 4 条 keybinding。
// PRD §4.1 / §5 AC-1 / §5 AC-5。
//
//   Action                              快捷键               when
//   -------------------------------------------------------------------------------
//   vsword.viewMode.cycleMode           Ctrl+/               milkdown editor active
//   vsword.viewMode.toggleSource        —                    —（面板可见即可）
//   vsword.viewMode.toggleReading       —                    —
//   vsword.viewMode.setRealtime         Escape               reading || source
//   vsword.viewMode.toggleFocus         Ctrl+Shift+F         milkdown editor active
//   vsword.viewMode.toggleTypewriter    Ctrl+Shift+T         milkdown editor active
//   vsword.viewMode.openAsText          —                    —（TODO stub · 见备注）
//
// 决策记录：
//   1. cycleMode 在 Action 内部读 `service.currentMode.mode` 组合出下一个 mode 再调 setMode()，
//      T-3.7b.a 的 service 接口保持不变（不加 cycleMode()）。
//   2. openAsText Action 已注册，但 body 为 TODO stub —— host 的 openAsText 分支只接受
//      来自 webview postMessage 的活动 MilkdownEditorInput 引用，Action 场景下不易复用；
//      T-3.7b.c/d 与 webview 消息汇总时统一接线。
//   3. `when` 表达式不用 PRD body 里的 `activeEditorId == 'vsword.markdown.milkdown'` ——
//      workbench 框架里 `activeEditor` ContextKey 保存的是 EditorPane 的 id（'WebviewEditor'）
//      而不是 registered editor id。所以本卡自建 `vsword.milkdown.editorActive` ContextKey，
//      靠 VswordMilkdownActiveEditorTracker workbench contribution 在 onDidActiveEditorChange
//      时根据 `input instanceof MilkdownEditorInput` 同步开关。
//   4. keybinding weight = WorkbenchContrib（Ctrl+/ / Ctrl+Shift+F/T）；Escape weight = EditorContrib-10
//      以避开 IME composition 优先级（PRD §4.1）。
//   5. webview 内部 keydown listener 保留不动 —— 属于 webview focus 内主路径，
//      两条 keybinding 通过 when 表达式限死作用域，本身不会与之冲突：
//      webview 拿到 focus 时 keybinding service 不会 dispatch 到 host action。

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { MilkdownEditorInput } from '../milkdownEditorInput.js';
import { VswordMilkdownMode } from '../milkdownEditorProtocol.js';
import { IVSWordViewModeService } from './vswordViewModeService.js';

// ---------------------------------------------------------------------------
// 编辑器活动 ContextKey（when 表达式用）
// ---------------------------------------------------------------------------

/**
 * 当前活跃编辑器是 Milkdown Markdown 编辑器时为 true。
 *
 * 说明：workbench 内建的 `activeEditor` ContextKey 保存的是 EditorPane 的 id
 * （webview 走 'WebviewEditor'），无法直接区分不同 webview-based editor。本键
 * 补齐这条 gap，供 Ctrl+/ / Ctrl+Shift+F/T 三条 keybinding 的 when 表达式使用。
 */
export const VswordMilkdownEditorActiveKey = new RawContextKey<boolean>(
	'vsword.milkdown.editorActive',
	false,
	{ type: 'boolean', description: 'VSWord Milkdown WYSIWYG 编辑器是当前活跃编辑器。' },
);

/**
 * 订阅 IEditorService.onDidActiveEditorChange，把 `vsword.milkdown.editorActive`
 * 的值同步给全局 IContextKeyService。
 */
class VswordMilkdownActiveEditorTracker extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.vsword.milkdownEditorActiveTracker';

	private readonly _ctx: IContextKey<boolean>;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._ctx = VswordMilkdownEditorActiveKey.bindTo(contextKeyService);
		this._register(this.editorService.onDidActiveEditorChange(() => this._sync()));
		this._sync();
	}

	private _sync(): void {
		this._ctx.set(this.editorService.activeEditor instanceof MilkdownEditorInput);
	}
}

registerWorkbenchContribution2(VswordMilkdownActiveEditorTracker.ID, VswordMilkdownActiveEditorTracker, WorkbenchPhase.AfterRestored);

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const VSWORD_VIEWMODE_CATEGORY = localize2('vsword.viewMode.category', 'VSWord 视图模式');

/** 三态循环顺序：realtime → reading → source → realtime。 */
const CYCLE_ORDER: readonly VswordMilkdownMode[] = ['realtime', 'reading', 'source'];

function nextMode(current: VswordMilkdownMode): VswordMilkdownMode {
	const idx = CYCLE_ORDER.indexOf(current);
	if (idx < 0) {
		return 'realtime';
	}
	return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
}

// ContextKey 表达式：milkdown 编辑器活跃时才响应 keybinding
const WHEN_MILKDOWN_ACTIVE = ContextKeyExpr.equals('vsword.milkdown.editorActive', true);

// Escape 快捷键作用域：只在 reading / source 模式下拦截，realtime 下不动 —— 避免
// 影响 webview 内 tooltip/popup 等 Escape 关闭主路径。
const WHEN_ESCAPE_TO_REALTIME = ContextKeyExpr.and(
	WHEN_MILKDOWN_ACTIVE,
	ContextKeyExpr.or(
		ContextKeyExpr.equals('vsword.viewMode.reading', true),
		ContextKeyExpr.equals('vsword.viewMode.source', true),
	)!,
);

// ---------------------------------------------------------------------------
// 7 条 Action2
// ---------------------------------------------------------------------------

/** 循环切换（realtime → reading → source → realtime）· Ctrl+/ */
export class VswordCycleModeAction extends Action2 {
	static readonly ID = 'vsword.viewMode.cycleMode';
	constructor() {
		super({
			id: VswordCycleModeAction.ID,
			title: localize2('vsword.viewMode.cycleMode.title', 'VSWord: 循环切换视图模式（实时 → 阅读 → 源码）'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				when: WHEN_MILKDOWN_ACTIVE,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		const svc = accessor.get(IVSWordViewModeService);
		svc.setMode(nextMode(svc.currentMode.mode));
	}
}

/** 切换源码模式（source ↔ realtime） */
export class VswordToggleSourceAction extends Action2 {
	static readonly ID = 'vsword.viewMode.toggleSource';
	constructor() {
		super({
			id: VswordToggleSourceAction.ID,
			title: localize2('vsword.viewMode.toggleSource.title', 'VSWord: 切换源码模式'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const svc = accessor.get(IVSWordViewModeService);
		svc.setMode(svc.currentMode.mode === 'source' ? 'realtime' : 'source');
	}
}

/** 切换阅读模式（reading ↔ realtime） */
export class VswordToggleReadingAction extends Action2 {
	static readonly ID = 'vsword.viewMode.toggleReading';
	constructor() {
		super({
			id: VswordToggleReadingAction.ID,
			title: localize2('vsword.viewMode.toggleReading.title', 'VSWord: 切换阅读模式'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		const svc = accessor.get(IVSWordViewModeService);
		svc.setMode(svc.currentMode.mode === 'reading' ? 'realtime' : 'reading');
	}
}

/** 回到实时渲染 · Escape（仅在 reading/source 下有效） */
export class VswordSetRealtimeAction extends Action2 {
	static readonly ID = 'vsword.viewMode.setRealtime';
	constructor() {
		super({
			id: VswordSetRealtimeAction.ID,
			title: localize2('vsword.viewMode.setRealtime.title', 'VSWord: 回到实时渲染'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
			keybinding: {
				// Escape 与 IME composition / suggest widget 等抢路径，故降到 EditorContrib - 10；
				// when 表达式再限死 reading/source，realtime 下 Escape 完全不被本 Action 吃掉。
				weight: KeybindingWeight.EditorContrib - 10,
				primary: KeyCode.Escape,
				when: WHEN_ESCAPE_TO_REALTIME,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IVSWordViewModeService).setMode('realtime');
	}
}

/** 切换专注模式 · Ctrl+Shift+F */
export class VswordToggleFocusAction extends Action2 {
	static readonly ID = 'vsword.viewMode.toggleFocus';
	constructor() {
		super({
			id: VswordToggleFocusAction.ID,
			title: localize2('vsword.viewMode.toggleFocus.title', 'VSWord: 切换专注模式'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
				when: WHEN_MILKDOWN_ACTIVE,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IVSWordViewModeService).toggleFocus();
	}
}

/** 切换打字机模式 · Ctrl+Shift+T */
export class VswordToggleTypewriterAction extends Action2 {
	static readonly ID = 'vsword.viewMode.toggleTypewriter';
	constructor() {
		super({
			id: VswordToggleTypewriterAction.ID,
			title: localize2('vsword.viewMode.toggleTypewriter.title', 'VSWord: 切换打字机模式'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT,
				when: WHEN_MILKDOWN_ACTIVE,
			},
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IVSWordViewModeService).toggleTypewriter();
	}
}

/**
 * 用文本编辑器打开当前 Milkdown 文档。
 *
 * TODO(T-3.7b.c/d)：目前 host 侧 openAsText 只处理 webview → host 的 'openAsText'
 * 消息，走 MilkdownEditorContribution.openAsText(input) 并用该 input 携带的 group。
 * Action 场景下要复用同一通道需要在 contribution 上再暴露一个入口方法（例如
 * openAsTextForActiveMilkdown()）；这属于跨模块接线，留到 T-3.7b.c 与 c 卡的
 * editable/reading 切换一起做。当前 Action 只作命令面板占位 + log warn，不阻塞
 * Ctrl+/ 主路径。定位坐标：
 *   `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/
 *    milkdownEditorContribution.ts` :409 `private async openAsText(input)`。
 */
export class VswordOpenAsTextAction extends Action2 {
	static readonly ID = 'vsword.viewMode.openAsText';
	constructor() {
		super({
			id: VswordOpenAsTextAction.ID,
			title: localize2('vsword.viewMode.openAsText.title', 'VSWord: 用文本编辑器打开当前文件'),
			category: VSWORD_VIEWMODE_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(ILogService).warn(
			// TODO(T-3.7b.c/d): 接线活动 MilkdownEditorInput 走 host 侧 openAsText 通道。
			localize(
				'vsword.viewMode.openAsText.stub',
				'[VSWord ViewMode] openAsText Action stub —— 请通过编辑器右上角菜单或 webview 快捷键触发。',
			),
		);
	}
}

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------

registerAction2(VswordCycleModeAction);
registerAction2(VswordToggleSourceAction);
registerAction2(VswordToggleReadingAction);
registerAction2(VswordSetRealtimeAction);
registerAction2(VswordToggleFocusAction);
registerAction2(VswordToggleTypewriterAction);
registerAction2(VswordOpenAsTextAction);

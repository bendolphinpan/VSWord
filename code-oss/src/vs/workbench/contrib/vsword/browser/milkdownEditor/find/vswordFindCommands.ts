/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.c2 · VSWord 查找/替换 host 侧命令
//
// 三条 Action2（命令面板可见 f1:true）：
//   vsword.find.open           → service.setState({open:true})  + webview post 'find.open'
//   vsword.find.replace.open   → service.setState({open:true})  + webview post 'find.replace.open'
//   vsword.find.close          → service.setState({open:false}) + webview post 'find.close'
//
// 决策（对齐 c2 卡 body §3 无方向决策一律走默认 a）：
//   - 不加 precondition（先能跑，收窄留 c3/d）
//   - 无 keybinding（webview 内 find-keymap 已拦 Ctrl+F/H/Esc；host 层命令主要给
//     命令面板 / 后续 UI Reveal 消费）
//   - 命令走 IEditorService 找到活跃的 MilkdownEditorInput 才 postMessage；
//     非 Milkdown 活跃 → 静默 no-op（保持与 formatDocument 一致语义）
//   - service.setState 永远调用（即使没有活跃 milkdown 编辑器）—— host 侧
//     镜像状态由 webview stateChanged 回调最终收敛，命令这一次「open=true/false」
//     的乐观写入只是为了让命令面板等消费方有一个即时快照
//
// 参考：
//   `browser/milkdownEditor/milkdownEditorContribution.ts` :169-224 三条命令的模板

import { localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { MilkdownEditorInput } from '../milkdownEditorInput.js';
import {
	IVSWordFindService,
	VSWORD_FIND_CLOSE_ACTION_ID,
	VSWORD_FIND_OPEN_ACTION_ID,
	VSWORD_FIND_REPLACE_OPEN_ACTION_ID,
} from '../../../common/vswordFindService.js';

const VSWORD_FIND_CATEGORY = localize2('vsword.find.category', 'VSWord 查找');

/**
 * 找到当前活跃的 MilkdownEditorInput；若不是则返回 null。命令共用一段 guard，
 * 保持与 formatDocument / tocInsert 命令一致的活跃判定。
 */
function findActiveMilkdown(accessor: ServicesAccessor): MilkdownEditorInput | null {
	const editorSvc = accessor.get(IEditorService);
	const active = editorSvc.activeEditor;
	return active instanceof MilkdownEditorInput ? active : null;
}

/** 打开查找 widget（不展开替换栏）。 */
export class VswordFindOpenAction extends Action2 {
	static readonly ID = VSWORD_FIND_OPEN_ACTION_ID;
	constructor() {
		super({
			id: VswordFindOpenAction.ID,
			title: localize2('vsword.find.open.title', 'VSWord: 打开查找'),
			category: VSWORD_FIND_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IVSWordFindService).setState({ open: true });
		const active = findActiveMilkdown(accessor);
		if (active) {
			try { active.webview.postMessage({ type: 'find.open' }); } catch { /* webview 已 dispose */ }
		}
	}
}

/** 打开查找 widget 并展开替换栏。 */
export class VswordFindReplaceOpenAction extends Action2 {
	static readonly ID = VSWORD_FIND_REPLACE_OPEN_ACTION_ID;
	constructor() {
		super({
			id: VswordFindReplaceOpenAction.ID,
			title: localize2('vsword.find.replace.open.title', 'VSWord: 打开查找并展开替换'),
			category: VSWORD_FIND_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IVSWordFindService).setState({ open: true });
		const active = findActiveMilkdown(accessor);
		if (active) {
			try { active.webview.postMessage({ type: 'find.replace.open' }); } catch { /* webview 已 dispose */ }
		}
	}
}

/** 关闭查找 widget。 */
export class VswordFindCloseAction extends Action2 {
	static readonly ID = VSWORD_FIND_CLOSE_ACTION_ID;
	constructor() {
		super({
			id: VswordFindCloseAction.ID,
			title: localize2('vsword.find.close.title', 'VSWord: 关闭查找'),
			category: VSWORD_FIND_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(IVSWordFindService).setState({ open: false });
		const active = findActiveMilkdown(accessor);
		if (active) {
			try { active.webview.postMessage({ type: 'find.close' }); } catch { /* webview 已 dispose */ }
		}
	}
}

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------

registerAction2(VswordFindOpenAction);
registerAction2(VswordFindReplaceOpenAction);
registerAction2(VswordFindCloseAction);

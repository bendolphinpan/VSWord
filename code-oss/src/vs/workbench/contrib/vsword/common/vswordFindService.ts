/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.c2 · IVSWordFindService
//
// VSWord Milkdown 编辑器 find/replace 状态的中央镜像。webview 侧持有真源
// state（find-widget 的 closure），本 service 只做 host 侧只读镜像 —— 让 host
// 侧命令 / UI Reveal / 多 editor 共享能拿到当前查找状态。
//
// 本卡范围仅：interface + FindState + service decorator（common 层）。
// 实现类 / registerSingleton / 命令 / protocol 广播见同任务 browser 侧文件。
//
// 决策（对齐 c 卡 body §3 无方向决策一律走默认 a）：
//   - state 用 readonly，setState 走部分更新（Partial）
//   - onDidChangeState 每次 setState 调用即 fire（不做 shallow-equal 判等 ——
//     本 service 只做「桥」，判等留给消费者）
//   - matchCount / activeIndex 都是 number 且非负；activeIndex 允许 -1（无匹配）
//   - 命名与 c2 卡 body 一致：`IVSWordFindService` / `FindState`
//   - decorator id `vswordFindService`（与 viewMode 平行）
//
// 参考：`common/vswordFindService.ts`（本文件）+
//       `browser/milkdownEditor/find/vswordFindService.ts`（实现类）+
//       `browser/milkdownEditor/find/vswordFindService.contribution.ts`（registerSingleton）+
//       `browser/milkdownEditor/find/vswordFindCommands.ts`（3 条 Action2）

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * host 侧的 find/replace 状态快照。
 *
 * 语义：这是 **webview 侧真源** 的只读镜像。webview 每次 find state 变化会通过
 * `find.stateChanged` 消息上报，host 用 `setState(partial)` 把变化 fold 进来。
 */
export interface FindState {
	/** widget 是否可见（webview 侧 open()/close() 决定）。 */
	readonly open: boolean;
	/** 查找输入框当前内容。 */
	readonly query: string;
	/** 替换输入框当前内容。 */
	readonly replaceQuery: string;
	/** 区分大小写。 */
	readonly caseSensitive: boolean;
	/** 全字匹配。 */
	readonly wholeWord: boolean;
	/** 正则模式。 */
	readonly regex: boolean;
	/** 当前 doc 内匹配总数。 */
	readonly matchCount: number;
	/**
	 * 当前高亮匹配的 0-based 索引；-1 表示无匹配。
	 * 与 webview 的 `state.activeIndex` 语义一致。
	 */
	readonly activeIndex: number;
}

/** FindState 全字段默认值。任何字段缺省都用这里的兜底。 */
export const VSWORD_FIND_DEFAULT_STATE: FindState = Object.freeze({
	open: false,
	query: '',
	replaceQuery: '',
	caseSensitive: false,
	wholeWord: false,
	regex: false,
	matchCount: 0,
	activeIndex: -1,
});

export interface IVSWordFindService {
	readonly _serviceBrand: undefined;

	/** 当前 host 侧镜像。始终返回稳定引用（setState 内部会重新构造一个新对象）。 */
	readonly state: FindState;

	/** 状态变化时 fire —— 每次 setState 一次（不做 shallow equal 判等）。 */
	readonly onDidChangeState: Event<FindState>;

	/**
	 * 部分更新 state。未提供的字段保持不变；提供的字段会覆盖。
	 * 内部会 `{ ...current, ...partial }` 生成新对象，随后 fire onDidChangeState。
	 */
	setState(partial: Partial<FindState>): void;
}

export const IVSWordFindService = createDecorator<IVSWordFindService>('vswordFindService');

// ---------------------------------------------------------------------------
// 命令 ID（Action2 注册用；同时供命令面板 when / keybinding 消费）
// ---------------------------------------------------------------------------

export const VSWORD_FIND_OPEN_ACTION_ID = 'vsword.find.open';
export const VSWORD_FIND_REPLACE_OPEN_ACTION_ID = 'vsword.find.replace.open';
export const VSWORD_FIND_CLOSE_ACTION_ID = 'vsword.find.close';

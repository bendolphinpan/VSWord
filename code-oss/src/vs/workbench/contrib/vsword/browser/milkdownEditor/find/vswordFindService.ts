/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.c2 · VSWordFindService 实现
//
// 挂载点跟 viewMode service 平行：`browser/milkdownEditor/find/`。
// InstantiationType 用 Delayed（与 viewMode 一致 —— 首启不阻塞 workbench）。

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import {
	FindState,
	IVSWordFindService,
	VSWORD_FIND_DEFAULT_STATE,
} from '../../../common/vswordFindService.js';

export class VSWordFindService extends Disposable implements IVSWordFindService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<FindState>());
	readonly onDidChangeState: Event<FindState> = this._onDidChangeState.event;

	private _state: FindState = VSWORD_FIND_DEFAULT_STATE;
	private _disposed = false;

	get state(): FindState {
		return this._state;
	}

	setState(partial: Partial<FindState>): void {
		if (this._disposed) {
			return;
		}
		if (!partial || typeof partial !== 'object') {
			return;
		}
		// 保守起见，把 partial 里的每个字段单独抽出来 —— 防止 caller 传 undefined
		// 覆盖已有值（Partial + `{...a, ...b}` 语义会把 undefined 也写进去）。
		const next: FindState = {
			open: partial.open ?? this._state.open,
			query: partial.query ?? this._state.query,
			replaceQuery: partial.replaceQuery ?? this._state.replaceQuery,
			caseSensitive: partial.caseSensitive ?? this._state.caseSensitive,
			wholeWord: partial.wholeWord ?? this._state.wholeWord,
			regex: partial.regex ?? this._state.regex,
			matchCount: partial.matchCount ?? this._state.matchCount,
			activeIndex: partial.activeIndex ?? this._state.activeIndex,
		};
		this._state = next;
		this._onDidChangeState.fire(next);
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}
}

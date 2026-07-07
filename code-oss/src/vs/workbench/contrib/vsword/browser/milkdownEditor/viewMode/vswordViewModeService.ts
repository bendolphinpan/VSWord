/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.a · IVSWordViewModeService
//
// VSWord Milkdown 编辑器视图模式的中央状态服务，负责：
//   1. 三态互斥的 mode（realtime / reading / source，默认 realtime）
//   2. 两个独立可叠加的 toggle（focus / typewriter，默认 off）
//   3. 5 个 ContextKey 与内存状态同步（供 UI when 表达式消费）
//   4. onDidChangeMode 事件，只在任一字段真变化时 fire
//
// 本卡（a 卡）范围仅限内存态 + ContextKey 同步 + 事件广播；
//   - 持久化（storage）由后续卡 b/e 接管（PRD 附录 B · D-6 · 视觉延后）
//   - 命令化 / 快捷键 / webview 广播 由后续卡 b/c/d 接管
//
// 决策记录（对齐卡片 body §预算自救 · 无方向性决策全走默认）：
//   - InstantiationType.Delayed（首启不阻塞 workbench）
//   - setMode / toggleFocus / toggleTypewriter：同步 void
//   - fire 顺序：先更新内存 state，再刷 ContextKey，最后 fire event
//   - dispose 顺序：ContextKey.reset() → emitter.dispose()（由 Disposable 基类 register 统一处理）
//   - setMode('source' | 'reading') 时不动 focus / typewriter 的 raw 值（PRD §3 · M-6 stored 保留）

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import {
	VSWORD_MILKDOWN_DEFAULT_MODE,
	VSWORD_MILKDOWN_MODES,
	VswordMilkdownMode,
} from '../milkdownEditorProtocol.js';
import {
	VswordViewModeFocusKey,
	VswordViewModeReadingKey,
	VswordViewModeRealtimeKey,
	VswordViewModeSourceKey,
	VswordViewModeTypewriterKey,
} from './viewModeContextKeys.js';

/** 视图模式的完整只读快照。 */
export interface IViewModeState {
	readonly mode: VswordMilkdownMode;
	readonly focus: boolean;
	readonly typewriter: boolean;
}

/** onDidChangeMode 事件负载：给消费者 prev/next 快照 + 变化字段清单。 */
export type ViewModeChangedField = 'mode' | 'focus' | 'typewriter';

export interface IViewModeChangeEvent {
	readonly prev: IViewModeState;
	readonly next: IViewModeState;
	readonly changed: readonly ViewModeChangedField[];
}

export interface IVSWordViewModeService {
	readonly _serviceBrand: undefined;

	/** 当前完整快照。每次调用返回新对象，调用方可以安全存引用。 */
	readonly currentMode: IViewModeState;

	/** 三态之一切换。若与当前 mode 相同则视为 no-op，不 fire。 */
	setMode(mode: VswordMilkdownMode): void;

	/** 翻转 focus 开关。 */
	toggleFocus(): void;

	/** 翻转 typewriter 开关。 */
	toggleTypewriter(): void;

	/** 状态真变化时 fire（changed 数组非空）。 */
	readonly onDidChangeMode: Event<IViewModeChangeEvent>;
}

export const IVSWordViewModeService = createDecorator<IVSWordViewModeService>('vswordViewModeService');

/**
 * 默认实现。纯内存态，无 storage / webview 广播（那些是后续卡的职责）。
 */
export class VSWordViewModeService extends Disposable implements IVSWordViewModeService {
	declare readonly _serviceBrand: undefined;

	private _mode: VswordMilkdownMode = VSWORD_MILKDOWN_DEFAULT_MODE;
	private _focus = false;
	private _typewriter = false;

	private readonly _onDidChangeMode = this._register(new Emitter<IViewModeChangeEvent>());
	readonly onDidChangeMode: Event<IViewModeChangeEvent> = this._onDidChangeMode.event;

	private readonly _ctxRealtime: IContextKey<boolean>;
	private readonly _ctxReading: IContextKey<boolean>;
	private readonly _ctxSource: IContextKey<boolean>;
	private readonly _ctxFocus: IContextKey<boolean>;
	private readonly _ctxTypewriter: IContextKey<boolean>;

	private _disposed = false;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._ctxRealtime = VswordViewModeRealtimeKey.bindTo(contextKeyService);
		this._ctxReading = VswordViewModeReadingKey.bindTo(contextKeyService);
		this._ctxSource = VswordViewModeSourceKey.bindTo(contextKeyService);
		this._ctxFocus = VswordViewModeFocusKey.bindTo(contextKeyService);
		this._ctxTypewriter = VswordViewModeTypewriterKey.bindTo(contextKeyService);

		// dispose 时把 5 个 ContextKey 复位（reset() 回落到 RawContextKey 声明的默认值）
		this._register({
			dispose: () => {
				this._ctxRealtime.reset();
				this._ctxReading.reset();
				this._ctxSource.reset();
				this._ctxFocus.reset();
				this._ctxTypewriter.reset();
			}
		});

		// 首次同步 ContextKey 与默认内存态
		this._syncContextKeys();
	}

	get currentMode(): IViewModeState {
		return { mode: this._mode, focus: this._focus, typewriter: this._typewriter };
	}

	setMode(mode: VswordMilkdownMode): void {
		if (this._disposed) {
			return;
		}
		if (!(VSWORD_MILKDOWN_MODES as readonly string[]).includes(mode)) {
			return;
		}
		if (mode === this._mode) {
			return;
		}
		const prev = this.currentMode;
		this._mode = mode;
		this._syncContextKeys();
		this._fireIfChanged(prev);
	}

	toggleFocus(): void {
		if (this._disposed) {
			return;
		}
		const prev = this.currentMode;
		this._focus = !this._focus;
		this._syncContextKeys();
		this._fireIfChanged(prev);
	}

	toggleTypewriter(): void {
		if (this._disposed) {
			return;
		}
		const prev = this.currentMode;
		this._typewriter = !this._typewriter;
		this._syncContextKeys();
		this._fireIfChanged(prev);
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}

	// ------------------------------------------------------------------ private

	private _syncContextKeys(): void {
		this._ctxRealtime.set(this._mode === 'realtime');
		this._ctxReading.set(this._mode === 'reading');
		this._ctxSource.set(this._mode === 'source');
		this._ctxFocus.set(this._focus);
		this._ctxTypewriter.set(this._typewriter);
	}

	private _fireIfChanged(prev: IViewModeState): void {
		const next = this.currentMode;
		const changed: ViewModeChangedField[] = [];
		if (prev.mode !== next.mode) {
			changed.push('mode');
		}
		if (prev.focus !== next.focus) {
			changed.push('focus');
		}
		if (prev.typewriter !== next.typewriter) {
			changed.push('typewriter');
		}
		if (changed.length === 0) {
			return;
		}
		this._onDidChangeMode.fire({ prev, next, changed });
	}
}

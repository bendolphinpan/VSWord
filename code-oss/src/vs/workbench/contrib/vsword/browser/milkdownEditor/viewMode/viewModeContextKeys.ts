/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.a · VSWord 视图模式 ContextKey 声明
//
// 5 个 boolean ContextKey，供 UI 层 `when` 表达式使用：
//   - vsword.viewMode.realtime   实时渲染模式激活
//   - vsword.viewMode.reading    阅读模式激活
//   - vsword.viewMode.source     源码模式激活
//   - vsword.viewMode.focus      专注模式开关（可与 mode 叠加）
//   - vsword.viewMode.typewriter 打字机模式开关（可与 mode 叠加）
//
// realtime / reading / source 三者互斥，任意时刻仅一个为 true。
// focus / typewriter 独立于 mode，可任意组合；在 source 模式下 UI 层需要
// 自行组合 `vsword.viewMode.source && vsword.viewMode.focus` 才能激活装饰，
// 本层 ContextKey 只反映内存 raw 值。

import { RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';

/** 实时渲染（WYSIWYG）模式激活。 */
export const VswordViewModeRealtimeKey = new RawContextKey<boolean>(
	'vsword.viewMode.realtime',
	true,
	{ type: 'boolean', description: 'VSWord Milkdown 编辑器处于实时渲染（WYSIWYG）模式。' },
);

/** 阅读（只读预览）模式激活。 */
export const VswordViewModeReadingKey = new RawContextKey<boolean>(
	'vsword.viewMode.reading',
	false,
	{ type: 'boolean', description: 'VSWord Milkdown 编辑器处于阅读（只读预览）模式。' },
);

/** 源码（textarea 直编）模式激活。 */
export const VswordViewModeSourceKey = new RawContextKey<boolean>(
	'vsword.viewMode.source',
	false,
	{ type: 'boolean', description: 'VSWord Milkdown 编辑器处于源码（textarea）模式。' },
);

/** 专注模式开关（非活动段落淡化）。可与任意 mode 叠加。 */
export const VswordViewModeFocusKey = new RawContextKey<boolean>(
	'vsword.viewMode.focus',
	false,
	{ type: 'boolean', description: 'VSWord Milkdown 编辑器的专注模式开关状态。' },
);

/** 打字机模式开关（当前行居中）。可与任意 mode 叠加。 */
export const VswordViewModeTypewriterKey = new RawContextKey<boolean>(
	'vsword.viewMode.typewriter',
	false,
	{ type: 'boolean', description: 'VSWord Milkdown 编辑器的打字机模式开关状态。' },
);

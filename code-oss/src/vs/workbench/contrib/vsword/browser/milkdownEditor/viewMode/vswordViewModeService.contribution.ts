/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7b.a · IVSWordViewModeService 的 singleton 注册（effects-only import）
//
// 走 InstantiationType.Delayed —— 第一次 `accessor.get(IVSWordViewModeService)`
// 才实例化。首启不阻塞 workbench，与 PRD 附录 B · D-6 视觉延后策略一致。
//
// 消费方式：任何 workbench contribution / Action2 只要 `@IVSWordViewModeService`
// 注入即可。本卡（a 卡）不接线 command / keybinding / webview 广播；那些是
// T-3.7b.b / c / d 后续卡的职责。

import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IVSWordViewModeService, VSWordViewModeService } from './vswordViewModeService.js';

registerSingleton(IVSWordViewModeService, VSWordViewModeService, InstantiationType.Delayed);

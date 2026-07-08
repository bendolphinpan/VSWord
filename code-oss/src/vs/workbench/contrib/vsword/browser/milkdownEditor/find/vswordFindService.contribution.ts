/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// T-3.7c.3.c2 · IVSWordFindService 的 singleton 注册（effects-only import）
//
// 走 InstantiationType.Delayed —— 第一次 `accessor.get(IVSWordFindService)`
// 才实例化。与 viewMode service 一致。

import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { IVSWordFindService } from '../../../common/vswordFindService.js';
import { VSWordFindService } from './vswordFindService.js';

registerSingleton(IVSWordFindService, VSWordFindService, InstantiationType.Delayed);

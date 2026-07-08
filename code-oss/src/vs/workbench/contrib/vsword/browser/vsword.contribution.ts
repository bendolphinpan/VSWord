/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { VswordWorkbenchShellContribution } from './vswordHomeView.js';
import { VswordWordCountContribution } from './vswordWordCount.js';
import { VswordMindmapAutoOpenContribution } from './vswordMindmapAutoOpen.js';
import { VswordMilkdownEditorContribution } from './milkdownEditor/milkdownEditorContribution.js';
import { VswordMilkdownThemeStatusContribution } from './milkdownEditor/vswordMilkdownThemeStatus.js';

// Effects-only imports. Each sub-module is responsible for its own registration.
import './vswordHelloAction.js';
import './vswordActions.js';
import './vswordMindmapAction.js';
import './spikes/reactflow/reactFlowCanvasAction.js';
// Writer-mode defaults: register on import (no DI needed).
import './vswordWriterModeDefaults.js';
// T-3.3.1: register vsword.theme.* configuration schema + `VSWord: Select Markdown Theme` command.
import './milkdownEditor/milkdownEditorThemeRegistrations.js';
// T-3.4: register Outline creator so the built-in Outline pane populates for VSWord Markdown editors.
import './milkdownEditor/milkdownEditorOutline.js';
// T-3.7b.a: register IVSWordViewModeService singleton (视图模式中央状态服务 · ContextKey 5 项)
import './milkdownEditor/viewMode/vswordViewModeService.contribution.js';
// T-3.7b.b: register 7 Action2 + 4 keybindings + milkdown editor active tracker
import './milkdownEditor/viewMode/vswordViewModeActions.js';
// T-3.7c.3.c2: register IVSWordFindService singleton (find/replace host 镜像) + 3 条 Action2
import './milkdownEditor/find/vswordFindService.contribution.js';
import './milkdownEditor/find/vswordFindCommands.js';
// T-3.8b.1.b: register `Export as HTML` Action2 + host-side SaveAs / writeFile 通道
import './milkdownEditor/exportContribution.js';

registerWorkbenchContribution2(VswordWorkbenchShellContribution.ID, VswordWorkbenchShellContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(VswordWordCountContribution.ID, VswordWordCountContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(VswordMindmapAutoOpenContribution.ID, VswordMindmapAutoOpenContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(VswordMilkdownEditorContribution.ID, VswordMilkdownEditorContribution, WorkbenchPhase.BlockStartup);
// T-3.7d.3 · 状态栏 item：仅在 Milkdown editor 激活时展示，命令入口 vsword.selectMarkdownTheme
registerWorkbenchContribution2(VswordMilkdownThemeStatusContribution.ID, VswordMilkdownThemeStatusContribution, WorkbenchPhase.AfterRestored);

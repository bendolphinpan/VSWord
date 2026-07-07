/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { VswordWorkbenchShellContribution } from './vswordHomeView.js';
import { VswordWordCountContribution } from './vswordWordCount.js';
import { VswordMindmapAutoOpenContribution } from './vswordMindmapAutoOpen.js';
import { VswordMilkdownEditorContribution } from './milkdownEditor/milkdownEditorContribution.js';

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

registerWorkbenchContribution2(VswordWorkbenchShellContribution.ID, VswordWorkbenchShellContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(VswordWordCountContribution.ID, VswordWordCountContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(VswordMindmapAutoOpenContribution.ID, VswordMindmapAutoOpenContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(VswordMilkdownEditorContribution.ID, VswordMilkdownEditorContribution, WorkbenchPhase.BlockStartup);

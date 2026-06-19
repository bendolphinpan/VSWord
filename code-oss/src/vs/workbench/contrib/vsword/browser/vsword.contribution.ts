/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { VswordWorkbenchShellContribution } from './vswordHomeView.js';

// Effects-only imports. Each sub-module is responsible for its own registration.
import './vswordHelloAction.js';

registerWorkbenchContribution2(VswordWorkbenchShellContribution.ID, VswordWorkbenchShellContribution, WorkbenchPhase.AfterRestored);

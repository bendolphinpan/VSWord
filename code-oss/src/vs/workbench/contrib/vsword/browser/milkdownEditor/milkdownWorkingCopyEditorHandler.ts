/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hot-exit / backup 恢复：WorkingCopy typeId = vsword.markdown.milkdown 时，
 * 必须用 Milkdown 页签打开，而不是落到默认文本编辑器。
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IWorkingCopyIdentifier } from '../../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../../../services/workingCopy/common/workingCopyEditorService.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { createMilkdownEditorInput } from './milkdownEditorFactory.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import { VSWORD_MILKDOWN_WORKING_COPY_TYPE_ID } from './milkdownEditorProtocol.js';

export class MilkdownWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.vsword.milkdownWorkingCopyEditorHandler';

	constructor(
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWebviewService private readonly webviewService: IWebviewService,
	) {
		super();
		this._register(workingCopyEditorService.registerHandler(this));
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean {
		return workingCopy.typeId === VSWORD_MILKDOWN_WORKING_COPY_TYPE_ID;
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}
		return editor instanceof MilkdownEditorInput && isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		return createMilkdownEditorInput(this.instantiationService, this.webviewService, workingCopy.resource);
	}
}

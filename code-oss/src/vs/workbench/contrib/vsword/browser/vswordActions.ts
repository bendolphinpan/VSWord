/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { createUntitledMarkdownResource } from '../common/vswordMarkdown.js';
import { VSWORD_HOME_VIEW_ID } from './vswordHomeView.js';

const VSWORD_CATEGORY = localize2('vsword', 'VSWord');

class VswordOpenHomeAction extends Action2 {
	static readonly ID = 'vsword.actions.openHome';

	constructor() {
		super({
			id: VswordOpenHomeAction.ID,
			title: localize2('vsword.home.open', 'VSWord: Open Home'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IViewsService).openView(VSWORD_HOME_VIEW_ID, true);
	}
}

class VswordNewMarkdownDocumentAction extends Action2 {
	static readonly ID = 'vsword.actions.newMarkdown';

	constructor() {
		super({
			id: VswordNewMarkdownDocumentAction.ID,
			title: localize2('vsword.markdown.newDocument', 'VSWord: New Markdown Document'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IEditorService).openEditor({
			resource: createUntitledMarkdownResource(),
			languageId: 'markdown',
			options: { pinned: true }
		});
	}
}

registerAction2(VswordOpenHomeAction);
registerAction2(VswordNewMarkdownDocumentAction);

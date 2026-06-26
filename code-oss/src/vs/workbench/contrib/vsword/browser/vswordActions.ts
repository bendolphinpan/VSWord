/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { createUntitledMarkdownResource } from '../common/vswordMarkdown.js';
import { parseFrontmatter, parseMarkdownTagsInput, updateMarkdownFrontmatter } from '../common/vswordDocumentUtils.js';
import { VSWORD_HOME_VIEW_ID } from './vswordHomeView.js';

const VSWORD_CATEGORY = localize2('vsword', 'VSWord');

function getActiveMarkdownModel(accessor: ServicesAccessor): ReturnType<NonNullable<ReturnType<typeof getCodeEditor>>['getModel']> | undefined {
	const editorService = accessor.get(IEditorService);
	const codeEditor = getCodeEditor(editorService.activeTextEditorControl);
	const model = codeEditor?.getModel();
	return model?.getLanguageId() === 'markdown' ? model : undefined;
}

async function runActiveMarkdownCommand(accessor: ServicesAccessor, commandId: string): Promise<void> {
	const notificationService = accessor.get(INotificationService);
	if (!getActiveMarkdownModel(accessor)) {
		notificationService.info(localize('vsword.markdown.noActiveMarkdownEditor', 'Open a Markdown document before using this VSWord Markdown command.'));
		return;
	}
	await accessor.get(ICommandService).executeCommand(commandId);
}

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

class VswordShowMarkdownPreviewAction extends Action2 {
	static readonly ID = 'vsword.actions.showMarkdownPreview';

	constructor() {
		super({
			id: VswordShowMarkdownPreviewAction.ID,
			title: localize2('vsword.markdown.showPreview', 'VSWord: Show Markdown Preview'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await runActiveMarkdownCommand(accessor, 'markdown.showPreview');
	}
}

class VswordShowMarkdownPreviewToSideAction extends Action2 {
	static readonly ID = 'vsword.actions.showMarkdownPreviewToSide';

	constructor() {
		super({
			id: VswordShowMarkdownPreviewToSideAction.ID,
			title: localize2('vsword.markdown.showPreviewToSide', 'VSWord: Show Markdown Preview to Side'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await runActiveMarkdownCommand(accessor, 'markdown.showPreviewToSide');
	}
}

class VswordShowMarkdownSourceAction extends Action2 {
	static readonly ID = 'vsword.actions.showMarkdownSource';

	constructor() {
		super({
			id: VswordShowMarkdownSourceAction.ID,
			title: localize2('vsword.markdown.showSource', 'VSWord: Show Markdown Source'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand('markdown.reopenAsSource');
	}
}

class VswordUpdateMarkdownMetadataAction extends Action2 {
	static readonly ID = 'vsword.actions.updateMarkdownMetadata';

	constructor() {
		super({
			id: VswordUpdateMarkdownMetadataAction.ID,
			title: localize2('vsword.markdown.updateMetadata', 'VSWord: Update Markdown Metadata'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);
		const codeEditor = getCodeEditor(editorService.activeTextEditorControl);
		const model = codeEditor?.getModel();
		if (!codeEditor || !model) {
			notificationService.info(localize('vsword.metadata.noActiveEditor', 'No active text editor.'));
			return;
		}
		if (model.getLanguageId() !== 'markdown') {
			notificationService.info(localize('vsword.metadata.notMarkdown', 'Open a Markdown document before updating VSWord metadata.'));
			return;
		}

		const text = model.getValue();
		const current = parseFrontmatter(text).known;
		const title = await quickInputService.input({
			title: localize('vsword.metadata.titleInputTitle', 'VSWord Markdown Metadata'),
			prompt: localize('vsword.metadata.titleInputPrompt', 'Title'),
			value: current.title ?? ''
		});
		if (title === undefined) {
			return;
		}
		const status = await quickInputService.input({
			title: localize('vsword.metadata.statusInputTitle', 'VSWord Markdown Metadata'),
			prompt: localize('vsword.metadata.statusInputPrompt', 'Status'),
			value: current.status ?? ''
		});
		if (status === undefined) {
			return;
		}
		const tagsInput = await quickInputService.input({
			title: localize('vsword.metadata.tagsInputTitle', 'VSWord Markdown Metadata'),
			prompt: localize('vsword.metadata.tagsInputPrompt', 'Tags, comma separated'),
			value: current.tags?.join(', ') ?? ''
		});
		if (tagsInput === undefined) {
			return;
		}

		const updated = updateMarkdownFrontmatter(text, {
			title: title.trim() || undefined,
			status: status.trim() || undefined,
			tags: parseMarkdownTagsInput(tagsInput)
		});
		if (updated === text) {
			notificationService.info(localize('vsword.metadata.noChanges', 'VSWord metadata is unchanged.'));
			return;
		}

		const selection = codeEditor.getSelection();
		const success = codeEditor.executeEdits(VswordUpdateMarkdownMetadataAction.ID, [{ range: model.getFullModelRange(), text: updated }], selection ? [selection] : undefined);
		if (!success) {
			notificationService.error(localize('vsword.metadata.updateFailed', 'Failed to update VSWord metadata.'));
			return;
		}
		notificationService.info(localize('vsword.metadata.updated', 'VSWord metadata updated.'));
	}
}

registerAction2(VswordOpenHomeAction);
registerAction2(VswordNewMarkdownDocumentAction);
registerAction2(VswordShowMarkdownPreviewAction);
registerAction2(VswordShowMarkdownPreviewToSideAction);
registerAction2(VswordShowMarkdownSourceAction);
registerAction2(VswordUpdateMarkdownMetadataAction);

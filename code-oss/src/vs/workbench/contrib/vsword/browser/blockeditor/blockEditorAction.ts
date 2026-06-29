/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWebviewWorkbenchService } from '../../../webviewPanel/browser/webviewWorkbenchService.js';
import { getBlockEditorHtml } from './blockEditorHtml.js';

const BLOCK_EDITOR_VIEW_TYPE_PREFIX = 'vsword.blockEditor';
const VSWORD_CATEGORY = localize2('vsword', 'VSWord');

function getBlockEditorViewType(fileUri: URI): string {
	return BLOCK_EDITOR_VIEW_TYPE_PREFIX + ':' + fileUri.toString();
}

function getBlockEditorResources() {
	const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/blockeditor/vendor');
	const scriptUri = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/blockeditor/vendor/index.js');
	const styleUri = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/blockeditor/vendor/index.css');
	return { vendorRoot, scriptUri, styleUri };
}

/**
 * Manages one Block Editor webview instance bound to a Markdown file URI.
 */
class BlockEditorManager extends Disposable {

	constructor(
		private readonly fileUri: URI,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async openBlockEditor(): Promise<void> {
		const viewType = getBlockEditorViewType(this.fileUri);
		const title = '📝 ' + basename(this.fileUri);
		const { vendorRoot, scriptUri, styleUri } = getBlockEditorResources();

		// Reveal if already open
		for (const editor of this.editorService.editors) {
			if ((editor as any).viewType === viewType) {
				await this.editorService.openEditor(editor, { pinned: true });
				return;
			}
		}

		const input = this.webviewWorkbenchService.openWebview(
			{
				providedViewType: viewType,
				extension: undefined,
				origin: 'vsword-blockeditor',
				title,
				options: { enableFindWidget: true, retainContextWhenHidden: true },
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [vendorRoot, this.fileUri],
				},
			},
			viewType,
			title,
			undefined,
			{ preserveFocus: false }
		);

		this.attach(input, scriptUri, styleUri, vendorRoot);
	}

	private attach(input: any, scriptUri: URI, styleUri: URI, vendorRoot: URI): void {
		const webview = input.webview;
		webview.contentOptions = { ...webview.contentOptions, localResourceRoots: [vendorRoot, this.fileUri] };
		webview.setHtml(getBlockEditorHtml(scriptUri, styleUri));

		this._register(webview.onMessage(async (e: any) => {
			try {
				await this.handleMessage(e.message, webview);
			} catch (err) {
				this.logService.error('[VSWord Block Editor] message handler failed:', err);
				webview.postMessage({ type: 'hostError', message: String(err) });
			}
		}));
	}

	private async handleMessage(msg: any, webview: any): Promise<void> {
		switch (msg.type) {
			case 'ready': {
				try {
					const content = await this.fileService.readFile(this.fileUri);
					const text = content.value.toString();
					webview.postMessage({ type: 'init', content: text });
				} catch (err) {
					this.logService.error('[VSWord Block Editor] Failed to read file:', err);
					webview.postMessage({ type: 'init', content: '' });
				}
				break;
			}
			case 'save': {
				try {
					await this.fileService.writeFile(this.fileUri, VSBuffer.fromString(msg.content));
					webview.postMessage({ type: 'saved', ok: true });
				} catch (err) {
					this.logService.error('[VSWord Block Editor] Failed to save file:', err);
					webview.postMessage({ type: 'saved', ok: false, error: String(err) });
				}
				break;
			}
		}
	}
}

class VswordOpenBlockEditorAction extends Action2 {
	static readonly ID = 'vsword.actions.openBlockEditor';

	constructor() {
		super({
			id: VswordOpenBlockEditorAction.ID,
			title: localize2('vsword.blockEditor.open', 'VSWord: Open Block Editor'),
			category: VSWORD_CATEGORY,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const notificationService = accessor.get(INotificationService);

		const activeEditor = editorService.activeEditor;
		if (!activeEditor?.resource) {
			notificationService.info(localize('vsword.blockEditor.noFile', 'Open a Markdown file before using the Block Editor.'));
			return;
		}

		const fileUri = activeEditor.resource;
		// Only allow Markdown files
		const ext = fileUri.path.split('.').pop()?.toLowerCase();
		if (ext !== 'md' && ext !== 'markdown') {
			notificationService.info(localize('vsword.blockEditor.notMarkdown', 'Block Editor only supports Markdown files.'));
			return;
		}

		const manager = instantiationService.createInstance(BlockEditorManager, fileUri);
		await manager.openBlockEditor();
	}
}

registerAction2(VswordOpenBlockEditorAction);

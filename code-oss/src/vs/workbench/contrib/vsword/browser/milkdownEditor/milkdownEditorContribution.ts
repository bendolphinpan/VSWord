/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorInputWithOptions } from '../../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { asWebviewUri } from '../../../webview/common/webview.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import { getMilkdownEditorHtml } from './milkdownEditorHtml.js';

export const VSWORD_MILKDOWN_EDITOR_ID = 'vsword.markdown.milkdown';
const VSWORD_MILKDOWN_ORIGIN = 'vsword-markdown-milkdown';

interface MilkdownEditorEntry {
	readonly input: WebviewInput;
	readonly resource: URI;
	readonly disposables: DisposableStore;
	lastKnownMarkdown: string;
	dirty: boolean;
	saveTimer: any;
}

interface MilkdownWebviewResources {
	readonly vendorRoot: URI;
	readonly scriptUri: URI;
}

export class VswordMilkdownEditorContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.vsword.milkdownEditor';

	private readonly entries = new Map<string, MilkdownEditorEntry>();

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(editorResolverService.registerEditor(
			'*.md',
			{
				id: VSWORD_MILKDOWN_EDITOR_ID,
				label: localize('vsword.milkdownEditor.label', 'VSWord Markdown Editor'),
				detail: localize('vsword.milkdownEditor.detail', 'Milkdown WYSIWYG Markdown editor'),
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === 'file' && resource.path.toLowerCase().endsWith('.md'),
			},
			{
				createEditorInput: (editorInput, group) => this.createEditorInput(editorInput.resource, group),
			}
		));
	}

	private createEditorInput(resource: URI, group: IEditorGroup): EditorInputWithOptions {
		const key = resource.toString();
		const existing = this.entries.get(key);
		if (existing && !existing.input.isDisposed()) {
			return { editor: existing.input };
		}

		const title = basename(resource);
		const { vendorRoot, scriptUri } = getMilkdownWebviewResources();
		const webview = this.webviewService.createWebviewOverlay({
			providedViewType: VSWORD_MILKDOWN_EDITOR_ID,
			extension: undefined,
			origin: VSWORD_MILKDOWN_ORIGIN,
			title,
			options: { enableFindWidget: true, retainContextWhenHidden: true },
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [vendorRoot, resource],
			},
		});
		const input = this.instantiationService.createInstance(WebviewInput, {
			viewType: VSWORD_MILKDOWN_EDITOR_ID,
			providedId: VSWORD_MILKDOWN_EDITOR_ID,
			name: title,
			iconPath: undefined,
		}, webview);
		input.updateGroup(group.id);

		const entry: MilkdownEditorEntry = {
			input,
			resource,
			disposables: new DisposableStore(),
			lastKnownMarkdown: '',
			dirty: false,
			saveTimer: undefined,
		};
		this.entries.set(key, entry);
		entry.disposables.add(input.onWillDispose(() => {
			this.clearSaveTimer(entry);
			entry.disposables.dispose();
			if (this.entries.get(key) === entry) {
				this.entries.delete(key);
			}
		}));

		this.attach(entry, scriptUri);
		return { editor: input };
	}

	private attach(entry: MilkdownEditorEntry, scriptUri: URI): void {
		const webview = entry.input.webview;
		webview.setHtml(getMilkdownEditorHtml({
			fileName: basename(entry.resource),
			resourceUri: entry.resource.toString(),
			scriptUri: asWebviewUri(scriptUri).toString(true),
		}));
		entry.disposables.add(webview.onMessage(async e => {
			try {
				await this.handleMessage(entry, e.message);
			} catch (err) {
				this.logService.error('[VSWord Milkdown] message handler failed:', err);
				webview.postMessage({ type: 'hostError', message: String(err) });
			}
		}));
	}

	private async handleMessage(entry: MilkdownEditorEntry, msg: any): Promise<void> {
		if (!msg || typeof msg.type !== 'string') {
			return;
		}

		switch (msg.type) {
			case 'ready':
				await this.postDocument(entry);
				return;
			case 'markdownUpdated':
				this.handleMarkdownUpdated(entry, String(msg.markdown ?? ''));
				return;
			case 'save':
				await this.save(entry, String(msg.markdown ?? entry.lastKnownMarkdown), String(msg.requestId ?? ''));
				return;
			case 'openAsText':
				await this.openAsText(entry);
				return;
			case 'webviewError':
				this.logService.error('[VSWord Milkdown] webview error [' + String(msg.prefix || '?') + ']: ' + String(msg.message || ''));
				return;
		}
	}

	private async postDocument(entry: MilkdownEditorEntry): Promise<void> {
		const content = await this.fileService.readFile(entry.resource);
		const markdown = content.value.toString();
		entry.lastKnownMarkdown = markdown;
		entry.dirty = false;
		entry.input.webview.postMessage({
			type: 'init',
			resourceUri: entry.resource.toString(),
			fileName: basename(entry.resource),
			markdown,
		});
	}

	private handleMarkdownUpdated(entry: MilkdownEditorEntry, markdown: string): void {
		entry.lastKnownMarkdown = markdown;
		entry.dirty = true;
		this.scheduleSave(entry, markdown);
	}

	private scheduleSave(entry: MilkdownEditorEntry, markdown: string): void {
		this.clearSaveTimer(entry);
		entry.saveTimer = setTimeout(() => {
			entry.saveTimer = undefined;
			void this.save(entry, markdown, 'auto');
		}, 700);
		entry.input.webview.postMessage({ type: 'dirtyChanged', dirty: true });
	}

	private clearSaveTimer(entry: MilkdownEditorEntry): void {
		if (entry.saveTimer !== undefined) {
			clearTimeout(entry.saveTimer);
			entry.saveTimer = undefined;
		}
	}

	private async save(entry: MilkdownEditorEntry, markdown: string, requestId: string): Promise<void> {
		this.clearSaveTimer(entry);
		try {
			await this.fileService.writeFile(entry.resource, VSBuffer.fromString(markdown));
			entry.lastKnownMarkdown = markdown;
			entry.dirty = false;
			entry.input.webview.postMessage({ type: 'saved', requestId, ok: true, dirty: false });
		} catch (err) {
			this.logService.error('[VSWord Milkdown] failed to save Markdown:', err);
			entry.input.webview.postMessage({ type: 'saved', requestId, ok: false, dirty: true, message: String(err) });
		}
	}

	private async openAsText(entry: MilkdownEditorEntry): Promise<void> {
		try {
			await this.editorService.openEditor({ resource: entry.resource, options: { pinned: true, override: 'default' } }, entry.input.group);
		} catch (err) {
			this.logService.error('[VSWord Milkdown] failed to open Markdown as text:', err);
			entry.input.webview.postMessage({ type: 'hostError', message: String(err) });
		}
	}
}

function getMilkdownWebviewResources(): MilkdownWebviewResources {
	const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/milkdownEditor/vendor');
	return {
		vendorRoot,
		scriptUri: URI.joinPath(vendorRoot, 'index.js'),
	};
}

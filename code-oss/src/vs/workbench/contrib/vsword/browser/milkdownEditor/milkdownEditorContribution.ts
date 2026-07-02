/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangeType } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorInputWithOptions, SaveReason } from '../../../../common/editor.js';
import {
	IEditorResolverService,
	RegisteredEditorPriority,
} from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { asWebviewUri } from '../../../webview/common/webview.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import { getMilkdownEditorHtml } from './milkdownEditorHtml.js';
import {
	HostToWebviewMessage,
	VSWORD_MILKDOWN_EDITOR_ID,
	VSWORD_MILKDOWN_ORIGIN,
	WebviewToHostMessage,
} from './milkdownEditorProtocol.js';

interface WebviewResources {
	readonly vendorRoot: URI;
	readonly scriptUri: URI;
}

/**
 * Wires `.md` files to the Milkdown WYSIWYG editor and owns the per-input
 * webview↔working-copy plumbing. The input itself (see
 * {@link MilkdownEditorInput}) is instantiated by the resolver on demand and
 * carries the working copy; this class only attaches the message pump and
 * external-change dialog once the webview is live.
 */
export class VswordMilkdownEditorContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.vsword.milkdownEditor';

	private readonly liveInputs = new Set<MilkdownEditorInput>();

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IEditorService private readonly editorService: IEditorService,
		@IDialogService private readonly dialogService: IDialogService,
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
			},
		));
	}

	private createEditorInput(resource: URI, group: IEditorGroup): EditorInputWithOptions {
		const { vendorRoot, scriptUri } = getMilkdownWebviewResources();
		const webview = this.webviewService.createWebviewOverlay({
			providedViewType: VSWORD_MILKDOWN_EDITOR_ID,
			extension: undefined,
			origin: VSWORD_MILKDOWN_ORIGIN,
			title: basename(resource),
			options: { enableFindWidget: true, retainContextWhenHidden: true },
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [vendorRoot, resource],
			},
		});
		const input = this.instantiationService.createInstance(MilkdownEditorInput, resource, webview);
		input.updateGroup(group.id);
		this.attach(input, scriptUri);
		return { editor: input };
	}

	private attach(input: MilkdownEditorInput, scriptUri: URI): void {
		const disposables = new DisposableStore();
		this.liveInputs.add(input);

		input.webview.setHtml(getMilkdownEditorHtml({
			fileName: basename(input.resource),
			resourceUri: input.resource.toString(),
			scriptUri: asWebviewUri(scriptUri).toString(true),
		}));

		disposables.add(input.webview.onMessage(async e => {
			try {
				await this.handleWebviewMessage(input, e.message as WebviewToHostMessage);
			} catch (err) {
				this.logService.error('[VSWord Milkdown] message handler failed:', err);
				this.post(input, { type: 'hostError', message: String(err) });
			}
		}));

		disposables.add(input.workingCopy.onDidChangeDirty(() => {
			this.post(input, { type: 'dirtyChanged', dirty: input.workingCopy.isDirty() });
		}));

		disposables.add(input.workingCopy.onDidReload(payload => {
			this.post(input, { type: 'reload', markdown: payload.markdown, reason: payload.reason });
			this.post(input, { type: 'dirtyChanged', dirty: false });
		}));

		disposables.add(input.onDidRequestReload(() => {
			this.post(input, { type: 'reload', markdown: input.workingCopy.getContent(), reason: 'revert' });
		}));

		disposables.add(input.workingCopy.onExternalChange(evt => this.onExternalChange(input, evt.changeType)));

		disposables.add(input.onWillDispose(() => {
			this.liveInputs.delete(input);
			disposables.dispose();
		}));
	}

	private async handleWebviewMessage(input: MilkdownEditorInput, msg: WebviewToHostMessage): Promise<void> {
		if (!msg || typeof msg.type !== 'string') {
			return;
		}
		switch (msg.type) {
			case 'ready':
				await this.postInit(input);
				return;
			case 'markdownUpdated':
				input.workingCopy.updateContent(msg.markdown);
				return;
			case 'save': {
				const ok = await input.workingCopy.save({ reason: SaveReason.EXPLICIT });
				this.post(input, {
					type: 'saved',
					ok,
					dirty: input.workingCopy.isDirty(),
					requestId: msg.requestId,
					message: ok ? undefined : 'save failed',
				});
				return;
			}
			case 'openAsText':
				await this.openAsText(input);
				return;
			case 'webviewError':
				this.logService.error('[VSWord Milkdown] webview error [' + String(msg.prefix || '?') + ']: ' + msg.message);
				return;
		}
	}

	private async postInit(input: MilkdownEditorInput): Promise<void> {
		// If the working copy has already been loaded (e.g. reopened tab from
		// backup restore), push what we have instead of re-reading disk.
		const markdown = input.workingCopy.isLoaded
			? input.workingCopy.getContent()
			: await input.workingCopy.load('initial');
		this.post(input, {
			type: 'init',
			resourceUri: input.resource.toString(),
			fileName: basename(input.resource),
			markdown,
		});
		this.post(input, { type: 'dirtyChanged', dirty: input.workingCopy.isDirty() });
	}

	private async onExternalChange(input: MilkdownEditorInput, changeType: FileChangeType): Promise<void> {
		if (changeType === FileChangeType.DELETED) {
			this.post(input, { type: 'hostError', message: 'File was deleted on disk.' });
			return;
		}
		if (!input.workingCopy.isDirty()) {
			try {
				await input.workingCopy.load('externalChange');
			} catch (err) {
				this.logService.error('[VSWord Milkdown] silent reload on external change failed:', err);
			}
			return;
		}
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('vsword.milkdown.externalChange.title', 'This file has changed on disk.'),
			detail: localize(
				'vsword.milkdown.externalChange.detail',
				"'{0}' was modified outside VSWord while you have unsaved changes. Reload from disk and discard your edits?",
				basename(input.resource),
			),
			primaryButton: localize('vsword.milkdown.externalChange.reload', 'Reload from disk'),
			cancelButton: localize('vsword.milkdown.externalChange.keep', 'Keep my edits'),
		});
		if (confirmed) {
			try {
				await input.workingCopy.load('externalChange');
			} catch (err) {
				this.logService.error('[VSWord Milkdown] external reload failed:', err);
			}
		}
	}

	private async openAsText(input: MilkdownEditorInput): Promise<void> {
		try {
			await this.editorService.openEditor(
				{ resource: input.resource, options: { pinned: true, override: 'default' } },
				input.group,
			);
		} catch (err) {
			this.logService.error('[VSWord Milkdown] openAsText failed:', err);
			this.post(input, { type: 'hostError', message: String(err) });
		}
	}

	private post(input: MilkdownEditorInput, msg: HostToWebviewMessage): void {
		try {
			input.webview.postMessage(msg);
		} catch {
			// Webview was disposed underneath us; swallow.
		}
	}
}

function getMilkdownWebviewResources(): WebviewResources {
	const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/milkdownEditor/vendor');
	return {
		vendorRoot,
		scriptUri: URI.joinPath(vendorRoot, 'index.js'),
	};
}

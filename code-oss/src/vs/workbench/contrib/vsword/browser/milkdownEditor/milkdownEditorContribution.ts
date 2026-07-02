/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangeType } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
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
	VSWORD_MILKDOWN_DEFAULT_MODE,
	VSWORD_MILKDOWN_EDITOR_ID,
	VSWORD_MILKDOWN_MODE_STORAGE_KEY,
	VSWORD_MILKDOWN_MODES,
	VSWORD_MILKDOWN_ORIGIN,
	VswordMilkdownMode,
	WebviewToHostMessage,
} from './milkdownEditorProtocol.js';
import {
	VSWORD_MILKDOWN_DEFAULT_THEME,
	VSWORD_MILKDOWN_THEME_STORAGE_KEY,
	VSWORD_THEME_CONFIG,
	VswordMilkdownTheme,
	isValidTheme,
} from './milkdownEditorThemes.js';

interface WebviewResources {
	readonly vendorRoot: URI;
	readonly scriptUri: URI;
	readonly katexCssUri: URI;
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
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
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
		// T-3.3.1: broadcast theme changes to every live webview.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(VSWORD_THEME_CONFIG.followWorkbench) ||
				e.affectsConfiguration(VSWORD_THEME_CONFIG.light) ||
				e.affectsConfiguration(VSWORD_THEME_CONFIG.dark)
			) {
				this.broadcastTheme();
			}
		}));
		this._register(this.themeService.onDidColorThemeChange(() => {
			if (this.configurationService.getValue<boolean>(VSWORD_THEME_CONFIG.followWorkbench)) {
				this.broadcastTheme();
			}
		}));
		// T-3.3.1: user picked a new theme via the command palette → rebroadcast.
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, VSWORD_MILKDOWN_THEME_STORAGE_KEY, this._store)(() => {
			this.broadcastTheme();
		}));
	}

	private createEditorInput(resource: URI, group: IEditorGroup): EditorInputWithOptions {
		const { vendorRoot, scriptUri, katexCssUri } = getMilkdownWebviewResources();
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
		this.attach(input, scriptUri, katexCssUri);
		return { editor: input };
	}

	private attach(input: MilkdownEditorInput, scriptUri: URI, katexCssUri: URI): void {
		const disposables = new DisposableStore();
		this.liveInputs.add(input);

		input.webview.setHtml(getMilkdownEditorHtml({
			fileName: basename(input.resource),
			resourceUri: input.resource.toString(),
			scriptUri: asWebviewUri(scriptUri).toString(true),
			katexCssUri: asWebviewUri(katexCssUri).toString(true),
			initialTheme: this.readEffectiveTheme(),
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

		disposables.add(input.onRevealHeadingRequested(pos => {
			this.post(input, { type: 'revealHeading', pos });
		}));

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
			case 'preferenceRequest':
				this.post(input, { type: 'preferenceResponse', mode: this.readMode() });
				return;
			case 'preferenceUpdate':
				this.writeMode(msg.mode);
				return;
			case 'themeRequest':
				this.post(input, { type: 'themeChanged', theme: this.readEffectiveTheme() });
				return;
			case 'outlineChanged':
				input.updateOutlineData({ headings: msg.headings, activeId: msg.activeId });
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
		this.post(input, { type: 'themeChanged', theme: this.readEffectiveTheme() });
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

	private readMode(): VswordMilkdownMode {
		const raw = this.storageService.get(VSWORD_MILKDOWN_MODE_STORAGE_KEY, StorageScope.APPLICATION, VSWORD_MILKDOWN_DEFAULT_MODE);
		return (VSWORD_MILKDOWN_MODES as readonly string[]).includes(raw) ? raw as VswordMilkdownMode : VSWORD_MILKDOWN_DEFAULT_MODE;
	}

	private writeMode(mode: VswordMilkdownMode): void {
		if (!(VSWORD_MILKDOWN_MODES as readonly string[]).includes(mode)) return;
		this.storageService.store(VSWORD_MILKDOWN_MODE_STORAGE_KEY, mode, StorageScope.APPLICATION, StorageTarget.USER);
	}

	/**
	 * T-3.3.1 effective theme resolution:
	 *   - if followWorkbench=true → pick config.light or config.dark based on the workbench kind
	 *   - else → return the last-selected theme from IStorageService (default 'default')
	 */
	private readEffectiveTheme(): VswordMilkdownTheme {
		const follow = this.configurationService.getValue<boolean>(VSWORD_THEME_CONFIG.followWorkbench) === true;
		if (follow) {
			const kind = this.themeService.getColorTheme().type;
			const isDark = kind === ColorScheme.DARK || kind === ColorScheme.HIGH_CONTRAST_DARK;
			const key = isDark ? VSWORD_THEME_CONFIG.dark : VSWORD_THEME_CONFIG.light;
			const raw = this.configurationService.getValue<string>(key);
			return isValidTheme(raw) ? raw : (isDark ? 'night' : 'github');
		}
		const stored = this.storageService.get(VSWORD_MILKDOWN_THEME_STORAGE_KEY, StorageScope.APPLICATION, VSWORD_MILKDOWN_DEFAULT_THEME);
		return isValidTheme(stored) ? stored : VSWORD_MILKDOWN_DEFAULT_THEME;
	}

	private broadcastTheme(): void {
		const theme = this.readEffectiveTheme();
		for (const input of this.liveInputs) {
			this.post(input, { type: 'themeChanged', theme });
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
		katexCssUri: URI.joinPath(vendorRoot, 'katex', 'katex.min.css'),
	};
}

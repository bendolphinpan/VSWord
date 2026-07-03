/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangeType, IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
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
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { asWebviewUri } from '../../../webview/common/webview.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import { getMilkdownEditorHtml } from './milkdownEditorHtml.js';
import { WikilinkIndexEntry, resolveWikilink, resolutionToWireResult } from './milkdownWikilinkResolver.js';
import {
	HostToWebviewMessage,
	VSWORD_MILKDOWN_DEFAULT_MODE,
	VSWORD_MILKDOWN_FOCUS_STORAGE_KEY,
	VSWORD_MILKDOWN_TYPEWRITER_STORAGE_KEY,
	WikilinkResolveResult,
	VSWORD_MILKDOWN_EDITOR_ID,
	VSWORD_MILKDOWN_MODE_STORAGE_KEY,
	VSWORD_MILKDOWN_MODES,
	VSWORD_MILKDOWN_ORIGIN,
	VswordMilkdownMode,
	WebviewImageUploadRequestMessage,
	WebviewToHostMessage,
} from './milkdownEditorProtocol.js';
import {
	VSWORD_MILKDOWN_DEFAULT_THEME,
	VSWORD_MILKDOWN_THEME_STORAGE_KEY,
	VSWORD_THEME_CONFIG,
	VswordMilkdownTheme,
	isValidTheme,
} from './milkdownEditorThemes.js';
import {
	VSWORD_IMAGE_STRATEGY_CONFIG,
	VSWORD_IMAGE_STRATEGY_DEFAULT,
	VswordImageStorageStrategy,
	isValidImageStrategy,
	resolveImageLocation,
	resolveRelativeDirSegments,
} from './imageStorageStrategy.js';

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
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
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
		// T-3.11.1: invalidate wiki-link file index on any .md workspace change.
		this._register(this.fileService.onDidFilesChange(e => {
			if (this.wikilinkIndex === null && this.wikilinkIndexPromise === null) return;
			const roots = this.workspaceService.getWorkspace().folders;
			const affectsMd = (u: URI): boolean => {
				if (u.scheme !== 'file' || !u.path.toLowerCase().endsWith('.md')) return false;
				return roots.some(f => u.path.toLowerCase().startsWith(f.uri.path.toLowerCase() + '/'));
			};
			const dirty =
				e.rawAdded.some(affectsMd) ||
				e.rawUpdated.some(affectsMd) ||
				e.rawDeleted.some(affectsMd);
			if (!dirty) return;
			this.wikilinkIndex = null;
			this.wikilinkIndexPromise = null;
			for (const input of this.liveInputs) {
				this.post(input, { type: 'workspaceIndexChanged' });
			}
		}));
		// T-3.11.1: root list changed → same story.
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this.wikilinkIndex = null;
			this.wikilinkIndexPromise = null;
			for (const input of this.liveInputs) {
				this.post(input, { type: 'workspaceIndexChanged' });
			}
		}));
	}

	// ---- T-3.11.1 wiki-link file index -------------------------------------
	private wikilinkIndex: WikilinkIndexEntry[] | null = null;
	private wikilinkIndexPromise: Promise<WikilinkIndexEntry[]> | null = null;

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
				// T-3.5.1: parent dir instead of the .md file itself so images written
				// under `assets/`, `<name>.assets/`, or same-folder are loadable via
				// the webview URI scheme once inserted with a relative path.
				localResourceRoots: [vendorRoot, dirname(resource)],
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
			documentBaseUri: asWebviewUri(dirname(input.resource)).toString(true) + '/',
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
				this.post(input, {
					type: 'preferenceResponse',
					mode: this.readMode(),
					focus: this.readToggle(VSWORD_MILKDOWN_FOCUS_STORAGE_KEY),
					typewriter: this.readToggle(VSWORD_MILKDOWN_TYPEWRITER_STORAGE_KEY),
				});
				return;
			case 'preferenceUpdate':
				if (msg.mode !== undefined) this.writeMode(msg.mode);
				if (msg.focus !== undefined) this.writeToggle(VSWORD_MILKDOWN_FOCUS_STORAGE_KEY, msg.focus);
				if (msg.typewriter !== undefined) this.writeToggle(VSWORD_MILKDOWN_TYPEWRITER_STORAGE_KEY, msg.typewriter);
				return;
			case 'themeRequest':
				this.post(input, { type: 'themeChanged', theme: this.readEffectiveTheme() });
				return;
			case 'outlineChanged':
				input.updateOutlineData({ headings: msg.headings, activeId: msg.activeId });
				return;
			case 'imageUpload':
				await this.handleImageUpload(input, msg);
				return;
			case 'webviewError':
				this.logService.error('[VSWord Milkdown] webview error [' + String(msg.prefix || '?') + ']: ' + msg.message);
				return;
			case 'wikilinkResolveRequest':
				await this.handleWikilinkResolveRequest(input, msg.target);
				return;
			case 'wikilinkIndexRequest':
				await this.handleWikilinkIndexRequest(input);
				return;
			case 'openWikilink':
				await this.handleOpenWikilink(input, msg.target, msg.newSplit);
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

	private readToggle(key: string): 'on' | 'off' {
		return this.storageService.get(key, StorageScope.APPLICATION, 'off') === 'on' ? 'on' : 'off';
	}

	private writeToggle(key: string, value: 'on' | 'off'): void {
		const v = value === 'on' ? 'on' : 'off';
		this.storageService.store(key, v, StorageScope.APPLICATION, StorageTarget.USER);
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

	private readImageStrategy(): VswordImageStorageStrategy {
		const raw = this.configurationService.getValue(VSWORD_IMAGE_STRATEGY_CONFIG);
		return isValidImageStrategy(raw) ? raw : VSWORD_IMAGE_STRATEGY_DEFAULT;
	}

	/**
	 * T-3.5.1: persist a pasted/dropped image next to the current .md file and
	 * echo back the relative path. Errors get reported to the webview so the
	 * uploading placeholder is cleared and the user sees a toast.
	 *
	 * Failure modes handled:
	 *   - Bad base64 → imageUploadFailed (webview shows toast, removes widget).
	 *   - IFileService.writeFile throws (permissions/disk) → imageUploadFailed.
	 *   - Empty payload → imageUploadFailed.
	 */
	private async handleImageUpload(input: MilkdownEditorInput, msg: WebviewImageUploadRequestMessage): Promise<void> {
		const respondFail = (message: string) => {
			this.post(input, { type: 'imageUploadFailed', requestId: msg.requestId, message });
		};
		try {
			if (!msg.bytesBase64) {
				respondFail('Empty image payload.');
				return;
			}
			// atob available in browser/renderer; the webview host runs in the workbench window.
			const binary = atob(msg.bytesBase64);
			if (!binary.length) {
				respondFail('Empty image payload.');
				return;
			}
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }

			const strategy = this.readImageStrategy();
			const mdParent = dirname(input.resource);
			const mdName = basename(input.resource);
			const mdStem = mdName.replace(/\.[^./\\]+$/, '');
			const dirSegments = resolveRelativeDirSegments(strategy, mdStem);
			const targetDir = dirSegments.length === 0 ? mdParent : joinPath(mdParent, ...dirSegments);

			const location = await resolveImageLocation(
				strategy,
				mdStem,
				msg.suggestedName,
				msg.mime,
				async fileName => {
					try {
						return await this.fileService.exists(joinPath(targetDir, fileName));
					} catch {
						return false;
					}
				},
			);

			const targetUri = joinPath(targetDir, location.fileName);
			// Ensure the directory exists (writeFile on some providers only creates
			// files, not intermediate dirs); createFolder is a no-op if present.
			if (dirSegments.length > 0) {
				try { await this.fileService.createFolder(targetDir); } catch { /* already exists */ }
			}
			await this.fileService.writeFile(targetUri, VSBuffer.wrap(bytes));

			this.post(input, {
				type: 'imageUploaded',
				requestId: msg.requestId,
				relativePath: location.markdownPath,
				alt: mdStem, // stem-based default alt; user can retype
			});
		} catch (err) {
			this.logService.error('[VSWord Milkdown] image upload failed', err);
			respondFail(err instanceof Error ? err.message : String(err));
		}
	}

	private post(input: MilkdownEditorInput, msg: HostToWebviewMessage): void {
		try {
			input.webview.postMessage(msg);
		} catch {
			// Webview was disposed underneath us; swallow.
		}
	}

	// ---- T-3.11.1 wiki-link handlers ---------------------------------------

	/** Lazy build/refresh the workspace-wide `.md` index. */
	private ensureWikilinkIndex(): Promise<WikilinkIndexEntry[]> {
		if (this.wikilinkIndex) return Promise.resolve(this.wikilinkIndex);
		if (this.wikilinkIndexPromise) return this.wikilinkIndexPromise;
		this.wikilinkIndexPromise = this.buildWikilinkIndex().then(idx => {
			this.wikilinkIndex = idx;
			this.wikilinkIndexPromise = null;
			return idx;
		}, err => {
			this.logService.error('[VSWord Milkdown] wikilink index build failed', err);
			this.wikilinkIndexPromise = null;
			this.wikilinkIndex = [];
			return [];
		});
		return this.wikilinkIndexPromise;
	}

	private async buildWikilinkIndex(): Promise<WikilinkIndexEntry[]> {
		const roots = this.workspaceService.getWorkspace().folders;
		if (roots.length === 0) return [];
		const out: WikilinkIndexEntry[] = [];
		// Depth budget guards against pathological symlink cycles. Typical note
		// vaults are <10 deep; 24 is generous but bounded.
		const MAX_DEPTH = 24;
		// File-count cap so a wrong-workspace-open (opening `/`) never freezes.
		const MAX_FILES = 20000;
		for (const folder of roots) {
			try {
				const stat = await this.fileService.resolve(folder.uri, { resolveMetadata: false });
				this.walkForMd(stat, folder.uri.path, out, 0, MAX_DEPTH, MAX_FILES);
			} catch (err) {
				this.logService.debug('[VSWord Milkdown] wikilink scan root failed: ' + String(err));
			}
			if (out.length >= MAX_FILES) break;
		}
		return out;
	}

	private walkForMd(stat: IFileStat, rootPath: string, out: WikilinkIndexEntry[], depth: number, maxDepth: number, maxFiles: number): void {
		if (out.length >= maxFiles || depth > maxDepth) return;
		if (stat.isFile) {
			if (!stat.name.toLowerCase().endsWith('.md')) return;
			// Skip hidden files (leading dot).
			if (stat.name.startsWith('.')) return;
			const abs = stat.resource.path;
			// rootPath is the workspace-folder path (POSIX). Compute relative.
			let rel = abs;
			if (abs.toLowerCase().startsWith(rootPath.toLowerCase() + '/')) {
				rel = abs.slice(rootPath.length + 1);
			} else if (abs.toLowerCase() === rootPath.toLowerCase()) {
				rel = stat.name;
			}
			const lastSlash = rel.lastIndexOf('/');
			const dir = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
			const base = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
			const nameNoExt = base.replace(/\.md$/i, '');
			out.push({ name: nameNoExt, path: rel, dir });
			return;
		}
		// Directory: skip hidden and common noise dirs.
		if (stat.name.startsWith('.')) return;
		if (stat.name === 'node_modules' || stat.name === 'dist' || stat.name === 'out' || stat.name === '.git') return;
		for (const child of stat.children ?? []) {
			if (out.length >= maxFiles) break;
			this.walkForMd(child, rootPath, out, depth + 1, maxDepth, maxFiles);
		}
	}

	private async handleWikilinkResolveRequest(input: MilkdownEditorInput, target: string): Promise<void> {
		const index = await this.ensureWikilinkIndex();
		const wire: WikilinkResolveResult = resolutionToWireResult(target, resolveWikilink(target, index));
		this.post(input, { type: 'wikilinkResolveResponse', results: [wire] });
	}

	private async handleWikilinkIndexRequest(input: MilkdownEditorInput): Promise<void> {
		const index = await this.ensureWikilinkIndex();
		this.post(input, { type: 'wikilinkIndexResponse', entries: index });
	}

	private async handleOpenWikilink(input: MilkdownEditorInput, target: string, newSplit: boolean): Promise<void> {
		const index = await this.ensureWikilinkIndex();
		const resolution = resolveWikilink(target, index);
		const roots = this.workspaceService.getWorkspace().folders;
		if (resolution.status === 'found' && resolution.file) {
			const root = roots[0]?.uri;
			if (!root) return;
			const resource = URI.joinPath(root, resolution.file.path);
			try {
				await this.editorService.openEditor(
					{ resource, options: { pinned: true } },
					newSplit ? SIDE_GROUP : input.group,
				);
			} catch (err) {
				this.logService.error('[VSWord Milkdown] openWikilink failed:', err);
			}
			return;
		}
		if (resolution.status === 'ambiguous' && resolution.candidates && resolution.candidates.length > 0) {
			// T-3.11.1: minimal disambiguation — open first, warn. Rich picker lands in T-3.11.2.
			const root = roots[0]?.uri;
			if (!root) return;
			const first = resolution.candidates[0];
			try {
				await this.editorService.openEditor(
					{ resource: URI.joinPath(root, first.path), options: { pinned: true } },
					newSplit ? SIDE_GROUP : input.group,
				);
				this.dialogService.info(
					localize('vsword.milkdown.wikilink.ambiguous.title', "'{0}' matches multiple notes.", target),
					localize('vsword.milkdown.wikilink.ambiguous.detail',
						"Opened the first match; other candidates: {0}. Use a folder-qualified target like [[folder/{1}]] to disambiguate.",
						resolution.candidates.slice(1).map(c => c.path).join(', '),
						first.name,
					),
				);
			} catch (err) {
				this.logService.error('[VSWord Milkdown] openWikilink ambiguous open failed:', err);
			}
			return;
		}
		// status === 'missing': offer to create in the current file's folder.
		const currentFolder = input.resource.with({ path: input.resource.path.replace(/[^/]+$/, '') });
		const safeName = target.replace(/[\\/:*?"<>|]/g, '_').replace(/\.md$/i, '') + '.md';
		const targetUri = URI.joinPath(currentFolder, safeName);
		const { confirmed } = await this.dialogService.confirm({
			type: 'question',
			message: localize('vsword.milkdown.wikilink.create.title', "'{0}' doesn't exist yet.", target),
			detail: localize('vsword.milkdown.wikilink.create.detail', 'Create a new note at {0} and open it?', targetUri.path),
			primaryButton: localize('vsword.milkdown.wikilink.create.confirm', 'Create and open'),
			cancelButton: localize('vsword.milkdown.wikilink.create.cancel', 'Cancel'),
		});
		if (!confirmed) return;
		try {
			const seed = '# ' + target.replace(/\.md$/i, '') + '\n\n';
			await this.fileService.writeFile(targetUri, VSBuffer.fromString(seed));
			await this.editorService.openEditor(
				{ resource: targetUri, options: { pinned: true } },
				newSplit ? SIDE_GROUP : input.group,
			);
			// Index will pick it up via onDidFilesChange; broadcast now so webview
			// stops showing the ✎ badge immediately.
			this.wikilinkIndex = null;
			for (const live of this.liveInputs) {
				this.post(live, { type: 'workspaceIndexChanged' });
			}
		} catch (err) {
			this.logService.error('[VSWord Milkdown] wikilink create failed:', err);
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

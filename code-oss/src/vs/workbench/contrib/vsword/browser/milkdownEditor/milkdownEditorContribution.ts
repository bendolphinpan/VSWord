/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { basename, dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileChangeType, IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorExtensions, EditorInputWithOptions, IEditorFactoryRegistry, SaveReason } from '../../../../common/editor.js';
import {
	IEditorResolverService,
	RegisteredEditorPriority,
} from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { asWebviewUri } from '../../../webview/common/webview.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import {
	createMilkdownEditorInput,
	getMilkdownWebviewResources,
	setMilkdownEditorAttachHandler,
} from './milkdownEditorFactory.js';
import { MilkdownEditorInput } from './milkdownEditorInput.js';
import { MilkdownEditorInputSerializer } from './milkdownEditorInputSerializer.js';
import {
	ExternalTheme,
	isExternalThemeId,
	VSWORD_EXTERNAL_THEMES_DIRNAME,
} from './milkdownEditorExternalThemes.js';
import { discoverExternalThemes, extractThemeDisplayName } from './milkdownEditorExternalThemeDiscovery.js';
import { buildExternalThemePayload } from './milkdownEditorExternalThemePayload.js';
import { setExternalThemes as publishExternalThemes } from './milkdownEditorExternalThemeRegistry.js';
import { IVSWordFindService } from '../../common/vswordFindService.js';
import { resolveExportResponse } from './exportContribution.js';
import { getMilkdownEditorHtml } from './milkdownEditorHtml.js';
import { WikilinkIndexEntry, WikilinkResolveIndex, buildWikilinkResolveIndex, resolveWikilinkWithIndex, resolutionToWireResult, extractPreviewSnippet, extractPreviewTitle, buildBacklinksGraph, backlinksFor, WikilinkBackref } from './milkdownWikilinkResolver.js';
import {
	HostToWebviewMessage,
	VSWORD_MILKDOWN_DEFAULT_MODE,
	VSWORD_MILKDOWN_FOCUS_STORAGE_KEY,
	VSWORD_MILKDOWN_TYPEWRITER_STORAGE_KEY,
	VSWORD_MILKDOWN_FORMAT_DOCUMENT_ACTION_ID,
	VSWORD_MILKDOWN_FORMAT_SELECTION_ACTION_ID,
	VSWORD_MILKDOWN_TOC_INSERT_ACTION_ID,
	WikilinkResolveResult,
	VSWORD_MILKDOWN_EDITOR_ID,
	VSWORD_MILKDOWN_MODE_STORAGE_KEY,
	VSWORD_MILKDOWN_MODES,
	VswordMilkdownMode,
	WebviewImageUploadRequestMessage,
	WebviewToHostMessage,
} from './milkdownEditorProtocol.js';
import {
	VSWORD_MILKDOWN_DEFAULT_THEME,
	VSWORD_MILKDOWN_THEME_STORAGE_KEY,
	VSWORD_THEME_CONFIG,
	isValidTheme,
} from './milkdownEditorThemes.js';
import {
	VSWORD_TYPOGRAPHY_CONFIG,
	normalizeTypography,
	type VswordTypographyPayload,
} from './milkdownEditorTypography.js';
import {
	VSWORD_IMAGE_STRATEGY_CONFIG,
	VSWORD_IMAGE_STRATEGY_DEFAULT,
	VswordImageStorageStrategy,
	isValidImageStrategy,
	resolveImageLocation,
	resolveRelativeDirSegments,
} from './imageStorageStrategy.js';

// 会话恢复：注册 typeId serializer（必须在 restore 前完成；模块加载即注册）
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(MilkdownEditorInput.TYPE_ID, MilkdownEditorInputSerializer);

/**
 * Wires `.md` files to the Milkdown WYSIWYG editor and owns the per-input
 * webview↔working-copy plumbing. The input itself (see
 * {@link MilkdownEditorInput}) is instantiated by the resolver on demand and
 * carries the working copy; this class only attaches the message pump and
 * external-change dialog once the webview is live.
 *
 * 页签会话恢复：`MilkdownEditorInputSerializer` + factory attach hook，
 * 保证关窗再开仍打开同一批 .md Milkdown 页签（不是空白/丢失）。
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
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IVSWordFindService private readonly findService: IVSWordFindService,
	) {
		super();
		// factory / serializer 创建的 input 统一走 attach（幂等）
		setMilkdownEditorAttachHandler(input => this.ensureAttach(input));
		this._register({ dispose: () => setMilkdownEditorAttachHandler(undefined) });

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
		// RD-7: 字体三元组变更 → typographyChanged。
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(VSWORD_THEME_CONFIG.followWorkbench) ||
				e.affectsConfiguration(VSWORD_THEME_CONFIG.light) ||
				e.affectsConfiguration(VSWORD_THEME_CONFIG.dark)
			) {
				void this.broadcastTheme();
			}
			if (
				e.affectsConfiguration(VSWORD_TYPOGRAPHY_CONFIG.fontFamily) ||
				e.affectsConfiguration(VSWORD_TYPOGRAPHY_CONFIG.fontSize) ||
				e.affectsConfiguration(VSWORD_TYPOGRAPHY_CONFIG.lineHeight)
			) {
				this.broadcastTypography();
			}
		}));
		this._register(this.themeService.onDidColorThemeChange(() => {
			if (this.configurationService.getValue<boolean>(VSWORD_THEME_CONFIG.followWorkbench)) {
				void this.broadcastTheme();
			}
		}));
		// T-3.3.1: user picked a new theme via the command palette → rebroadcast.
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, VSWORD_MILKDOWN_THEME_STORAGE_KEY, this._store)(() => {
			void this.broadcastTheme();
		}));
		// T-3.7d.2.c · 外挂主题接线：启动跑一次 discovery；后续 `.vsword/themes` 目录里
		// 任意变更（增/删/改 .css）→ 裸重扫 + broadcast。选择裸重扫（不 debounce）是本卡
		// 预算自救 §3 的取舍：多 broadcast 一次也不会造成视觉抖动（webview 端幂等注入 style）。
		void this.refreshExternalThemes({ broadcast: false });
		this._register(this.fileService.onDidFilesChange(e => {
			const dirs = this.externalThemeWatchDirs();
			if (dirs.length === 0) return;
			const affects = (u: URI): boolean => {
				const p = u.path.toLowerCase();
				return dirs.some(d => p === d || p.startsWith(d + '/'));
			};
			const hit =
				e.rawAdded.some(affects) ||
				e.rawUpdated.some(affects) ||
				e.rawDeleted.some(affects);
			if (!hit) return;
			void this.refreshExternalThemes({ broadcast: true });
		}));
		// workspace folders 变更也重扫（新开的 folder 可能带 .vsword/themes）。
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			void this.refreshExternalThemes({ broadcast: true });
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
			this.invalidateWikilinkCaches();
			for (const input of this.liveInputs) {
				this.post(input, { type: 'workspaceIndexChanged' });
			}
		}));
		// T-3.11.1: root list changed → same story.
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this.invalidateWikilinkCaches();
			for (const input of this.liveInputs) {
				this.post(input, { type: 'workspaceIndexChanged' });
			}
		}));

		// T-3.8.2 · Qa2=c: 两条 format 命令，命令面板可见（f1: true）。
		// action.run() 走 accessor 找到当前 active editor 的 MilkdownEditorInput —— 只有当活跃
		// 编辑器是 Milkdown 输入时才生效，否则静默 no-op（保持与 monaco 命令一致的语义）。
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: VSWORD_MILKDOWN_FORMAT_DOCUMENT_ACTION_ID,
					title: localize2('vsword.milkdown.formatDocument', 'VSWord Milkdown: Format Document'),
					category: localize2('vsword', 'VSWord'),
					f1: true,
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const editorSvc = accessor.get(IEditorService);
				const active = editorSvc.activeEditor;
				if (!(active instanceof MilkdownEditorInput)) { return; }
				self.triggerFormat(active, 'document');
			}
		}));
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: VSWORD_MILKDOWN_FORMAT_SELECTION_ACTION_ID,
					title: localize2('vsword.milkdown.formatSelection', 'VSWord Milkdown: Format Selection'),
					category: localize2('vsword', 'VSWord'),
					f1: true,
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const editorSvc = accessor.get(IEditorService);
				const active = editorSvc.activeEditor;
				if (!(active instanceof MilkdownEditorInput)) { return; }
				self.triggerFormat(active, 'selection');
			}
		}));

		// T-3.7c.1.c · 命令 `vsword.toc.insertToc`：命令面板 / 快捷键触发，
		// host 只做 activeEditor guard + post tocInsert 消息；webview 侧承担
		// 「在当前光标所在段落后插入 toc_marker 节点」的实际编辑逻辑。
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: VSWORD_MILKDOWN_TOC_INSERT_ACTION_ID,
					title: localize2('vsword.toc.insertToc', 'VSWord: Insert Table of Contents'),
					category: localize2('vsword', 'VSWord'),
					f1: true,
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const editorSvc = accessor.get(IEditorService);
				const active = editorSvc.activeEditor;
				if (!(active instanceof MilkdownEditorInput)) { return; }
				self.post(active, { type: 'tocInsert' });
			}
		}));
	}

	// ---- T-3.11.1 wiki-link file index -------------------------------------
	private wikilinkIndex: WikilinkIndexEntry[] | null = null;
	/** O(1) resolve tables; rebuilt with {@link wikilinkIndex}. */
	private wikilinkResolveIndex: WikilinkResolveIndex | null = null;
	private wikilinkIndexPromise: Promise<WikilinkIndexEntry[]> | null = null;
	private wikilinkGraph: Map<string, WikilinkBackref[]> | null = null;
	private wikilinkGraphPromise: Promise<Map<string, WikilinkBackref[]>> | null = null;

	// ---- T-3.7d.2.c 外挂主题缓存 -----------------------------------------
	// discovery 结果本身是廉价的（只 stat 不读文件），但 buildExternalThemeCssPayload 里
	// 需要通过 id → uri 反查 → 读 CSS，所以把最近一次 discovery 结果缓存在这里。
	// broadcast 前若已过期由 onDidFilesChange 触发 refresh，本次 broadcast 直接读缓存拿 URI。
	private externalThemes: ExternalTheme[] = [];

	private createEditorInput(resource: URI, group: IEditorGroup): EditorInputWithOptions {
		const input = createMilkdownEditorInput(
			this.instantiationService,
			this.webviewService,
			resource,
			group.id,
		);
		// attach 已由 factory hook 调用；再 ensure 一次幂等
		this.ensureAttach(input);
		return { editor: input };
	}

	/** 幂等 attach：同一 input 只装一次 message pump / HTML。 */
	private ensureAttach(input: MilkdownEditorInput): void {
		if (this.liveInputs.has(input)) {
			return;
		}
		const { scriptUri, katexCssUri } = getMilkdownWebviewResources();
		this.attach(input, scriptUri, katexCssUri);
	}

	private attach(input: MilkdownEditorInput, scriptUri: URI, katexCssUri: URI): void {
		if (this.liveInputs.has(input)) {
			return;
		}
		const disposables = new DisposableStore();
		this.liveInputs.add(input);

		// 首帧防闪：用 workbench 当前 editor 绝对色，避免 webview 默认白底 → 深色 → 再跳变
		const wbTheme = this.themeService.getColorTheme();
		const bootBackground = wbTheme.getColor('editor.background')?.toString()
			?? (wbTheme.type === ColorScheme.LIGHT || wbTheme.type === ColorScheme.HIGH_CONTRAST_LIGHT
				? '#ffffff' : '#1e1e1e');
		const bootForeground = wbTheme.getColor('editor.foreground')?.toString()
			?? (wbTheme.type === ColorScheme.LIGHT || wbTheme.type === ColorScheme.HIGH_CONTRAST_LIGHT
				? '#333333' : '#d4d4d4');
		input.webview.setHtml(getMilkdownEditorHtml({
			fileName: basename(input.resource),
			resourceUri: input.resource.toString(),
			scriptUri: asWebviewUri(scriptUri).toString(true),
			katexCssUri: asWebviewUri(katexCssUri).toString(true),
			documentBaseUri: asWebviewUri(dirname(input.resource)).toString(true) + '/',
			initialTheme: this.readEffectiveTheme(),
			bootBackground,
			bootForeground,
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
			case 'openProgress': {
				// RD-1.3 · 大文档 progressive 进度（首屏可编辑 / 追加 / 完成）
				// 仅 debug 日志；UI 状态已在 webview 工具栏展示。避免刷屏：done 或 first 打一条。
				if (msg.phase === 'first' || msg.phase === 'done') {
					this.logService.debug(
						`[VSWord Milkdown] openProgress ${msg.phase} ${msg.loadedChunks}/${msg.totalChunks} chars=${msg.sourceChars} progressive=${msg.progressive}`,
					);
				}
				return;
			}
			case 'markdownUpdated':
				input.workingCopy.updateContent(
					msg.markdown,
					// undefined = 旧路径整篇 dirty；数组 = tracker 报告；null 上游协议里不出现。
					msg.dirtyBlocks,
					msg.dirtyBlockContents,
				);
				return;
			case 'sessionReady':
				input.workingCopy.updateSession(msg);
				return;
			case 'imeCompositionChanged':
				// T-3.12.1.a · webview 侧 compositionstart/end → host 侧 auto-save gate。
				// 参数直接透传：workingCopy 内部处理 gate + 补排 debounce。
				input.workingCopy.updateWebviewComposing(msg.composing);
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
				await this.sendThemeToInput(input);
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
			case 'wikilinkPreviewRequest':
				await this.handleWikilinkPreviewRequest(input, msg.requestId, msg.target);
				return;
			case 'wikilinkBacklinksRequest':
				await this.handleWikilinkBacklinksRequest(input);
				return;
			case 'openWikilink':
				await this.handleOpenWikilink(input, msg.target, msg.newSplit);
				return;
			case 'openWikilinkPath':
				await this.handleOpenWikilinkPath(input, msg.path, msg.newSplit);
				return;
			case 'find.stateChanged': {
				// T-3.7c.3.c2 · webview 侧 find widget 每次 state 变化上报增量字段；
				// host service 内部 fold 进当前镜像并 fire onDidChangeState。
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { type: _type, ...partial } = msg;
				this.findService.setState(partial);
				return;
			}
			case 'export.html.response':
				// T-3.8b.1.c · webview 侧 HTML snapshot 装配好回传；派发到 pendingExports Map
				// 让 runHtmlExport 里挂着的 Promise 解锁。未知 requestId（e.g. 超时后到达）
				// 静默丢弃，不影响状态机。
				resolveExportResponse(msg);
				return;
		}
	}

	private async postInit(input: MilkdownEditorInput): Promise<void> {
		// 启动 / webview ready：非 dirty 一律重新读盘，避免「关窗再开空白/旧稿」。
		// 仅当 WorkingCopy 已有未保存编辑时才推内存内容（热恢复 / 同会话重挂 webview）。
		let markdown: string;
		try {
			if (input.workingCopy.isLoaded && input.workingCopy.isDirty()) {
				markdown = input.workingCopy.getContent();
			} else {
				markdown = await input.workingCopy.load('initial');
			}
		} catch (err) {
			this.logService.error('[VSWord Milkdown] postInit load failed:', err);
			markdown = input.workingCopy.isLoaded ? input.workingCopy.getContent() : '';
			this.post(input, { type: 'hostError', message: 'Failed to load file: ' + String(err) });
		}
		this.post(input, {
			type: 'init',
			resourceUri: input.resource.toString(),
			fileName: basename(input.resource),
			markdown,
		});
		this.post(input, { type: 'dirtyChanged', dirty: input.workingCopy.isDirty() });
		await this.sendThemeToInput(input);
		this.sendTypographyToInput(input);
	}

	/** RD-7 · 读 Settings 并规范化字体三元组。 */
	private readTypography(): VswordTypographyPayload {
		return normalizeTypography({
			fontFamily: this.configurationService.getValue(VSWORD_TYPOGRAPHY_CONFIG.fontFamily),
			fontSize: this.configurationService.getValue(VSWORD_TYPOGRAPHY_CONFIG.fontSize),
			lineHeight: this.configurationService.getValue(VSWORD_TYPOGRAPHY_CONFIG.lineHeight),
		});
	}

	private sendTypographyToInput(input: MilkdownEditorInput): void {
		const t = this.readTypography();
		this.post(input, {
			type: 'typographyChanged',
			fontFamily: t.fontFamily,
			fontSize: t.fontSize,
			lineHeight: t.lineHeight,
		});
	}

	private broadcastTypography(): void {
		const t = this.readTypography();
		const msg = {
			type: 'typographyChanged' as const,
			fontFamily: t.fontFamily,
			fontSize: t.fontSize,
			lineHeight: t.lineHeight,
		};
		for (const input of this.liveInputs) {
			this.post(input, msg);
		}
	}

	private async onExternalChange(input: MilkdownEditorInput, changeType: FileChangeType): Promise<void> {
		if (changeType === FileChangeType.DELETED) {
			this.post(input, { type: 'hostError', message: 'File was deleted on disk.' });
			return;
		}
		// RD-2 · 静默 reload 会 post `reload` → webview createEditor 整页重建 → 失焦 + 丢字。
		// 仅在「非 dirty」时自动跟盘；dirty 时弹窗。自身 save 的回声由 workingCopy 抑制。
		if (!input.workingCopy.isDirty()) {
			try {
				// 若磁盘内容与内存已一致，load 会再 fire onDidReload 仍会重建编辑器——避免无意义 reload。
				const disk = await this.fileService.readFile(input.resource);
				const diskText = disk.value.toString();
				if (diskText === input.workingCopy.getContent()) {
					return;
				}
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
	 * T-3.3.1 / T-3.7d.2.c effective theme resolution:
	 *   - followWorkbench=true → pick config.light or config.dark based on the workbench kind
	 *   - else → return the last-selected theme from IStorageService (default 'default')
	 *
	 * 返回类型从 `VswordMilkdownTheme` 放宽到 `string`：ext:workspace:* / ext:user:* 类外挂
	 * 主题 id 也应该直通 webview，caller（webview）只按前缀判断处理路径。
	 * follow-workbench 只走内置主题；外挂主题只能通过 storage（`vsword.theme.set` 命令写入）
	 * 显式选中。
	 */
	private readEffectiveTheme(): string {
		const follow = this.configurationService.getValue<boolean>(VSWORD_THEME_CONFIG.followWorkbench) === true;
		if (follow) {
			const kind = this.themeService.getColorTheme().type;
			const isDark = kind === ColorScheme.DARK || kind === ColorScheme.HIGH_CONTRAST_DARK;
			const key = isDark ? VSWORD_THEME_CONFIG.dark : VSWORD_THEME_CONFIG.light;
			const raw = this.configurationService.getValue<string>(key);
			return isValidTheme(raw) ? raw : (isDark ? 'night' : 'github');
		}
		const stored = this.storageService.get(VSWORD_MILKDOWN_THEME_STORAGE_KEY, StorageScope.APPLICATION, VSWORD_MILKDOWN_DEFAULT_THEME);
		if (isExternalThemeId(stored) && this.externalThemes.some(t => t.id === stored)) {
			return stored;
		}
		return isValidTheme(stored) ? stored : VSWORD_MILKDOWN_DEFAULT_THEME;
	}

	private async broadcastTheme(): Promise<void> {
		const theme = this.readEffectiveTheme();
		const isDark = this.readIsDark();
		if (isExternalThemeId(theme)) {
			const payload = await this.buildExternalThemeCssPayload(theme);
			if (payload) {
				for (const input of this.liveInputs) {
					this.post(input, payload);
				}
			}
		}
		for (const input of this.liveInputs) {
			this.post(input, { type: 'themeChanged', theme, isDark });
		}
	}

	/**
	 * T-3.7d.2.c · 给单个 input 推当前主题（含 ext:* CSS payload）。
	 *
	 * postInit / themeRequest 都走这条：外挂主题时先送 CSS，再送 themeChanged；
	 * 内置主题跳过 payload 步骤。异常静默（外挂主题 CSS 读失败不应阻塞编辑器加载）。
	 */
	private async sendThemeToInput(input: MilkdownEditorInput): Promise<void> {
		const theme = this.readEffectiveTheme();
		const isDark = this.readIsDark();
		if (isExternalThemeId(theme)) {
			const payload = await this.buildExternalThemeCssPayload(theme);
			if (payload) {
				this.post(input, payload);
			}
		}
		this.post(input, { type: 'themeChanged', theme, isDark });
	}

	/**
	 * T-3.7d.2.c · 根据 ext:* id 从缓存里查 URI → 读原始 CSS → rebase url() → wrap scope → asWebviewUri。
	 *
	 * 返回 undefined 的三种情况：id 对不上任何已发现主题、文件读取抛错、CSS 解码抛错。
	 * caller（broadcastTheme / sendThemeToInput）拿到 undefined 时跳过 payload 一步，仅广播
	 * themeChanged —— webview 端幂等：若 style 元素已存在但没新 CSS，body[data-theme] 变化
	 * 后旧 CSS 依然生效直到下一次成功 payload。
	 */
	private async buildExternalThemeCssPayload(themeId: string): Promise<HostToWebviewMessage | undefined> {
		const payload = await buildExternalThemePayload({
			themeId,
			themes: this.externalThemes,
			fileService: this.fileService,
			toWebviewUri: dirUri => asWebviewUri(dirUri),
		});
		if (!payload) {
			this.logService.warn('[VSWord Milkdown] external theme CSS payload not produced for ' + themeId);
		}
		return payload;
	}

	/**
	 * T-3.7d.2.c · 重跑一次 discovery，替换缓存。
	 * `broadcast=true` 时若当前 effective theme 是 ext:*，重发一次 CSS payload + themeChanged。
	 */
	private async refreshExternalThemes(opts: { broadcast: boolean }): Promise<void> {
		try {
			const roots = this.workspaceService.getWorkspace().folders;
			const workspaceUri = roots[0]?.uri;
			const userConfigDirUri = this.environmentService.userRoamingDataHome;
			const themes = await discoverExternalThemes({
				fileService: this.fileService,
				workspaceUri,
				userConfigDirUri,
			});
			// T-3.7d.2.c · 尝试从 CSS 头注释里取 `Theme Name:` 作为显示名（可选，
			// 失败沉默：discovery 层已经给了 basename fallback）。
			const enriched = await Promise.all(themes.map(async t => {
				try {
					const raw = await this.fileService.readFile(t.uri, { position: 0, length: 4096 });
					const name = extractThemeDisplayName(raw.value.toString());
					return name ? { ...t, displayName: name } : t;
				} catch {
					return t;
				}
			}));
			this.externalThemes = enriched;
			publishExternalThemes(enriched);
		} catch (err) {
			this.logService.warn('[VSWord Milkdown] external theme discovery failed: ' + String(err));
			this.externalThemes = [];
			publishExternalThemes([]);
		}
		if (opts.broadcast) {
			await this.broadcastTheme();
		}
	}

	/** 返回受监听的 `.vsword/themes` 目录路径列表（小写、无尾斜杠），用于 onDidFilesChange 过滤。 */
	private externalThemeWatchDirs(): string[] {
		const dirs: string[] = [];
		const roots = this.workspaceService.getWorkspace().folders;
		for (const f of roots) {
			dirs.push((f.uri.path + '/' + VSWORD_EXTERNAL_THEMES_DIRNAME).toLowerCase());
		}
		dirs.push((this.environmentService.userRoamingDataHome.path + '/' + VSWORD_EXTERNAL_THEMES_DIRNAME).toLowerCase());
		return dirs;
	}

	/** T-3.5b.2: 从 workbench color theme 抽取暗色标记，用于 mermaid 主题联动。 */
	private readIsDark(): boolean {
		const kind = this.themeService.getColorTheme().type;
		return kind === ColorScheme.DARK || kind === ColorScheme.HIGH_CONTRAST_DARK;
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

	/**
	 * T-3.8.2 · Qa2=c: 触发 format 命令的完整链路。
	 *   1) 在 workingCopy 上打 pendingForcePath 标记（'C' 或 'B'），保证下一次 save 走对应分支；
	 *   2) 向 webview 发 formatDocument / formatSelection 消息，让 webview 侧执行等价
	 *      parse→stringify（或严格 block 对齐的选区 stringify），并在结束后回一次 markdownUpdated
	 *      + 显式 save 请求。
	 * 若 webview 侧未回 save 请求，pendingForcePath 会在下一次任意 save 消耗；forcePath=null 兜底。
	 */
	private triggerFormat(input: MilkdownEditorInput, scope: 'document' | 'selection'): void {
		input.workingCopy.setPendingFormatPath(scope);
		this.post(input, {
			type: scope === 'document' ? 'formatDocument' : 'formatSelection',
		});
	}

	// ---- T-3.11.1 wiki-link handlers ---------------------------------------

	private invalidateWikilinkCaches(): void {
		this.wikilinkIndex = null;
		this.wikilinkResolveIndex = null;
		this.wikilinkIndexPromise = null;
		this.wikilinkGraph = null;
		this.wikilinkGraphPromise = null;
	}

	/** Lazy build/refresh the workspace-wide `.md` index. */
	private ensureWikilinkIndex(): Promise<WikilinkIndexEntry[]> {
		if (this.wikilinkIndex) { return Promise.resolve(this.wikilinkIndex); }
		if (this.wikilinkIndexPromise) { return this.wikilinkIndexPromise; }
		this.wikilinkIndexPromise = this.buildWikilinkIndex().then(idx => {
			this.wikilinkIndex = idx;
			this.wikilinkResolveIndex = buildWikilinkResolveIndex(idx);
			this.wikilinkIndexPromise = null;
			return idx;
		}, err => {
			this.logService.error('[VSWord Milkdown] wikilink index build failed', err);
			this.wikilinkIndexPromise = null;
			this.wikilinkIndex = [];
			this.wikilinkResolveIndex = buildWikilinkResolveIndex([]);
			return [];
		});
		return this.wikilinkIndexPromise;
	}

	private async ensureWikilinkResolveIndex(): Promise<WikilinkResolveIndex> {
		await this.ensureWikilinkIndex();
		if (!this.wikilinkResolveIndex) {
			this.wikilinkResolveIndex = buildWikilinkResolveIndex(this.wikilinkIndex ?? []);
		}
		return this.wikilinkResolveIndex;
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
		const resolveIdx = await this.ensureWikilinkResolveIndex();
		const wire: WikilinkResolveResult = resolutionToWireResult(target, resolveWikilinkWithIndex(target, resolveIdx));
		this.post(input, { type: 'wikilinkResolveResponse', results: [wire] });
	}

	private async handleWikilinkIndexRequest(input: MilkdownEditorInput): Promise<void> {
		const index = await this.ensureWikilinkIndex();
		this.post(input, { type: 'wikilinkIndexResponse', entries: index });
	}

	private async handleWikilinkPreviewRequest(input: MilkdownEditorInput, requestId: number, target: string): Promise<void> {
		const resolveIdx = await this.ensureWikilinkResolveIndex();
		const resolution = resolveWikilinkWithIndex(target, resolveIdx);
		const roots = this.workspaceService.getWorkspace().folders;
		const root = roots[0]?.uri;
		const file = resolution.status === 'found'
			? resolution.file
			: resolution.status === 'ambiguous' && resolution.candidates
				? resolution.candidates[0]
				: undefined;
		if (!root || !file) {
			this.post(input, { type: 'wikilinkPreviewResponse', requestId, target, status: 'missing' });
			return;
		}
		try {
			const uri = joinPath(root, file.path);
			// Cap read at 8 KB — plenty for a 320-char snippet, cheap on big files.
			const raw = await this.fileService.readFile(uri, { position: 0, length: 8192 });
			const text = raw.value.toString();
			const title = extractPreviewTitle(text, file.name);
			const snippet = extractPreviewSnippet(text);
			this.post(input, {
				type: 'wikilinkPreviewResponse',
				requestId,
				target,
				status: 'ok',
				title,
				snippet,
				path: file.path,
			});
		} catch {
			this.post(input, { type: 'wikilinkPreviewResponse', requestId, target, status: 'error' });
		}
	}

	/** Compute the workspace-relative path of the doc a webview hosts. */
	private ownRelPath(input: MilkdownEditorInput): { rootUri: URI; rel: string } | null {
		const roots = this.workspaceService.getWorkspace().folders;
		const abs = input.resource.path;
		for (const f of roots) {
			const root = f.uri.path;
			if (abs.toLowerCase() === root.toLowerCase()) return { rootUri: f.uri, rel: basename(input.resource) };
			if (abs.toLowerCase().startsWith(root.toLowerCase() + '/')) return { rootUri: f.uri, rel: abs.slice(root.length + 1) };
		}
		return null;
	}

	/** Lazy-build the inverse reference graph. Reads every indexed .md (8 KB cap each). */
	private ensureBacklinksGraph(): Promise<Map<string, WikilinkBackref[]>> {
		if (this.wikilinkGraph) return Promise.resolve(this.wikilinkGraph);
		if (this.wikilinkGraphPromise) return this.wikilinkGraphPromise;
		this.wikilinkGraphPromise = this.buildBacklinksGraph().then(g => {
			this.wikilinkGraph = g;
			this.wikilinkGraphPromise = null;
			return g;
		}, err => {
			this.logService.error('[VSWord Milkdown] backlinks graph build failed', err);
			this.wikilinkGraphPromise = null;
			this.wikilinkGraph = new Map();
			return this.wikilinkGraph;
		});
		return this.wikilinkGraphPromise;
	}

	private async buildBacklinksGraph(): Promise<Map<string, WikilinkBackref[]>> {
		const index = await this.ensureWikilinkIndex();
		if (index.length === 0) return new Map();
		const roots = this.workspaceService.getWorkspace().folders;
		const root = roots[0]?.uri;
		if (!root) return new Map();
		// Read each file with the same 8 KB cap the preview uses — plenty for a
		// wiki-link scan, cheap on a 500-file vault. Failures are silent per file.
		const sources: Array<{ path: string; name: string; text: string }> = [];
		await Promise.all(index.map(async entry => {
			try {
				const uri = joinPath(root, entry.path);
				const raw = await this.fileService.readFile(uri, { position: 0, length: 8192 });
				sources.push({ path: entry.path, name: entry.name, text: raw.value.toString() });
			} catch { /* per-file failure is not fatal */ }
		}));
		return buildBacklinksGraph(index, sources);
	}

	private async handleWikilinkBacklinksRequest(input: MilkdownEditorInput): Promise<void> {
		const own = this.ownRelPath(input);
		if (!own) {
			this.post(input, { type: 'wikilinkBacklinksResponse', ownPath: '', refs: [] });
			return;
		}
		const graph = await this.ensureBacklinksGraph();
		const refs = backlinksFor(graph, own.rel);
		this.post(input, {
			type: 'wikilinkBacklinksResponse',
			ownPath: own.rel,
			refs: refs.map(r => ({ path: r.fromPath, name: r.fromName, count: r.count })),
		});
	}

	private async handleOpenWikilinkPath(input: MilkdownEditorInput, path: string, newSplit: boolean): Promise<void> {
		const roots = this.workspaceService.getWorkspace().folders;
		const root = roots[0]?.uri;
		if (!root || !path) return;
		try {
			await this.editorService.openEditor(
				{ resource: joinPath(root, path), options: { pinned: true, override: 'default' } },
				newSplit ? SIDE_GROUP : input.group,
			);
		} catch (err) {
			this.logService.error('[VSWord Milkdown] openWikilinkPath failed:', err);
		}
	}

	private async handleOpenWikilink(input: MilkdownEditorInput, target: string, newSplit: boolean): Promise<void> {
		const resolveIdx = await this.ensureWikilinkResolveIndex();
		const resolution = resolveWikilinkWithIndex(target, resolveIdx);
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
			this.invalidateWikilinkCaches();
			for (const live of this.liveInputs) {
				this.post(live, { type: 'workspaceIndexChanged' });
			}
		} catch (err) {
			this.logService.error('[VSWord Milkdown] wikilink create failed:', err);
		}
	}
}



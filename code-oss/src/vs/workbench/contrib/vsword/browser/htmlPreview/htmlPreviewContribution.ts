/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * RD-HTML-1 · HTML 源码 / 预览同页签切换。
 *
 * - 默认打开 *.html / *.htm → 文本编辑器（Monaco）
 * - 标题栏 / 命令「预览」→ 同 group 打开 HtmlPreviewInput
 * - 「源码」→ override=default 回到文本编辑器
 * - 预览读 ITextModel 当前缓冲（含 dirty），debounce 刷新
 */

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService, IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import {
	Extensions as ConfigExtensions,
	IConfigurationRegistry,
} from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputWithOptions } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import {
	IEditorResolverService,
	RegisteredEditorPriority,
} from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { asWebviewUri } from '../../../webview/common/webview.js';
import { buildHtmlPreviewDocument, sandboxForPreview } from './htmlPreviewContent.js';
import { getHtmlPreviewShellHtml } from './htmlPreviewHtml.js';
import { HtmlPreviewInput } from './htmlPreviewInput.js';
import {
	HostToHtmlPreviewMessage,
	HtmlPreviewToHostMessage,
	VSWORD_HTML_PREVIEW_ALLOW_SCRIPTS_CONFIG,
	VSWORD_HTML_PREVIEW_EDITOR_ID,
	VSWORD_HTML_PREVIEW_ORIGIN,
	VSWORD_HTML_SHOW_PREVIEW_ACTION_ID,
	VSWORD_HTML_SHOW_SOURCE_ACTION_ID,
	VSWORD_HTML_TOGGLE_PREVIEW_ACTION_ID,
	isHtmlFilePath,
} from './htmlPreviewProtocol.js';

const VSWORD_CATEGORY = localize2('vsword', 'VSWord');
const REFRESH_DEBOUNCE_MS = 200;

/** contribution 单例引用，供 Action2 调用。 */
let htmlPreviewContributionInstance: VswordHtmlPreviewContribution | undefined;

function canPreviewResource(resource: URI): boolean {
	if (
		resource.scheme !== Schemas.file
		&& resource.scheme !== Schemas.vscodeRemote
		&& resource.scheme !== Schemas.untitled
	) {
		return false;
	}
	const path = resource.path || '';
	return isHtmlFilePath(path);
}

function isHtmlLanguageId(languageId: string | undefined): boolean {
	return languageId === 'html' || languageId === 'handlebars' || languageId === 'razor';
}

// ---- configuration schema -------------------------------------------------

Registry.as<IConfigurationRegistry>(ConfigExtensions.Configuration).registerConfiguration({
	id: 'vsword.htmlPreview',
	order: 220,
	title: localize('vsword.htmlPreview.title', 'VSWord HTML 预览'),
	type: 'object',
	properties: {
		[VSWORD_HTML_PREVIEW_ALLOW_SCRIPTS_CONFIG]: {
			type: 'boolean',
			default: true,
			description: localize(
				'vsword.htmlPreview.allowScripts.desc',
				'预览 HTML 时是否允许运行页面内的 JavaScript。非受信工作区始终禁用。',
			),
		},
	},
});

// ---- contribution ----------------------------------------------------------

export class VswordHtmlPreviewContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.vsword.htmlPreview';

	private readonly liveInputs = new Set<HtmlPreviewInput>();

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceTrustManagementService private readonly workspaceTrust: IWorkspaceTrustManagementService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		htmlPreviewContributionInstance = this;
		this._register({ dispose: () => {
			if (htmlPreviewContributionInstance === this) {
				htmlPreviewContributionInstance = undefined;
			}
		} });

		this._register(editorResolverService.registerEditor(
			'*.{html,htm}',
			{
				id: VSWORD_HTML_PREVIEW_EDITOR_ID,
				label: localize('vsword.htmlPreview.editorLabel', 'VSWord HTML 预览'),
				detail: localize('vsword.htmlPreview.editorDetail', '在编辑器中预览 HTML'),
				priority: RegisteredEditorPriority.option,
			},
			{
				singlePerResource: true,
				canSupportResource: resource => canPreviewResource(resource),
			},
			{
				createEditorInput: (editorInput, group) => this.createEditorInput(editorInput.resource, group),
			},
		));
	}

	private createEditorInput(resource: URI, group: IEditorGroup): EditorInputWithOptions {
		const input = this.createPreviewInput(resource, group.id);
		this.ensureAttach(input);
		return { editor: input };
	}

	private createPreviewInput(resource: URI, groupId?: number): HtmlPreviewInput {
		const localRoots = this.collectLocalResourceRoots(resource);
		const webview = this.webviewService.createWebviewOverlay({
			providedViewType: VSWORD_HTML_PREVIEW_EDITOR_ID,
			extension: undefined,
			origin: VSWORD_HTML_PREVIEW_ORIGIN,
			title: basename(resource),
			options: {
				enableFindWidget: true,
				retainContextWhenHidden: true,
			},
			contentOptions: {
				allowScripts: true, // shell 脚本；用户 HTML 在 iframe sandbox 内
				localResourceRoots: localRoots,
			},
		});
		const input = this.instantiationService.createInstance(HtmlPreviewInput, resource, webview);
		if (typeof groupId === 'number') {
			input.updateGroup(groupId);
		}
		return input;
	}

	private collectLocalResourceRoots(resource: URI): URI[] {
		const roots: URI[] = [];
		if (resource.scheme !== Schemas.untitled) {
			roots.push(dirname(resource));
		}
		for (const folder of this.workspaceContext.getWorkspace().folders) {
			roots.push(folder.uri);
		}
		return roots;
	}

	private ensureAttach(input: HtmlPreviewInput): void {
		if (this.liveInputs.has(input)) {
			return;
		}
		this.attach(input);
	}

	private attach(input: HtmlPreviewInput): void {
		if (this.liveInputs.has(input)) {
			return;
		}
		const disposables = new DisposableStore();
		this.liveInputs.add(input);

		input.webview.setHtml(getHtmlPreviewShellHtml({
			fileName: basename(input.resource),
		}));

		const modelRef = new MutableDisposable<IReference<IResolvedTextEditorModel>>();
		const refreshTimer = new MutableDisposable();
		let webviewReady = false;
		let pendingRefresh = false;

		const scheduleRefresh = () => {
			const handle = setTimeout(() => {
				void this.pushContent(input);
			}, REFRESH_DEBOUNCE_MS);
			refreshTimer.value = { dispose: () => clearTimeout(handle) };
		};

		const bindModel = async () => {
			modelRef.clear();
			try {
				const ref = await this.textModelService.createModelReference(input.resource);
				if (input.isDisposed()) {
					ref.dispose();
					return;
				}
				modelRef.value = ref;
				disposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
					if (webviewReady) {
						scheduleRefresh();
					} else {
						pendingRefresh = true;
					}
				}));
			} catch (err) {
				this.logService.debug('[VSWord HTML Preview] model reference failed, fallback to file read', err);
			}
		};

		disposables.add(input.webview.onMessage(e => {
			const msg = e.message as HtmlPreviewToHostMessage;
			if (!msg || typeof msg.type !== 'string') {
				return;
			}
			if (msg.type === 'ready') {
				webviewReady = true;
				void this.pushContent(input).then(() => {
					if (pendingRefresh) {
						pendingRefresh = false;
						scheduleRefresh();
					}
				});
				return;
			}
			if (msg.type === 'showSource') {
				void this.openSource(input.resource, input.group);
			}
		}));

		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(VSWORD_HTML_PREVIEW_ALLOW_SCRIPTS_CONFIG) && webviewReady) {
				scheduleRefresh();
			}
		}));

		disposables.add(this.workspaceTrust.onDidChangeTrust(() => {
			if (webviewReady) {
				scheduleRefresh();
			}
		}));

		if (input.resource.scheme !== Schemas.untitled) {
			disposables.add(this.fileService.onDidFilesChange(e => {
				if (e.contains(input.resource) && webviewReady && !modelRef.value) {
					scheduleRefresh();
				}
			}));
		}

		void bindModel();

		disposables.add(input.onWillDispose(() => {
			this.liveInputs.delete(input);
			modelRef.dispose();
			refreshTimer.dispose();
			disposables.dispose();
		}));
	}

	private allowScriptsEffective(): boolean {
		const trusted = this.workspaceTrust.isWorkspaceTrusted();
		const cfg = this.configurationService.getValue<boolean>(VSWORD_HTML_PREVIEW_ALLOW_SCRIPTS_CONFIG);
		return trusted && cfg !== false;
	}

	private async readSourceText(resource: URI): Promise<string> {
		try {
			const ref = await this.textModelService.createModelReference(resource);
			try {
				return ref.object.textEditorModel.getValue();
			} finally {
				ref.dispose();
			}
		} catch {
			// fall through
		}
		if (resource.scheme === Schemas.untitled) {
			return '';
		}
		const file = await this.fileService.readFile(resource);
		return file.value.toString();
	}

	private async pushContent(input: HtmlPreviewInput): Promise<void> {
		if (input.isDisposed()) {
			return;
		}
		try {
			const source = await this.readSourceText(input.resource);
			const allowScripts = this.allowScriptsEffective();
			const baseHref = input.resource.scheme === Schemas.untitled
				? ''
				: asWebviewUri(dirname(input.resource)).toString(true) + '/';
			const html = buildHtmlPreviewDocument({
				source,
				baseHref,
				allowScripts,
			});
			const msg: HostToHtmlPreviewMessage = {
				type: 'setContent',
				html,
				sandbox: sandboxForPreview(allowScripts),
				fileName: basename(input.resource),
			};
			input.webview.postMessage(msg);
		} catch (err) {
			this.logService.error('[VSWord HTML Preview] pushContent failed', err);
		}
	}

	/** 打开预览（同 group）。已有同 URI 预览页签则复用，避免重复创建 webview。 */
	async openPreview(resource: URI, group?: IEditorGroup | number): Promise<void> {
		const resourceKey = resource.toString();
		for (const editor of this.editorService.editors) {
			if (editor instanceof HtmlPreviewInput && editor.resource.toString() === resourceKey) {
				await this.editorService.openEditor(editor, { pinned: true }, group);
				await this.pushContent(editor);
				return;
			}
		}
		const input = this.createPreviewInput(resource, typeof group === 'number' ? group : group?.id);
		this.ensureAttach(input);
		await this.editorService.openEditor(input, { pinned: true }, group);
	}

	/** 回到源码文本编辑器。 */
	async openSource(resource: URI, group?: IEditorGroup | number): Promise<void> {
		await this.editorService.openEditor({
			resource,
			options: {
				override: DEFAULT_EDITOR_ASSOCIATION.id,
				pinned: true,
			},
		}, group);
	}

	/** 切换源码 ↔ 预览。 */
	async toggle(resource: URI, group?: IEditorGroup | number): Promise<void> {
		const active = this.editorService.activeEditor;
		if (active instanceof HtmlPreviewInput && active.resource.toString() === resource.toString()) {
			await this.openSource(resource, group ?? active.group);
			return;
		}
		await this.openPreview(resource, group);
	}
}

// ---- helpers for actions ---------------------------------------------------

function resolveHtmlResource(accessor: ServicesAccessor): URI | undefined {
	const editorService = accessor.get(IEditorService);
	const active = editorService.activeEditor;
	if (active instanceof HtmlPreviewInput) {
		return active.resource;
	}
	const uri = active?.resource;
	if (uri && canPreviewResource(uri)) {
		return uri;
	}
	const pane = editorService.activeEditorPane;
	const control = pane?.getControl() as { getModel?: () => { uri: URI; getLanguageId?: () => string } | null } | undefined;
	const model = control?.getModel?.();
	if (model?.uri && isHtmlLanguageId(model.getLanguageId?.())) {
		return model.uri;
	}
	return undefined;
}

// ---- actions ---------------------------------------------------------------

const htmlResourceWhen = ContextKeyExpr.or(
	ContextKeyExpr.equals('editorLangId', 'html'),
	ContextKeyExpr.regex('resourceExtname', /\.html?$/i),
);

const previewActiveWhen = ContextKeyExpr.equals('activeWebviewPanelId', VSWORD_HTML_PREVIEW_EDITOR_ID);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VSWORD_HTML_TOGGLE_PREVIEW_ACTION_ID,
			title: localize2('vsword.html.togglePreview', '切换 HTML 源码/预览'),
			category: VSWORD_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
				when: ContextKeyExpr.or(htmlResourceWhen, previewActiveWhen),
			},
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const resource = resolveHtmlResource(accessor);
		const notification = accessor.get(INotificationService);
		const contrib = htmlPreviewContributionInstance;
		if (!resource || !contrib) {
			notification.info(localize('vsword.html.noHtml', '请先打开 HTML 文件。'));
			return;
		}
		await contrib.toggle(resource, accessor.get(IEditorService).activeEditorPane?.group);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VSWORD_HTML_SHOW_PREVIEW_ACTION_ID,
			title: localize2('vsword.html.showPreview', '预览 HTML'),
			category: VSWORD_CATEGORY,
			f1: true,
			icon: Codicon.openPreview,
			precondition: ContextKeyExpr.or(htmlResourceWhen, previewActiveWhen),
			menu: [
				{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(htmlResourceWhen, previewActiveWhen.negate()),
				},
			],
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const resource = resolveHtmlResource(accessor);
		const notification = accessor.get(INotificationService);
		const contrib = htmlPreviewContributionInstance;
		if (!resource || !contrib) {
			notification.info(localize('vsword.html.noHtml', '请先打开 HTML 文件。'));
			return;
		}
		await contrib.openPreview(resource, accessor.get(IEditorService).activeEditorPane?.group);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VSWORD_HTML_SHOW_SOURCE_ACTION_ID,
			title: localize2('vsword.html.showSource', '显示 HTML 源码'),
			category: VSWORD_CATEGORY,
			f1: true,
			icon: Codicon.fileCode,
			menu: [
				{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 1,
					when: previewActiveWhen,
				},
			],
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const resource = resolveHtmlResource(accessor);
		const notification = accessor.get(INotificationService);
		const contrib = htmlPreviewContributionInstance;
		if (!resource || !contrib) {
			notification.info(localize('vsword.html.noHtml', '请先打开 HTML 文件。'));
			return;
		}
		await contrib.openSource(resource, accessor.get(IEditorService).activeEditorPane?.group);
	}
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExplorerService } from '../../files/browser/files.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { markdownToMindmapXml, mindmapToMarkdownOutline } from '../common/mindmapMarkdown.js';
import { addMindmapNodeIcon, addMindmapSummary, appendMindmapArrowlink, appendMindmapChild, appendMindmapSibling, MindmapArrowlinkPatch, MindmapEdgePatch, MindmapFontPatch, moveMindmapNode, NewMindmapArrowlinkOptions, parseMindmapXml, removeMindmapArrowlink, removeMindmapNode, removeMindmapNodeIcon, removeMindmapSummary, setMindmapNodeBackgroundColor, setMindmapNodeColor, setMindmapNodeEdge, setMindmapNodeFolded, setMindmapNodeFont, updateMindmapArrowlink, updateMindmapNodeText, updateMindmapSummary, VSWordMindmapNode } from '../common/mindmapXml.js';
import { getMindmapHtml } from './mindmapHtml.js';

const MINDMAP_VIEW_TYPE_PREFIX = 'vsword.mindmap';
const VSWORD_CATEGORY = localize2('vsword', 'VSWord');

class MindmapEditorManager extends Disposable {
	constructor(
		private readonly fileUri: URI,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async openMindmap(): Promise<void> {
		const viewType = getMindmapViewType(this.fileUri);
		const title = '🧠 ' + basename(this.fileUri);

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
				origin: 'vsword-mindmap',
				title,
				options: { enableFindWidget: true, retainContextWhenHidden: true },
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [],
				},
			},
			viewType,
			title,
			undefined,
			{ preserveFocus: false }
		);

		try {
			const content = await this.fileService.readFile(this.fileUri);
			const xml = content.value.toString();
			const document = parseMindmapXml(xml);
			input.webview.setHtml(getMindmapHtml({
				fileName: basename(this.fileUri),
				root: document.root,
				sourceXml: xml,
				nodeCount: document.root ? countNodes(document.root) : 0,
				sourceKind: 'mm',
				editable: true,
			}));
			this._register(input.webview.onMessage(async (e) => {
				await this.handleMessage(e.message, input.webview);
			}));
		} catch (err) {
			this.logService.error('[VSWord Mindmap] failed to open .mm:', err);
			input.webview.setHtml(getMindmapHtml({
				fileName: basename(this.fileUri),
				root: undefined,
				sourceXml: '',
				nodeCount: 0,
				sourceKind: 'mm',
				editable: false,
			}));
		}
	}

	private async handleMessage(msg: any, webview: any): Promise<void> {
		if (!msg || typeof msg.type !== 'string') {
			return;
		}
		switch (msg.type) {
			case 'updateNodeText':
				await this.handleUpdateNodeText(msg, webview);
				return;
			case 'appendChild':
				await this.handleAppendChild(msg, webview);
				return;
			case 'appendSibling':
				await this.handleAppendSibling(msg, webview);
				return;
			case 'removeNode':
				await this.handleRemoveNode(msg, webview);
				return;
			case 'moveNode':
				await this.handleMoveNode(msg, webview);
				return;
			case 'toggleFolded':
				await this.handleToggleFolded(msg, webview);
				return;
			case 'toggleIcon':
				await this.handleToggleIcon(msg, webview);
				return;
			case 'setColor':
				await this.handleSetColor(msg, webview);
				return;
			case 'setBackgroundColor':
				await this.handleSetBackgroundColor(msg, webview);
				return;
			case 'setFont':
				await this.handleSetFont(msg, webview);
				return;
			case 'setEdge':
				await this.handleSetEdge(msg, webview);
				return;
			case 'createArrowlink':
				await this.handleCreateArrowlink(msg, webview);
				return;
			case 'updateArrowlink':
			case 'setArrowlinkEndpoint':
				await this.handleUpdateArrowlink(msg, webview);
				return;
			case 'removeArrowlink':
				await this.handleRemoveArrowlink(msg, webview);
				return;
			case 'createSummary':
				await this.handleCreateSummary(msg, webview);
				return;
			case 'updateSummary':
				await this.handleUpdateSummary(msg, webview);
				return;
			case 'removeSummary':
				await this.handleRemoveSummary(msg, webview);
				return;
			case 'webviewError':
				this.logService.error(
					'[VSWord Mindmap] webview error [' + String(msg.prefix || '?') + ']: ' + String(msg.message || ''));
				return;
		}
	}

	private async handleUpdateNodeText(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		const text = String(msg.text ?? '').trim();
		if (!nodeId || !text) {
			webview.postMessage({ type: 'nodeTextUpdated', requestId, ok: false });
			return;
		}

		try {
			const content = await this.fileService.readFile(this.fileUri);
			const oldXml = content.value.toString();
			const newXml = updateMindmapNodeText(oldXml, nodeId, text);
			if (newXml === oldXml) {
				webview.postMessage({ type: 'nodeTextUpdated', requestId, ok: false });
				return;
			}
			await this.fileService.writeFile(this.fileUri, VSBuffer.fromString(newXml));
			webview.postMessage({ type: 'nodeTextUpdated', requestId, ok: true });
		} catch (err) {
			this.logService.error('[VSWord Mindmap] failed to update node text:', err);
			webview.postMessage({ type: 'nodeTextUpdated', requestId, ok: false });
		}
	}

	private async handleAppendChild(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const parentId = String(msg.parentId ?? '');
		const text = String(msg.text ?? '').trim() || 'New topic';
		if (!parentId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => {
			const newId = newMindmapNodeId();
			return { xml: appendMindmapChild(oldXml, parentId, { newId, text }), newId };
		});
	}

	private async handleAppendSibling(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const siblingId = String(msg.siblingId ?? '');
		const text = String(msg.text ?? '').trim() || 'New topic';
		const position: 'left' | 'right' | undefined = msg.position === 'left' || msg.position === 'right' ? msg.position : undefined;
		const siblingPlacement: 'before' | 'after' | undefined = msg.siblingPlacement === 'before' || msg.siblingPlacement === 'after' ? msg.siblingPlacement : undefined;
		if (!siblingId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => {
			const newId = newMindmapNodeId();
			return { xml: appendMindmapSibling(oldXml, siblingId, { newId, text, position, siblingPlacement }), newId };
		});
	}

	private async handleRemoveNode(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		if (!nodeId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({ xml: removeMindmapNode(oldXml, nodeId) }));
	}

	private async handleMoveNode(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		const parentId = String(msg.parentId ?? '');
		const siblingId = typeof msg.siblingId === 'string' ? msg.siblingId : undefined;
		const placement = msg.placement === 'inside' || msg.placement === 'before' || msg.placement === 'after' ? msg.placement : undefined;
		if (!nodeId || !parentId || !placement) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: moveMindmapNode(oldXml, nodeId, { parentId, siblingId, placement }),
			newId: nodeId,
		}));
	}

	private async handleToggleFolded(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		const folded = Boolean(msg.folded);
		if (!nodeId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({ xml: setMindmapNodeFolded(oldXml, nodeId, folded), newId: nodeId }));
	}

	private async handleToggleIcon(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		const icon = String(msg.icon ?? '').trim();
		const add = Boolean(msg.add);
		if (!nodeId || !icon) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: add ? addMindmapNodeIcon(oldXml, nodeId, icon) : removeMindmapNodeIcon(oldXml, nodeId, icon),
			newId: nodeId,
		}));
	}

	private async handleSetColor(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		if (!nodeId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const color = parseNullableColor(msg.color);
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: setMindmapNodeColor(oldXml, nodeId, color),
			newId: nodeId,
		}));
	}

	private async handleSetBackgroundColor(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		if (!nodeId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const color = parseNullableColor(msg.color);
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: setMindmapNodeBackgroundColor(oldXml, nodeId, color),
			newId: nodeId,
		}));
	}

	private async handleSetFont(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		if (!nodeId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const patch: MindmapFontPatch = {};
		if (msg && typeof msg === 'object') {
			if ('name' in msg) { (patch as any).name = msg.name === null ? null : (typeof msg.name === 'string' ? msg.name : undefined); }
			if ('size' in msg) {
				if (msg.size === null) { (patch as any).size = null; }
				else if (typeof msg.size === 'number' && Number.isFinite(msg.size)) { (patch as any).size = Math.max(6, Math.min(96, Math.round(msg.size))); }
			}
			if ('bold' in msg) { (patch as any).bold = msg.bold === null ? null : Boolean(msg.bold); }
			if ('italic' in msg) { (patch as any).italic = msg.italic === null ? null : Boolean(msg.italic); }
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: setMindmapNodeFont(oldXml, nodeId, patch),
			newId: nodeId,
		}));
	}

	private async handleSetEdge(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const nodeId = String(msg.nodeId ?? '');
		if (!nodeId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const EDGE_STYLE_ALLOWED = new Set(['linear', 'bezier', 'sharp_linear', 'sharp_bezier', 'hide_edge']);
		const EDGE_WIDTH_NAMED = new Set(['thin']);
		const patch: MindmapEdgePatch = {};
		if (msg && typeof msg === 'object') {
			if ('color' in msg) {
				const color = parseNullableColor(msg.color);
				if (color !== undefined) { (patch as any).color = color; }
			}
			if ('width' in msg) {
				if (msg.width === null) {
					(patch as any).width = null;
				} else if (typeof msg.width === 'number' && Number.isFinite(msg.width)) {
					(patch as any).width = String(Math.max(1, Math.min(8, Math.round(msg.width))));
				} else if (typeof msg.width === 'string' && EDGE_WIDTH_NAMED.has(msg.width)) {
					(patch as any).width = msg.width;
				}
			}
			if ('style' in msg) {
				if (msg.style === null) {
					(patch as any).style = null;
				} else if (typeof msg.style === 'string' && EDGE_STYLE_ALLOWED.has(msg.style)) {
					(patch as any).style = msg.style;
				}
			}
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: setMindmapNodeEdge(oldXml, nodeId, patch),
			newId: nodeId,
		}));
	}

	private async handleCreateArrowlink(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const sourceId = String(msg.sourceId ?? '');
		const destination = String(msg.destination ?? '');
		if (!sourceId || !destination || sourceId === destination) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const options: NewMindmapArrowlinkOptions = { newId: newArrowlinkId(), destination };
		if (msg && typeof msg === 'object') {
			if (msg.startArrow === 'None' || msg.startArrow === 'Default') { (options as any).startArrow = msg.startArrow; }
			if (msg.endArrow === 'None' || msg.endArrow === 'Default') { (options as any).endArrow = msg.endArrow; }
			if (typeof msg.color === 'string') {
				const color = parseNullableColor(msg.color);
				if (color !== null && color !== undefined) { (options as any).color = color; }
			}
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: appendMindmapArrowlink(oldXml, sourceId, options),
			newId: sourceId,
		}));
	}

	private async handleUpdateArrowlink(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const arrowlinkId = String(msg.arrowlinkId ?? '');
		if (!arrowlinkId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const patch: MindmapArrowlinkPatch = {};
		if (msg && typeof msg === 'object') {
			if ('destination' in msg && typeof msg.destination === 'string' && msg.destination) {
				(patch as any).destination = msg.destination;
			}
			if ('startArrow' in msg) {
				if (msg.startArrow === null) { (patch as any).startArrow = null; }
				else if (msg.startArrow === 'None' || msg.startArrow === 'Default') { (patch as any).startArrow = msg.startArrow; }
			}
			if ('endArrow' in msg) {
				if (msg.endArrow === null) { (patch as any).endArrow = null; }
				else if (msg.endArrow === 'None' || msg.endArrow === 'Default') { (patch as any).endArrow = msg.endArrow; }
			}
			if ('color' in msg) {
				const color = parseNullableColor(msg.color);
				if (color !== undefined) { (patch as any).color = color; }
			}
			if ('style' in msg) {
				if (msg.style === null) { (patch as any).style = null; }
				else if (typeof msg.style === 'string' && msg.style) { (patch as any).style = msg.style; }
			}
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: updateMindmapArrowlink(oldXml, arrowlinkId, patch),
		}));
	}

	private async handleRemoveArrowlink(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const arrowlinkId = String(msg.arrowlinkId ?? '');
		if (!arrowlinkId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: removeMindmapArrowlink(oldXml, arrowlinkId),
		}));
	}

	private async handleCreateSummary(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const parentId = String(msg.parentId ?? '');
		if (!parentId || typeof msg.start !== 'number' || typeof msg.end !== 'number') {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const summaryId = String(msg.id || `vsword-summary-${Date.now()}`);
		const label = String(msg.label || 'Summary');
		const patch = {
			id: summaryId,
			label: label,
			start: msg.start,
			end: msg.end,
			style: msg.style
		};
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: addMindmapSummary(oldXml, parentId, patch),
			newId: summaryId
		}));
	}

	private async handleUpdateSummary(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const parentId = String(msg.parentId ?? '');
		const summaryId = String(msg.summaryId ?? '');
		if (!parentId || !summaryId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		const patch: any = {};
		if ('label' in msg) { patch.label = msg.label; }
		if ('style' in msg) { patch.style = msg.style; }
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: updateMindmapSummary(oldXml, parentId, summaryId, patch),
		}));
	}

	private async handleRemoveSummary(msg: any, webview: any): Promise<void> {
		const requestId = String(msg.requestId ?? '');
		const parentId = String(msg.parentId ?? '');
		const summaryId = String(msg.summaryId ?? '');
		if (!parentId || !summaryId) {
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
			return;
		}
		await this.mutateAndRender(webview, requestId, oldXml => ({
			xml: removeMindmapSummary(oldXml, parentId, summaryId),
		}));
	}

	private async mutateAndRender(webview: any, requestId: string, mutate: (xml: string) => { xml: string; newId?: string }): Promise<void> {
		try {
			const content = await this.fileService.readFile(this.fileUri);
			const oldXml = content.value.toString();
			const result = mutate(oldXml);
			if (result.xml === oldXml) {
				webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
				return;
			}
			await this.fileService.writeFile(this.fileUri, VSBuffer.fromString(result.xml));
			const document = parseMindmapXml(result.xml);
			webview.setHtml(getMindmapHtml({
				fileName: basename(this.fileUri),
				root: document.root,
				sourceXml: result.xml,
				nodeCount: document.root ? countNodes(document.root) : 0,
				sourceKind: 'mm',
				editable: true,
				selectedNodeId: result.newId,
			}));
		} catch (err) {
			this.logService.error('[VSWord Mindmap] failed to mutate structure:', err);
			webview.postMessage({ type: 'structureUpdated', requestId, ok: false });
		}
	}
}

class VswordOpenMindmapAction extends Action2 {
	static readonly ID = 'vsword.actions.openMindmap';

	constructor() {
		super({
			id: VswordOpenMindmapAction.ID,
			title: localize2('vswordOpenMindmap', 'Open as Mindmap'),
			category: VSWORD_CATEGORY,
			f1: false,
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: 'navigation',
					order: 29,
					when: ContextKeyExpr.equals('resourceExtname', '.mm'),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, resource?: URI | { resource: URI }): Promise<void> {
		const fileUri = getResourceUri(resource);
		if (!fileUri || fileUri.path.toLowerCase().endsWith('.mm') === false) {
			return;
		}

		const instantiationService = accessor.get(IInstantiationService);
		const explorerService = accessor.get(IExplorerService);
		const logService = accessor.get(ILogService);
		const manager = instantiationService.createInstance(MindmapEditorManager, fileUri);
		await manager.openMindmap();

		try {
			await explorerService.select(fileUri, true);
		} catch (err) {
			logService.debug('[VSWord Mindmap] explorer select failed: ' + err);
		}
	}
}

function getResourceUri(resource?: URI | { resource: URI }): URI | undefined {
	if (!resource) {
		return undefined;
	}
	if (URI.isUri(resource)) {
		return resource;
	}
	if (typeof resource === 'object' && 'resource' in resource && URI.isUri((resource as any).resource)) {
		return (resource as any).resource;
	}
	return undefined;
}

function getMindmapViewType(fileUri: URI): string {
	return MINDMAP_VIEW_TYPE_PREFIX + ':' + fileUri.toString();
}

function countNodes(root: VSWordMindmapNode): number {
	let count = 1;
	for (const child of root.children) {
		count += countNodes(child);
	}
	return count;
}

function newMindmapNodeId(): string {
	const randomPart = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
	return 'vsword-' + Date.now().toString(36) + '-' + randomPart;
}

function newArrowlinkId(): string {
	const randomPart = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
	return 'vsword-al-' + Date.now().toString(36) + '-' + randomPart;
}

function parseNullableColor(raw: unknown): string | null {
	if (raw === null) {
		return null;
	}
	if (typeof raw !== 'string') {
		return null;
	}
	const value = raw.trim();
	if (!value) {
		return null;
	}
	// Allow #rgb / #rrggbb / #rrggbbaa hex strings only.
	if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
		return null;
	}
	return value;
}

/**
 * RD-9.1 · 从当前编辑器 Markdown 大纲生成 `.mm` 并打开 Mindmap。
 * 有损导入：ATX 标题 + 列表缩进结构 → FreeMind 树。
 */
class VswordMarkdownOutlineToMindmapAction extends Action2 {
	static readonly ID = 'vsword.actions.markdownOutlineToMindmap';

	constructor() {
		super({
			id: VswordMarkdownOutlineToMindmapAction.ID,
			title: localize2('vswordMarkdownToMindmap', 'VSWord: Markdown Outline to Mindmap (.mm)'),
			category: VSWORD_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const notification = accessor.get(INotificationService);
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);

		const codeEditor = getCodeEditor(editorService.activeTextEditorControl);
		const model = codeEditor?.getModel();
		if (!model) {
			notification.info(localize('vsword.mindmap.noEditor', '请先打开含标题或列表大纲的 Markdown / 文本编辑器。'));
			return;
		}
		const text = model.getValue();
		const xml = markdownToMindmapXml(text);
		if (!xml) {
			notification.info(localize('vsword.mindmap.noOutline', '未找到大纲（支持 # 标题 或 - / * / 1. 列表）。'));
			return;
		}

		const src = model.uri;
		if (src.scheme !== 'file') {
			notification.info(localize('vsword.mindmap.saveFirst', '请先将 Markdown 保存到磁盘后再执行本命令。'));
			return;
		}
		const base = basename(src).replace(/\.[^.]+$/, '') || 'outline';
		let target = joinPath(dirname(src), `${base}.mm`);
		// Avoid silent overwrite
		if (await fileService.exists(target)) {
			const stamp = Date.now().toString(36);
			target = joinPath(dirname(src), `${base}-${stamp}.mm`);
		}

		try {
			await fileService.writeFile(target, VSBuffer.fromString(xml));
			const manager = instantiationService.createInstance(MindmapEditorManager, target);
			await manager.openMindmap();
			notification.info(localize('vsword.mindmap.created', '已创建思维导图：{0}', basename(target)));
		} catch (err) {
			logService.error('[VSWord Mindmap] markdown→.mm failed:', err);
			notification.error(localize('vsword.mindmap.createFailed', '创建 .mm 失败：{0}', String(err)));
		}
	}
}

/**
 * RD-9.1c · 将当前 `.mm` 导出为 Markdown 标题大纲（有损）。
 * 来源：Explorer 选中 / 命令参数 / 活动文本编辑器中的 .mm。
 */
class VswordMindmapToMarkdownOutlineAction extends Action2 {
	static readonly ID = 'vsword.actions.mindmapToMarkdownOutline';

	constructor() {
		super({
			id: VswordMindmapToMarkdownOutlineAction.ID,
			title: localize2('vswordMindmapToMarkdown', 'VSWord: Mindmap to Markdown Outline'),
			category: VSWORD_CATEGORY,
			f1: true,
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: 'navigation',
					order: 30,
					when: ContextKeyExpr.equals('resourceExtname', '.mm'),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, resource?: URI | { resource: URI }): Promise<void> {
		const fileService = accessor.get(IFileService);
		const notification = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);
		const explorerService = accessor.get(IExplorerService);

		let fileUri = getResourceUri(resource);
		if (!fileUri) {
			const codeEditor = getCodeEditor(editorService.activeTextEditorControl);
			const model = codeEditor?.getModel();
			if (model?.uri.scheme === 'file' && model.uri.path.toLowerCase().endsWith('.mm')) {
				fileUri = model.uri;
			}
		}
		if (!fileUri || fileUri.path.toLowerCase().endsWith('.mm') === false) {
			notification.info(localize('vsword.mindmap.exportNeedMm', '请选择或打开一个 .mm 文件后再导出 Markdown 大纲。'));
			return;
		}

		try {
			const content = await fileService.readFile(fileUri);
			const doc = parseMindmapXml(content.value.toString());
			if (!doc.root) {
				notification.info(localize('vsword.mindmap.exportEmpty', '该 .mm 无有效根节点，无法导出。'));
				return;
			}
			const md = mindmapToMarkdownOutline(doc.root);
			const base = basename(fileUri).replace(/\.mm$/i, '') || 'mindmap';
			let target = joinPath(dirname(fileUri), `${base}.outline.md`);
			if (await fileService.exists(target)) {
				const stamp = Date.now().toString(36);
				target = joinPath(dirname(fileUri), `${base}.outline-${stamp}.md`);
			}
			await fileService.writeFile(target, VSBuffer.fromString(md));
			await editorService.openEditor({ resource: target, options: { pinned: true } });
			try {
				await explorerService.select(target, true);
			} catch (err) {
				logService.debug('[VSWord Mindmap] explorer select after export failed: ' + err);
			}
			notification.info(localize('vsword.mindmap.exportOk', '已导出 Markdown 大纲：{0}（有损，不含图标/颜色/关系线）', basename(target)));
		} catch (err) {
			logService.error('[VSWord Mindmap] .mm→Markdown failed:', err);
			notification.error(localize('vsword.mindmap.exportFailed', '导出 Markdown 失败：{0}', String(err)));
		}
	}
}

registerAction2(VswordOpenMindmapAction);
registerAction2(VswordMarkdownOutlineToMindmapAction);
registerAction2(VswordMindmapToMarkdownOutlineAction);

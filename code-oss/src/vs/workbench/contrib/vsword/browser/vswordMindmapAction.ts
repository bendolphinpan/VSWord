/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExplorerService } from '../../files/browser/files.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { addMindmapNodeIcon, appendMindmapArrowlink, appendMindmapChild, appendMindmapSibling, MindmapArrowlinkPatch, MindmapEdgePatch, MindmapFontPatch, moveMindmapNode, NewMindmapArrowlinkOptions, parseMindmapXml, removeMindmapArrowlink, removeMindmapNode, removeMindmapNodeIcon, setMindmapNodeBackgroundColor, setMindmapNodeColor, setMindmapNodeEdge, setMindmapNodeFolded, setMindmapNodeFont, updateMindmapArrowlink, updateMindmapNodeText, VSWordMindmapNode } from '../common/mindmapXml.js';
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

registerAction2(VswordOpenMindmapAction);

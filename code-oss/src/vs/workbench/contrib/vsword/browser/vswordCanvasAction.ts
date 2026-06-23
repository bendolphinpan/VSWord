/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWebviewService, WebviewInitInfo } from '../../webview/browser/webview.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { getCanvasHtml } from './canvasHtml.js';
import { VSWordCanvasService } from '../common/canvasService.js';
import { CanvasNode } from '../common/canvasTypes.js';

const CANVAS_VIEW_TYPE_PREFIX = 'vsword.canvas';

/**
 * Manages one Canvas webview editor instance bound to a folder URI.
 *
 * A separate manager (and tab) is created per folder, so opening sub-folders
 * via "drill in" or via the Explorer context menu produces distinct canvases.
 */
class CanvasEditorManager extends Disposable {

	constructor(
		private readonly folderUri: URI,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	openCanvas(): void {
		const viewType = CANVAS_VIEW_TYPE_PREFIX + ':' + this.folderUri.toString();
		const title = '🗺 ' + (this.folderUri.path.split('/').filter(Boolean).pop() || 'Canvas');

		// Reveal if already open
		const existing = this.editorService.getEditors(0 /* active group */)
			.find(e => e.editor.editorId === viewType);
		if (existing) {
			this.editorService.openEditor(existing.editor, { pinned: true });
			return;
		}

		const canvasService = this.instantiationService.createInstance(VSWordCanvasService);
		canvasService.setFolder(this.folderUri);

		const initInfo: WebviewInitInfo = {
			providedViewType: viewType,
			extension: undefined,
			origin: 'vsword-canvas',
			title,
			options: { enableFindWidget: true, retainContextWhenHidden: true },
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [],
			},
		};

		const webview = this.webviewService.createWebviewOverlay(initInfo);
		webview.setHtml(getCanvasHtml());

		this.webviewWorkbenchService.openWebview(
			initInfo,
			viewType,
			title,
			undefined,
			{ preserveFocus: false }
		);

		const msgDisposable = webview.onMessage(async (e) => {
			try {
				await this.handleMessage(e.message, webview, canvasService);
			} catch (err) {
				this.logService.error('[VSWord Canvas] Message handler error:', err);
			}
		});
		this._register(msgDisposable);
	}

	private async handleMessage(msg: any, webview: any, canvasService: VSWordCanvasService): Promise<void> {
		switch (msg.type) {
			case 'ready': {
				const doc = await canvasService.loadCanvas();
				webview.postMessage({ type: 'init', canvas: doc });
				break;
			}
			case 'nodesMoved': {
				const doc = await canvasService.loadCanvas();
				for (const moved of msg.nodes) {
					const node = doc.nodes.find((n: CanvasNode) => n.id === moved.id);
					if (node) {
						node.x = moved.x;
						node.y = moved.y;
					}
				}
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'viewportChanged': {
				const doc = await canvasService.loadCanvas();
				doc.viewport = msg.viewport;
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'openFile': {
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find((n: CanvasNode) => n.id === msg.nodeId);
				if (node && node.type === 'file') {
					const fileUri = canvasService.resolveFilePath(node.filePath);
					if (fileUri) {
						await this.editorService.openEditor({ resource: fileUri, options: { pinned: true } });
					}
				}
				break;
			}
			case 'openSubCanvas': {
				// Drill into a sub-folder by spawning a new CanvasEditorManager.
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find((n: CanvasNode) => n.id === msg.nodeId);
				if (node && node.type === 'folder') {
					const subFolderUri = canvasService.resolveFilePath(node.folderPath);
					if (subFolderUri) {
						const subManager = this.instantiationService.createInstance(CanvasEditorManager, subFolderUri);
						subManager.openCanvas();
					}
				}
				break;
			}
			case 'edgeCreated': {
				const doc = await canvasService.loadCanvas();
				doc.edges.push(msg.edge);
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'edgeDeleted': {
				const doc = await canvasService.loadCanvas();
				doc.edges = doc.edges.filter((e: any) => e.id !== msg.edgeId);
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'loadFileContent': {
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find((n: CanvasNode) => n.id === msg.nodeId);
				if (node && node.type === 'file') {
					const content = await canvasService.readFileContent(node.filePath);
					webview.postMessage({ type: 'fileContent', nodeId: msg.nodeId, content: content || '' });
				}
				break;
			}
			case 'saveFileContent': {
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find((n: CanvasNode) => n.id === msg.nodeId);
				if (node && node.type === 'file') {
					const ok = await canvasService.writeFileContent(node.filePath, msg.content);
					webview.postMessage({ type: 'fileSaved', nodeId: msg.nodeId, ok });
				}
				break;
			}
			case 'nodeCreated': {
				const doc = await canvasService.loadCanvas();
				doc.nodes.push(msg.node);
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'nodeUpdated': {
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find((n: CanvasNode) => n.id === msg.node.id);
				if (node) {
					Object.assign(node, msg.node);
					await canvasService.saveCanvas(doc);
				}
				break;
			}
			case 'nodeDeleted': {
				const doc = await canvasService.loadCanvas();
				doc.nodes = doc.nodes.filter((n: CanvasNode) => n.id !== msg.nodeId);
				for (const n of doc.nodes) {
					if (n.parentId === msg.nodeId) n.parentId = null;
				}
				doc.edges = doc.edges.filter((e: any) => e.from !== msg.nodeId && e.to !== msg.nodeId);
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'nodeParentChanged': {
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find((n: CanvasNode) => n.id === msg.nodeId);
				if (node) {
					node.parentId = msg.parentId;
					await canvasService.saveCanvas(doc);
				}
				break;
			}
		}
	}
}

/**
 * "Open Canvas" — from the command palette. Uses first workspace folder.
 */
export class VswordOpenCanvasAction extends Action2 {
	static readonly ID = 'vsword.actions.openCanvas';

	constructor() {
		super({
			id: VswordOpenCanvasAction.ID,
			title: localize2('vswordOpenCanvas', 'VSWord: Open Folder as Canvas'),
			category: localize2('vsword', 'VSWord'),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const folders = workspaceService.getWorkspace().folders;
		if (folders.length === 0) return;
		const manager = instantiationService.createInstance(CanvasEditorManager, folders[0].uri);
		manager.openCanvas();
	}
}

/**
 * "Open Folder as Canvas" — from the Explorer context menu on a folder,
 * or from the inline folder action.
 *
 * The Explorer passes the clicked resource as the first run() argument.
 */
export class VswordOpenFolderAsCanvasAction extends Action2 {
	static readonly ID = 'vsword.actions.openFolderAsCanvas';

	constructor() {
		super({
			id: VswordOpenFolderAsCanvasAction.ID,
			title: localize2('vswordOpenFolderAsCanvas', 'Open as Canvas'),
			category: localize2('vsword', 'VSWord'),
			f1: false,
			icon: { id: 'symbol-color' },
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: 'navigation',
					order: 30,
					when: ContextKeyExpr.equals('explorerResourceIsFolder', true),
				},
				{
					id: MenuId.ExplorerContext,
					group: 'inline',
					order: 30,
					when: ContextKeyExpr.equals('explorerResourceIsFolder', true),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, resource?: URI | { resource: URI }): Promise<void> {
		const logService = accessor.get(ILogService);
		const instantiationService = accessor.get(IInstantiationService);
		const workspaceService = accessor.get(IWorkspaceContextService);

		// Resource may arrive as URI or { resource: URI }
		let folderUri: URI | undefined;
		if (resource) {
			if (resource instanceof URI) {
				folderUri = resource;
			} else if (typeof resource === 'object' && 'resource' in resource) {
				folderUri = (resource as any).resource;
			}
		}
		if (!folderUri) {
			const folders = workspaceService.getWorkspace().folders;
			if (folders.length === 0) {
				logService.warn('[VSWord Canvas] no folder URI and no workspace');
				return;
			}
			folderUri = folders[0].uri;
		}
		const manager = instantiationService.createInstance(CanvasEditorManager, folderUri);
		manager.openCanvas();
	}
}

registerAction2(VswordOpenCanvasAction);
registerAction2(VswordOpenFolderAsCanvasAction);

// Suppress unused warning for localize (kept for future i18n strings).
void localize;

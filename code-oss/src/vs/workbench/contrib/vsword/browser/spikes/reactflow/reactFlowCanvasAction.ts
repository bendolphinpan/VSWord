/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IExplorerService } from '../../../../files/browser/files.js';
import { IWebviewWorkbenchService } from '../../../../webviewPanel/browser/webviewWorkbenchService.js';
import { CanvasEdge, CanvasNode } from '../../../common/canvasTypes.js';
import { VSWordCanvasService } from '../../../common/canvasService.js';
import { getReactFlowCanvasHtml } from './reactFlowCanvasHtml.js';

const VIEW_TYPE_PREFIX = 'vsword.dev.reactFlowCanvas';
const COMMAND_ID = 'vsword.dev.openReactFlowFolderCanvas';

class ReactFlowFolderCanvasManager {
	constructor(
		private readonly folderUri: URI,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) { }

	open(): void {
		const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/spikes/reactflow/vendor');
		const scriptUri = URI.joinPath(vendorRoot, 'index.js');
		const styleUri = URI.joinPath(vendorRoot, 'style.css');
		const reactFlowStyleUri = URI.joinPath(vendorRoot, 'index.css');
		const folderName = this.folderUri.path.split('/').filter(Boolean).pop() || 'React Flow Canvas';
		const viewType = `${VIEW_TYPE_PREFIX}:${this.folderUri.toString()}`;
		const title = `◎ ${folderName}`;

		for (const editor of this.editorService.editors) {
			if ((editor as any).viewType === viewType) {
				this.editorService.openEditor(editor, { pinned: true });
				return;
			}
		}

		const canvasService = this.instantiationService.createInstance(VSWordCanvasService);
		canvasService.setFolder(this.folderUri);

		const input = this.webviewWorkbenchService.openWebview(
			{
				providedViewType: viewType,
				extension: undefined,
				origin: 'vsword-react-flow-folder-canvas',
				title,
				options: { enableFindWidget: true, retainContextWhenHidden: true },
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [vendorRoot],
				},
			},
			viewType,
			title,
			undefined,
			{ preserveFocus: false }
		);

		const webview = input.webview;
		webview.setHtml(getReactFlowCanvasHtml(scriptUri, styleUri, reactFlowStyleUri));
		webview.onMessage(async (e) => {
			try {
				await this.handleMessage(e.message, webview, canvasService, folderName);
			} catch (err) {
				this.logService.error('[VSWord React Flow Canvas] message handler failed:', err);
				webview.postMessage({ type: 'hostError', message: String(err) });
			}
		});
	}

	private async handleMessage(msg: any, webview: any, canvasService: VSWordCanvasService, folderName: string): Promise<void> {
		switch (msg.type) {
			case 'ready': {
				const doc = await canvasService.loadCanvas();
				const nodes = await this.enrichNodes(canvasService, doc.nodes);
				webview.postMessage({
					type: 'folderData',
					folderName,
					folderUri: this.folderUri.toString(),
					canvas: { ...doc, nodes },
				});
				break;
			}
			case 'nodesMoved': {
				const doc = await canvasService.loadCanvas();
				for (const moved of msg.nodes ?? []) {
					const node = doc.nodes.find(n => n.id === moved.id);
					if (node) {
						node.x = Math.round(Number(moved.x));
						node.y = Math.round(Number(moved.y));
					}
				}
				await canvasService.saveCanvas(doc);
				break;
			}
			case 'nodeResized': {
				const doc = await canvasService.loadCanvas();
				const node = doc.nodes.find(n => n.id === msg.node?.id);
				if (node) {
					node.width = Math.round(Number(msg.node.width));
					node.height = Math.round(Number(msg.node.height));
					await canvasService.saveCanvas(doc);
				}
				break;
			}
			case 'edgeCreated': {
				const doc = await canvasService.loadCanvas();
				const edge: CanvasEdge = {
					id: String(msg.edge.id),
					from: String(msg.edge.from),
					to: String(msg.edge.to),
					fromPort: msg.edge.fromPort ?? 'right',
					toPort: msg.edge.toPort ?? 'left',
				};
				if (!doc.edges.some(e => e.id === edge.id || (e.from === edge.from && e.to === edge.to && e.fromPort === edge.fromPort && e.toPort === edge.toPort))) {
					doc.edges.push(edge);
					await canvasService.saveCanvas(doc);
				}
				break;
			}
			case 'openFile': {
				const uri = canvasService.resolveFilePath(msg.filePath);
				if (uri) {
					await this.editorService.openEditor({ resource: uri, options: { pinned: true } });
				}
				break;
			}
			case 'openSubCanvas': {
				const uri = canvasService.resolveFilePath(msg.folderPath);
				if (uri) {
					this.instantiationService.createInstance(ReactFlowFolderCanvasManager, uri).open();
				}
				break;
			}
		}
	}

	private async enrichNodes(canvasService: VSWordCanvasService, nodes: CanvasNode[]): Promise<any[]> {
		const result: any[] = [];
		for (const node of nodes) {
			if (node.type === 'file') {
				const content = await canvasService.readFileContent(node.filePath);
				result.push({ ...node, summary: summarizeMarkdownLike(content ?? '') });
			} else {
				result.push(node);
			}
		}
		return result;
	}
}

function summarizeMarkdownLike(content: string): string {
	const lines = content
		.replace(/\r/g, '')
		.split('\n')
		.map(line => line.trim())
		.filter(line => line && !line.startsWith('```'));
	const useful: string[] = [];
	for (const line of lines) {
		if (/^#{1,6}\s+/.test(line) || /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
			useful.push(line.replace(/^#{1,6}\s+/, '§ ').replace(/^[-*+]\s+/, '• '));
		} else if (useful.length < 2) {
			useful.push(line);
		}
		if (useful.length >= 4) break;
	}
	return useful.join('\n').slice(0, 320);
}

class VSWordOpenReactFlowFolderCanvasAction extends Action2 {
	constructor() {
		super({
			id: COMMAND_ID,
			title: localize2('vswordOpenReactFlowFolderCanvas', 'Open as React Flow Canvas'),
			category: localize2('vsword', 'VSWord'),
			f1: true,
			menu: [
				{
					id: MenuId.ExplorerContext,
					group: 'navigation',
					order: 31,
					when: ContextKeyExpr.equals('explorerResourceIsFolder', true),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor, resource?: URI | { resource: URI }): Promise<void> {
		const workspaceService = accessor.get(IWorkspaceContextService);
		const instantiationService = accessor.get(IInstantiationService);
		const explorerService = accessor.get(IExplorerService);
		const logService = accessor.get(ILogService);

		let folderUri: URI | undefined;
		if (resource) {
			if (URI.isUri(resource)) {
				folderUri = resource;
			} else if (typeof resource === 'object' && 'resource' in resource) {
				folderUri = (resource as any).resource;
			}
		}
		if (!folderUri) {
			const folders = workspaceService.getWorkspace().folders;
			if (folders.length === 0) {
				logService.warn('[VSWord React Flow Canvas] no folder URI and no workspace');
				return;
			}
			folderUri = folders[0].uri;
		}

		instantiationService.createInstance(ReactFlowFolderCanvasManager, folderUri).open();
		try {
			await explorerService.select(folderUri, true);
		} catch (err) {
			logService.debug('[VSWord React Flow Canvas] explorer select failed: ' + err);
		}
	}
}

registerAction2(VSWordOpenReactFlowFolderCanvasAction);

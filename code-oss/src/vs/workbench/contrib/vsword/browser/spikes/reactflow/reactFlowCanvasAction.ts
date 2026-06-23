/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IExplorerService } from '../../../../files/browser/files.js';
import { WebviewInput } from '../../../../webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../../../webviewPanel/browser/webviewWorkbenchService.js';
import { CanvasEdge, CanvasNode } from '../../../common/canvasTypes.js';
import { VSWordCanvasService } from '../../../common/canvasService.js';
import { getReactFlowCanvasHtml } from './reactFlowCanvasHtml.js';

const VIEW_TYPE_PREFIX = 'vsword.dev.reactFlowCanvas';
const VIEW_TYPE_RESTORE_PREFIX = `${VIEW_TYPE_PREFIX}:`;
const COMMAND_ID = 'vsword.dev.openReactFlowFolderCanvas';
const RESTORE_CONTRIBUTION_ID = 'workbench.contrib.vsword.reactFlowCanvasRestore';

interface ReactFlowCanvasState {
	readonly kind: 'vsword.reactFlowCanvas';
	readonly version: 1;
	readonly folderUri: string;
}

class ReactFlowFolderCanvasManager {
	constructor(
		private readonly folderUri: URI,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) { }

	open(): void {
		const { vendorRoot, scriptUri, styleUri, reactFlowStyleUri } = getReactFlowWebviewResources();
		const folderName = getFolderName(this.folderUri);
		const viewType = getReactFlowViewType(this.folderUri);
		const title = getReactFlowTitle(folderName);

		for (const editor of this.editorService.editors) {
			if ((editor as any).viewType === viewType) {
				this.editorService.openEditor(editor, { pinned: true });
				return;
			}
		}

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

		this.attach(input, scriptUri, styleUri, reactFlowStyleUri, folderName);
	}

	attachRestored(input: WebviewInput): void {
		const { scriptUri, styleUri, reactFlowStyleUri } = getReactFlowWebviewResources();
		this.attach(input, scriptUri, styleUri, reactFlowStyleUri, getFolderName(this.folderUri));
	}

	private attach(input: WebviewInput, scriptUri: URI, styleUri: URI, reactFlowStyleUri: URI, folderName: string): void {
		const canvasService = this.instantiationService.createInstance(VSWordCanvasService);
		canvasService.setFolder(this.folderUri);

		const webview = input.webview;
		webview.state = JSON.stringify(mergeRestoreState(webview.state, this.folderUri));
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
			case 'viewportChanged': {
				const viewport = msg.viewport;
				if (viewport && Number.isFinite(Number(viewport.x)) && Number.isFinite(Number(viewport.y)) && Number.isFinite(Number(viewport.zoom))) {
					const doc = await canvasService.loadCanvas();
					doc.viewport = {
						x: Math.round(Number(viewport.x)),
						y: Math.round(Number(viewport.y)),
						zoom: Math.max(0.1, Math.min(4, Number(viewport.zoom))),
					};
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

class ReactFlowCanvasRestoreContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(webviewWorkbenchService.registerResolver({
			canResolve: (webview) => isReactFlowCanvasWebview(webview),
			resolveWebview: async (webview, token) => this.resolveWebview(webview, token),
		}));
	}

	private async resolveWebview(webview: WebviewInput, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		const folderUri = getFolderUriFromWebview(webview);
		if (!folderUri) {
			this.logService.warn('[VSWord React Flow Canvas] unable to restore webview without folder URI: ' + webview.viewType);
			return;
		}

		this.instantiationService.createInstance(ReactFlowFolderCanvasManager, folderUri).attachRestored(webview);
	}
}

function getReactFlowWebviewResources(): { vendorRoot: URI; scriptUri: URI; styleUri: URI; reactFlowStyleUri: URI } {
	const vendorRoot = FileAccess.asFileUri('vs/workbench/contrib/vsword/browser/spikes/reactflow/vendor');
	return {
		vendorRoot,
		scriptUri: URI.joinPath(vendorRoot, 'index.js'),
		styleUri: URI.joinPath(vendorRoot, 'style.css'),
		reactFlowStyleUri: URI.joinPath(vendorRoot, 'index.css'),
	};
}

function getReactFlowViewType(folderUri: URI): string {
	return `${VIEW_TYPE_RESTORE_PREFIX}${folderUri.toString()}`;
}

function getReactFlowTitle(folderName: string): string {
	return `◎ ${folderName}`;
}

function getFolderName(folderUri: URI): string {
	return folderUri.path.split('/').filter(Boolean).pop() || 'React Flow Canvas';
}

function mergeRestoreState(state: string | undefined, folderUri: URI): ReactFlowCanvasState & Record<string, unknown> {
	let parsed: Record<string, unknown> = {};
	if (state) {
		try {
			const value = JSON.parse(state);
			if (value && typeof value === 'object') {
				parsed = value as Record<string, unknown>;
			}
		} catch {
			// Ignore stale/malformed state and replace it with a valid restore state.
		}
	}
	return {
		...parsed,
		kind: 'vsword.reactFlowCanvas',
		version: 1,
		folderUri: folderUri.toString(),
	};
}

function isReactFlowCanvasWebview(webview: WebviewInput): boolean {
	return webview.viewType.startsWith(VIEW_TYPE_RESTORE_PREFIX) || webview.providerId?.startsWith(VIEW_TYPE_RESTORE_PREFIX) === true;
}

function getFolderUriFromWebview(webview: WebviewInput): URI | undefined {
	const stateUri = getFolderUriFromState(webview.webview.state);
	if (stateUri) {
		return stateUri;
	}

	const viewType = webview.viewType.startsWith(VIEW_TYPE_RESTORE_PREFIX) ? webview.viewType : webview.providerId;
	if (!viewType?.startsWith(VIEW_TYPE_RESTORE_PREFIX)) {
		return undefined;
	}

	try {
		return URI.parse(viewType.slice(VIEW_TYPE_RESTORE_PREFIX.length));
	} catch {
		return undefined;
	}
}

function getFolderUriFromState(state: string | undefined): URI | undefined {
	if (!state) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(state) as Partial<ReactFlowCanvasState>;
		if (parsed.kind === 'vsword.reactFlowCanvas' && typeof parsed.folderUri === 'string') {
			return URI.parse(parsed.folderUri);
		}
	} catch {
		// Ignore stale or malformed restore state.
	}
	return undefined;
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

registerWorkbenchContribution2(RESTORE_CONTRIBUTION_ID, ReactFlowCanvasRestoreContribution, WorkbenchPhase.BlockStartup);
registerAction2(VSWordOpenReactFlowFolderCanvasAction);

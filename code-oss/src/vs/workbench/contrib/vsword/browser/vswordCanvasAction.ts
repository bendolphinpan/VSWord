/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWebviewService, WebviewInitInfo } from '../../webview/browser/webview.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { getCanvasHtml } from './canvasHtml.js';
import { VSWordCanvasService } from '../common/canvasService.js';
import { CanvasNode } from '../common/canvasTypes.js';

const CANVAS_VIEW_TYPE = 'vsword.canvas';
const CANVAS_EDITOR_TITLE = 'Canvas';

/**
 * Manages the lifecycle of a Canvas webview editor instance.
 *
 * Created on-demand when the user runs "Open Canvas" and kept alive as a
 * singleton editor tab until closed.
 */
class CanvasEditorManager extends Disposable {

	static readonly ID = 'vsword.canvasEditorManager';

	private readonly _webviewDisposable = this._register(new MutableDisposable());

	constructor(
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	openCanvas(): void {
		// If a canvas tab is already open, just reveal it.
		const existing = this.editorService.getEditors(0 /* active group */)
			.find(e => e.editor.editorId === CANVAS_VIEW_TYPE);
		if (existing) {
			this.editorService.openEditor(existing.editor, { pinned: true });
			return;
		}

		const canvasService = this.instantiationService.createInstance(VSWordCanvasService);

		const initInfo: WebviewInitInfo = {
			providedViewType: CANVAS_VIEW_TYPE,
			extension: undefined,
			origin: 'vsword-canvas',
			title: CANVAS_EDITOR_TITLE,
			options: { enableFindWidget: true, retainContextWhenHidden: true },
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [],
			},
		};

		const webview = this.webviewService.createWebviewOverlay(initInfo);

		// Set HTML content
		webview.setHtml(getCanvasHtml());

		// Open as editor tab
		this.webviewWorkbenchService.openWebview(
			initInfo,
			CANVAS_VIEW_TYPE,
			CANVAS_EDITOR_TITLE,
			undefined,
			{ preserveFocus: false }
		);

		// Handle messages from webview
		const msgDisposable = webview.onMessage(async (e) => {
			const msg = e.message;
			try {
				await this.handleMessage(msg, webview, canvasService);
			} catch (err) {
				this.logService.error('[VSWord Canvas] Message handler error:', err);
			}
		});

		this._webviewDisposable.value = msgDisposable;
	}

	private async handleMessage(msg: any, webview: any, canvasService: VSWordCanvasService): Promise<void> {
		switch (msg.type) {
			case 'ready': {
				const doc = await canvasService.loadCanvas();
				webview.postMessage({ type: 'init', canvas: doc });
				break;
			}
			case 'nodesMoved': {
				// Persist updated node positions
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
				// Persist viewport
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
		}
	}
}

/**
 * Action: VSWord: Open Canvas
 *
 * Opens the folder-as-canvas webview editor in the main editor area.
 * Requires a workspace folder to be open.
 */
export class VswordOpenCanvasAction extends Action2 {
	static readonly ID = 'vsword.actions.openCanvas';

	constructor() {
		super({
			id: VswordOpenCanvasAction.ID,
			title: localize2('vswordOpenCanvas', 'VSWord: Open Canvas'),
			category: localize2('vsword', 'VSWord'),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const manager = instantiationService.createInstance(CanvasEditorManager);
		manager.openCanvas();
	}
}

registerAction2(VswordOpenCanvasAction);

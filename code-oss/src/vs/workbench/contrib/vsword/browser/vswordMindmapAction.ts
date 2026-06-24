/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { parseMindmapXml, VSWordMindmapNode } from '../common/mindmapXml.js';
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
			}));
		} catch (err) {
			this.logService.error('[VSWord Mindmap] failed to open .mm:', err);
			input.webview.setHtml(getMindmapHtml({
				fileName: basename(this.fileUri),
				root: undefined,
				nodeCount: 0,
				sourceKind: 'mm',
			}));
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

		const manager = accessor.get(IInstantiationService).createInstance(MindmapEditorManager, fileUri);
		await manager.openMindmap();

		try {
			await accessor.get(IExplorerService).select(fileUri, true);
		} catch (err) {
			accessor.get(ILogService).debug('[VSWord Mindmap] explorer select failed: ' + err);
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

registerAction2(VswordOpenMindmapAction);

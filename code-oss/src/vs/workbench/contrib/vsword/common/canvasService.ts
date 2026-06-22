/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CanvasDocument } from './canvasTypes.js';

/**
 * Persists canvas state to `.vsword/canvas.json` in the workspace root.
 *
 * On first open, auto-discovers files and lays them out in a grid so the user
 * sees something immediately rather than an empty canvas.
 */
export class VSWordCanvasService extends Disposable {

	static readonly ID = 'vsword.canvasService';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	private getWorkspaceRoot(): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		return folders.length > 0 ? folders[0].uri : undefined;
	}

	private getCanvasFileUri(): URI | undefined {
		const root = this.getWorkspaceRoot();
		if (!root) {
			return undefined;
		}
		return URI.joinPath(root, '.vsword', 'canvas.json');
	}

	async loadCanvas(): Promise<CanvasDocument> {
		const canvasUri = this.getCanvasFileUri();
		if (!canvasUri) {
			return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] };
		}

		try {
			const content = await this.fileService.readFile(canvasUri);
			const doc = JSON.parse(content.value.toString()) as CanvasDocument;
			if (doc.version === 1 && Array.isArray(doc.nodes)) {
				return doc;
			}
		} catch {
			// File doesn\'t exist yet — fine.
		}

		// Auto-discover files.
		const { discoverFileNodes } = await import('./canvasDiscovery.js');
		const doc: CanvasDocument = { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] };
		doc.nodes = await discoverFileNodes(this.fileService, this.getWorkspaceRoot()!, this.logService);
		return doc;
	}

	async saveCanvas(doc: CanvasDocument): Promise<void> {
		const canvasUri = this.getCanvasFileUri();
		if (!canvasUri) {
			return;
		}

		const dirUri = URI.joinPath(canvasUri, '..');
		try {
			await this.fileService.createFolder(dirUri);
		} catch {
			// May already exist.
		}

		const content = JSON.stringify(doc, null, 2);
		await this.fileService.writeFile(canvasUri, VSBuffer.fromString(content));
	}

	resolveFilePath(filePath: string): URI | undefined {
		const root = this.getWorkspaceRoot();
		if (!root) {
			return undefined;
		}
		return URI.joinPath(root, filePath);
	}

	/** Reads the text content of a file referenced by a canvas node. */
	async readFileContent(filePath: string): Promise<string | undefined> {
		const uri = this.resolveFilePath(filePath);
		if (!uri) {
			return undefined;
		}
		try {
			const content = await this.fileService.readFile(uri);
			return content.value.toString();
		} catch {
			return undefined;
		}
	}
}

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
 * Persists per-folder canvas state.
 *
 * Each folder gets its own `<folder>/.vsword/canvas.json` so the canvas
 * naturally maps to "folder as workspace board". On first open of a folder
 * we shallow-scan it and auto-tile every direct child (files + subfolders)
 * so the user sees content immediately instead of an empty board.
 */
export class VSWordCanvasService extends Disposable {

	static readonly ID = 'vsword.canvasService';

	/** The folder this service instance is bound to. */
	private folderUri: URI | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	/** Bind this service to a specific folder. If not called, falls back to the first workspace folder. */
	setFolder(folderUri: URI): void {
		this.folderUri = folderUri;
	}

	getFolderUri(): URI | undefined {
		if (this.folderUri) {
			return this.folderUri;
		}
		const folders = this.workspaceService.getWorkspace().folders;
		return folders.length > 0 ? folders[0].uri : undefined;
	}

	/** Workspace root (used for computing workspace-relative paths). */
	private getWorkspaceRoot(): URI | undefined {
		const folder = this.getFolderUri();
		if (!folder) return undefined;
		// Find the workspace folder that contains `folder`.
		const wsFolders = this.workspaceService.getWorkspace().folders;
		for (const wf of wsFolders) {
			if (folder.path === wf.uri.path || folder.path.startsWith(wf.uri.path.endsWith('/') ? wf.uri.path : wf.uri.path + '/')) {
				return wf.uri;
			}
		}
		return wsFolders.length > 0 ? wsFolders[0].uri : undefined;
	}

	private getCanvasFileUri(): URI | undefined {
		const folder = this.getFolderUri();
		if (!folder) return undefined;
		return URI.joinPath(folder, '.vsword', 'canvas.json');
	}

	async loadCanvas(): Promise<CanvasDocument> {
		const canvasUri = this.getCanvasFileUri();
		const folder = this.getFolderUri();
		const root = this.getWorkspaceRoot();
		if (!canvasUri || !folder || !root) {
			return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] };
		}

		try {
			const content = await this.fileService.readFile(canvasUri);
			const doc = JSON.parse(content.value.toString()) as CanvasDocument;
			if (doc.version === 1 && Array.isArray(doc.nodes)) {
				return doc;
			}
		} catch {
			// File doesn't exist yet — fine, fall through to auto-discover.
		}

		const { discoverFolderNodes } = await import('./canvasDiscovery.js');
		const doc: CanvasDocument = { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] };
		doc.nodes = await discoverFolderNodes(this.fileService, root, folder, this.logService);
		return doc;
	}

	async saveCanvas(doc: CanvasDocument): Promise<void> {
		const canvasUri = this.getCanvasFileUri();
		if (!canvasUri) return;

		const dirUri = URI.joinPath(canvasUri, '..');
		try {
			await this.fileService.createFolder(dirUri);
		} catch {
			// May already exist.
		}

		const content = JSON.stringify(doc, null, 2);
		await this.fileService.writeFile(canvasUri, VSBuffer.fromString(content));
	}

	/** Resolves a workspace-relative path to an absolute URI. */
	resolveFilePath(filePath: string): URI | undefined {
		const root = this.getWorkspaceRoot();
		if (!root) return undefined;
		return URI.joinPath(root, filePath);
	}

	async readFileContent(filePath: string): Promise<string | undefined> {
		const uri = this.resolveFilePath(filePath);
		if (!uri) return undefined;
		try {
			const content = await this.fileService.readFile(uri);
			return content.value.toString();
		} catch {
			return undefined;
		}
	}

	/** Writes a string back to a workspace file. Used by in-canvas file editing. */
	async writeFileContent(filePath: string, content: string): Promise<boolean> {
		const uri = this.resolveFilePath(filePath);
		if (!uri) return false;
		try {
			await this.fileService.writeFile(uri, VSBuffer.fromString(content));
			return true;
		} catch (err) {
			this.logService.error(`[VSWord Canvas] writeFile failed for ${uri.toString()}: ${err}`);
			return false;
		}
	}
}

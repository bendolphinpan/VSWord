/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CanvasDocument, CanvasFileNode, CanvasFolderNode, CanvasNode, CanvasTextNode } from './canvasTypes.js';

export interface CanvasStagedItem {
	readonly path: string;
	readonly name: string;
	readonly type: 'file' | 'folder';
	readonly extension?: string;
}

export interface CanvasImportFile {
	readonly name: string;
	readonly dataBase64: string;
	readonly mime?: string;
}

const HIDDEN_OR_SYSTEM_NAMES = new Set(['node_modules', 'out', 'dist']);
const DEFAULT_CARD_WIDTH = 280;
const DEFAULT_FILE_HEIGHT = 178;
const DEFAULT_FOLDER_HEIGHT = 126;

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

	async listStagedItems(doc?: CanvasDocument): Promise<CanvasStagedItem[]> {
		const folder = this.getFolderUri();
		const root = this.getWorkspaceRoot();
		if (!folder || !root) {
			return [];
		}

		const canvas = doc ?? await this.loadCanvas();
		const referenced = new Set<string>();
		for (const node of canvas.nodes) {
			if (node.type === 'file') {
				referenced.add(node.filePath);
			} else if (node.type === 'folder') {
				referenced.add(node.folderPath);
			}
		}

		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(folder);
		} catch (err) {
			this.logService.debug(`[VSWord Canvas] staged resolve failed for ${folder.toString()}: ${err}`);
			return [];
		}

		const items: CanvasStagedItem[] = [];
		for (const child of stat.children ?? []) {
			if (isHiddenOrSystemName(child.name)) {
				continue;
			}
			const relPath = this.relativeToRoot(child.resource, root);
			if (referenced.has(relPath)) {
				continue;
			}
			if (child.isDirectory) {
				items.push({ path: relPath, name: child.name, type: 'folder' });
			} else if (child.isFile) {
				items.push({ path: relPath, name: child.name, type: 'file', extension: getExtension(child.name) });
			}
		}
		return items.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1);
	}

	async restoreStagedItems(paths: string[], originX: number, originY: number): Promise<{ doc: CanvasDocument; restored: number; failed: number }> {
		const doc = await this.loadCanvas();
		const existing = new Set(doc.nodes.map(node => node.type === 'file' ? node.filePath : node.type === 'folder' ? node.folderPath : ''));
		let added = 0;
		let failed = 0;
		for (const path of paths) {
			if (existing.has(path)) {
				continue;
			}
			const uri = this.resolveFilePath(path);
			if (!uri) {
				failed++;
				continue;
			}
			try {
				const stat = await this.fileService.resolve(uri);
				const node = this.createNodeForStat(stat, originX + (added % 4) * 40, originY + Math.floor(added / 4) * 40);
				if (node) {
					doc.nodes.push(node);
					existing.add(path);
					added++;
				} else {
					failed++;
				}
			} catch (err) {
				failed++;
				this.logService.debug(`[VSWord Canvas] restore staged item failed for ${path}: ${err}`);
			}
		}
		if (added > 0) {
			await this.saveCanvas(doc);
		}
		return { doc, restored: added, failed };
	}

	async deleteWorkspaceItems(paths: string[]): Promise<{ doc: CanvasDocument; deleted: number; failed: number }> {
		const doc = await this.loadCanvas();
		const deleted = new Set<string>();
		let failed = 0;
		for (const path of paths) {
			const uri = this.resolveFilePath(path);
			if (!uri) {
				failed++;
				continue;
			}
			try {
				await this.fileService.del(uri, { recursive: true, useTrash: true });
				deleted.add(path);
			} catch (err) {
				failed++;
				this.logService.error(`[VSWord Canvas] delete workspace item failed for ${uri.toString()}: ${err}`);
			}
		}
		if (deleted.size > 0) {
			doc.nodes = doc.nodes.filter(node => {
				if (node.type === 'file') return !deleted.has(node.filePath);
				if (node.type === 'folder') return !deleted.has(node.folderPath);
				return true;
			});
			const remaining = new Set(doc.nodes.map(node => node.id));
			doc.edges = doc.edges.filter(edge => remaining.has(edge.from) && remaining.has(edge.to));
			await this.saveCanvas(doc);
		}
		return { doc, deleted: deleted.size, failed };
	}

	async importFiles(files: CanvasImportFile[], originX: number, originY: number): Promise<{ doc: CanvasDocument; imported: number; failed: number }> {
		const folder = this.getFolderUri();
		if (!folder) {
			return { doc: await this.loadCanvas(), imported: 0, failed: files.length };
		}

		const doc = await this.loadCanvas();
		let added = 0;
		let failed = 0;
		for (const file of files) {
			const name = sanitizeFileName(file.name || `pasted-${Date.now()}.bin`);
			const targetFolder = isImageFileName(name) ? URI.joinPath(folder, 'assets') : folder;
			try {
				await this.fileService.createFolder(targetFolder);
			} catch {
				// Folder may already exist, or target folder is the bound canvas folder.
			}
			const target = await this.getUniqueChildUri(targetFolder, name);
			try {
				await this.fileService.createFile(target, decodeBase64(file.dataBase64), { overwrite: false });
				const stat = await this.fileService.resolve(target);
				const node = this.createNodeForStat(stat, originX + (added % 4) * 40, originY + Math.floor(added / 4) * 40);
				if (node?.type === 'file' && !doc.nodes.some(existing => existing.type === 'file' && existing.filePath === node.filePath)) {
					doc.nodes.push(node);
					added++;
				}
			} catch (err) {
				failed++;
				this.logService.error(`[VSWord Canvas] import file failed for ${name}: ${err}`);
			}
		}
		if (added > 0) {
			await this.saveCanvas(doc);
		}
		return { doc, imported: added, failed };
	}

	async createTextNode(text: string, x: number, y: number): Promise<CanvasDocument> {
		const doc = await this.loadCanvas();
		const trimmed = text.trim();
		if (!trimmed) {
			return doc;
		}
		const node: CanvasTextNode = {
			id: generateUuid(),
			type: 'text',
			text: trimmed,
			x: Math.round(x),
			y: Math.round(y),
			width: DEFAULT_CARD_WIDTH,
			height: DEFAULT_FILE_HEIGHT,
			parentId: null,
		};
		doc.nodes.push(node);
		await this.saveCanvas(doc);
		return doc;
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

	async existsPath(filePath: string): Promise<boolean> {
		const uri = this.resolveFilePath(filePath);
		if (!uri) return false;
		try {
			return await this.fileService.exists(uri);
		} catch {
			return false;
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

	private createNodeForStat(stat: IFileStat, x: number, y: number): CanvasNode | undefined {
		const root = this.getWorkspaceRoot();
		if (!root) {
			return undefined;
		}
		const relPath = this.relativeToRoot(stat.resource, root);
		if (stat.isDirectory) {
			const node: CanvasFolderNode = {
				id: generateUuid(),
				type: 'folder',
				folderPath: relPath,
				label: stat.name,
				x: Math.round(x),
				y: Math.round(y),
				width: DEFAULT_CARD_WIDTH,
				height: DEFAULT_FOLDER_HEIGHT,
				parentId: null,
			};
			return node;
		}
		if (stat.isFile) {
			const node: CanvasFileNode = {
				id: generateUuid(),
				type: 'file',
				filePath: relPath,
				label: stat.name,
				extension: getExtension(stat.name),
				x: Math.round(x),
				y: Math.round(y),
				width: DEFAULT_CARD_WIDTH,
				height: DEFAULT_FILE_HEIGHT,
				parentId: null,
			};
			return node;
		}
		return undefined;
	}

	private async getUniqueChildUri(folder: URI, rawName: string): Promise<URI> {
		const dot = rawName.lastIndexOf('.');
		const base = dot > 0 ? rawName.slice(0, dot) : rawName;
		const ext = dot > 0 ? rawName.slice(dot) : '';
		let candidate = URI.joinPath(folder, rawName);
		let index = 1;
		while (await this.fileService.exists(candidate)) {
			candidate = URI.joinPath(folder, `${base}-${index}${ext}`);
			index++;
		}
		return candidate;
	}

	private relativeToRoot(child: URI, root: URI): string {
		const childPath = child.path;
		const rootPath = root.path.endsWith('/') ? root.path : root.path + '/';
		if (childPath.startsWith(rootPath)) {
			return childPath.substring(rootPath.length);
		}
		if (childPath === root.path) {
			return '';
		}
		return childPath.replace(/^\//, '');
	}
}

function isHiddenOrSystemName(name: string): boolean {
	return name.startsWith('.') || HIDDEN_OR_SYSTEM_NAMES.has(name);
}

function getExtension(name: string): string {
	return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
}

function sanitizeFileName(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim() || `file-${Date.now()}`;
}

function isImageFileName(name: string): boolean {
	return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(getExtension(name));
}

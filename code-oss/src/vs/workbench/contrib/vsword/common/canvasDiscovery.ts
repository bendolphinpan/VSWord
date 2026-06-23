/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanvasFileNode, CanvasFolderNode, CanvasNode } from './canvasTypes.js';

const SUPPORTED_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'mm', 'json', 'csv']);

/**
 * Shallow-scan a folder and produce one node per direct child:
 *  - subfolders → CanvasFolderNode (📁 — double-click to open sub-canvas)
 *  - files → CanvasFileNode
 *
 * Layout: 5-column grid, cards spaced 240×140 with gap 40.
 */
export async function discoverFolderNodes(
	fileService: IFileService,
	root: URI,
	folder: URI,
	logService: ILogService,
): Promise<CanvasNode[]> {
	const nodes: CanvasNode[] = [];
	let stat;
	try {
		stat = await fileService.resolve(folder);
	} catch (err) {
		logService.debug(`[VSWord Canvas] resolve failed for ${folder.toString()}: ${err}`);
		return nodes;
	}
	if (!stat.children) {
		return nodes;
	}

	// Stable ordering: folders first, then files, both alphabetical.
	const children = stat.children
		.filter(c => !c.name.startsWith('.') && c.name !== 'node_modules' && c.name !== 'out' && c.name !== 'dist')
		.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

	const cols = 5;
	const cardW = 240;
	const cardH = 140;
	const gap = 40;

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = col * (cardW + gap) + 40;
		const y = row * (cardH + gap) + 40;

		const relPath = relativeToRoot(child.resource, root);

		if (child.isDirectory) {
			const node: CanvasFolderNode = {
				id: generateUuid(),
				type: 'folder',
				folderPath: relPath,
				label: child.name,
				x, y, width: cardW, height: cardH,
				parentId: null,
			};
			nodes.push(node);
		} else if (child.isFile) {
			const ext = child.name.split('.').pop()?.toLowerCase() ?? '';
			if (!SUPPORTED_EXTENSIONS.has(ext)) {
				continue;
			}
			const node: CanvasFileNode = {
				id: generateUuid(),
				type: 'file',
				filePath: relPath,
				label: child.name,
				extension: ext,
				x, y, width: cardW, height: cardH,
				parentId: null,
			};
			nodes.push(node);
		}
	}

	return nodes;
}

function relativeToRoot(child: URI, root: URI): string {
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

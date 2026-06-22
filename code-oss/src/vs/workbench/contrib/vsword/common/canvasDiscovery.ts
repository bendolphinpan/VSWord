/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanvasFileNode, CanvasDocument } from './canvasTypes.js';

const SUPPORTED_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'mm', 'json', 'csv']);

export function createEmptyCanvasDocument(): CanvasDocument {
	return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] };
}

/**
 * Scan the workspace root for supported files and return CanvasFileNodes
 * laid out in a simple grid (6 columns, 200x80 cards, 40px gap).
 */
export async function discoverFileNodes(
	fileService: IFileService,
	root: URI,
	logService: ILogService,
): Promise<CanvasFileNode[]> {
	const files: string[] = [];
	await listFilesRecursive(fileService, root, root, 3, files, logService);

	const nodes: CanvasFileNode[] = [];
	const cols = 6;
	const cardW = 200;
	const cardH = 80;
	const gapX = 40;
	const gapY = 40;

	for (let i = 0; i < files.length; i++) {
		const filePath = files[i];
		const col = i % cols;
		const row = Math.floor(i / cols);
		const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
		const label = filePath.split('/').pop() ?? filePath;

		nodes.push({
			id: generateUuid(),
			type: 'file',
			filePath,
			label,
			extension: ext,
			x: col * (cardW + gapX) + 20,
			y: row * (cardH + gapY) + 20,
			width: cardW,
			height: cardH,
			parentId: null,
		});
	}

	return nodes;
}

async function listFilesRecursive(
	fileService: IFileService,
	root: URI,
	dir: URI,
	depth: number,
	results: string[],
	logService: ILogService,
): Promise<void> {
	if (depth < 0) {
		return;
	}

	try {
		const stat = await fileService.resolve(dir);
		if (!stat.children) {
			return;
		}

		for (const child of stat.children) {
			if (child.name.startsWith('.') || child.name === 'node_modules' || child.name === 'out' || child.name === 'dist') {
				continue;
			}

			if (child.isDirectory) {
				await listFilesRecursive(fileService, root, child.resource, depth - 1, results, logService);
			} else if (child.isFile) {
				const ext = child.name.split('.').pop()?.toLowerCase() ?? '';
				if (SUPPORTED_EXTENSIONS.has(ext)) {
					const relPath = child.resource.path.replace(root.path, '').replace(/^\//, '');
					results.push(relPath);
				}
			}
		}
	} catch (err) {
		logService.debug(`[VSWord Canvas] resolve failed for ${dir.toString()}: ${err}`);
	}
}

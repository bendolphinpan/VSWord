/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas document types — persisted to `.vsword/canvas.json` per workspace.
 *
 * The schema is designed to be forward-compatible: unknown fields are ignored,
 * and `version` allows future migrations.
 */

export interface CanvasViewport {
	readonly x: number;
	readonly y: number;
	readonly zoom: number;
}

export type CanvasNodeType = 'file' | 'text' | 'group' | 'drawing';

export interface CanvasNodeBase {
	readonly id: string;
	readonly type: CanvasNodeType;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Parent group node id, or null for top-level. */
	parentId: string | null;
}

export interface CanvasFileNode extends CanvasNodeBase {
	readonly type: 'file';
	/** Workspace-relative file path. */
	filePath: string;
	/** Cached display name (basename). */
	label: string;
	/** File extension, e.g. "md", "txt". */
	extension: string;
}

export interface CanvasTextNode extends CanvasNodeBase {
	readonly type: 'text';
	text: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
	readonly type: 'group';
	label: string;
}

export interface CanvasDrawingNode extends CanvasNodeBase {
	readonly type: 'drawing';
	/** Array of [x, y] points relative to node origin. */
	points: number[][];
}

export type CanvasNode = CanvasFileNode | CanvasTextNode | CanvasGroupNode | CanvasDrawingNode;

export interface CanvasEdge {
	readonly id: string;
	from: string;
	to: string;
	fromPort: CanvasPort;
	toPort: CanvasPort;
}

export type CanvasPort = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface CanvasDocument {
	readonly version: 1;
	viewport: CanvasViewport;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export function createEmptyCanvasDocument(): CanvasDocument {
	return {
		version: 1,
		viewport: { x: 0, y: 0, zoom: 1 },
		nodes: [],
		edges: [],
	};
}

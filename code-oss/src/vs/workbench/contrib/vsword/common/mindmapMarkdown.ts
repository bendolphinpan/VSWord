/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { VSWordMindmapNode } from './mindmapXml.js';

/**
 * Render a FreeMind `.mm` tree as an XMind-style Markdown bullet outline.
 * This is a presentation/export projection only; `.mm` remains the source of truth.
 */
export function mindmapToMarkdownBullets(root: VSWordMindmapNode): string {
	const lines: string[] = [];
	renderNode(root, 0, lines);
	return lines.join('\n') + (lines.length ? '\n' : '');
}

function renderNode(node: VSWordMindmapNode, depth: number, lines: string[]): void {
	lines.push(`${'  '.repeat(depth)}- ${escapeMarkdownBulletText(normalizeInlineText(node.text))}`);
	for (const child of node.children) {
		renderNode(child, depth + 1, lines);
	}
}

function normalizeInlineText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeMarkdownBulletText(value: string): string {
	return value.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, '\\$&');
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { VSWordMindmapNode } from './mindmapXml.js';

/**
 * RD-9.1 · Markdown 大纲 ↔ Mindmap 树。
 * - `.mm` 仍是权威格式；Markdown 为投影 / 导入。
 * - 互转为**有损**：不保留图标、颜色、richcontent、未知 XML。
 */

/**
 * Render a FreeMind `.mm` tree as an XMind-style Markdown bullet outline.
 */
export function mindmapToMarkdownBullets(root: VSWordMindmapNode): string {
	const lines: string[] = [];
	renderNode(root, 0, lines);
	return lines.join('\n') + (lines.length ? '\n' : '');
}

/**
 * Parse Markdown bullet / ordered-list outline into a mindmap tree.
 * - Indent: 2 spaces or 1 tab = one level
 * - Markers: `-` `*` `+` or `1.` `2.` …
 * - Multiple depth-0 items → synthetic root TEXT="Outline"
 * - Empty / no list → undefined
 */
export function markdownBulletsToMindmap(markdown: string): VSWordMindmapNode | undefined {
	if (typeof markdown !== 'string' || !markdown.trim()) {
		return undefined;
	}
	const items: { depth: number; text: string }[] = [];
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	for (const line of lines) {
		const m = /^([ \t]*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
		if (!m) {
			continue;
		}
		const depth = indentWidth(m[1] ?? '');
		const text = unescapeMarkdownBulletText(normalizeInlineText(m[3] ?? ''));
		if (!text) {
			continue;
		}
		items.push({ depth, text });
	}
	if (items.length === 0) {
		return undefined;
	}

	const minDepth = Math.min(...items.map(i => i.depth));
	for (const it of items) {
		it.depth = Math.max(0, it.depth - minDepth);
	}

	let idSeq = 0;
	const nextId = () => `n${++idSeq}`;

	interface MNode {
		id: string;
		text: string;
		children: MNode[];
	}

	const forest: MNode[] = [];
	/** stack[d] = last node at depth d */
	const stack: MNode[] = [];

	for (const it of items) {
		const node: MNode = { id: nextId(), text: it.text, children: [] };
		// Clamp depth so we don't skip levels improperly
		const depth = Math.min(it.depth, stack.length);
		if (depth === 0) {
			forest.push(node);
			stack.length = 0;
			stack.push(node);
			continue;
		}
		const parent = stack[depth - 1];
		if (!parent) {
			forest.push(node);
			stack.length = 0;
			stack.push(node);
			continue;
		}
		parent.children.push(node);
		stack.length = depth;
		stack.push(node);
	}

	const freeze = (n: MNode): VSWordMindmapNode => ({
		id: n.id,
		text: n.text,
		folded: false,
		children: n.children.map(freeze),
	});

	if (forest.length === 1) {
		return freeze(forest[0]!);
	}
	return {
		id: nextId(),
		text: 'Outline',
		folded: false,
		children: forest.map(freeze),
	};
}

/**
 * Serialize a tree to a minimal FreeMind `.mm` document (lossy export).
 */
export function mindmapToMmXml(root: VSWordMindmapNode): string {
	const body = serializeNodeXml(root, 1);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n${body}</map>\n`;
}

/**
 * Markdown outline → complete `.mm` file text.
 * Returns undefined if no list items found.
 */
export function markdownToMindmapXml(markdown: string): string | undefined {
	const root = markdownBulletsToMindmap(markdown);
	if (!root) {
		return undefined;
	}
	return mindmapToMmXml(root);
}

// --- internals ---

function indentWidth(indent: string): number {
	let w = 0;
	for (const ch of indent) {
		w += ch === '\t' ? 2 : 1;
	}
	return Math.floor(w / 2);
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

/** Reverse of escapeMarkdownBulletText for common escapes. */
export function unescapeMarkdownBulletText(value: string): string {
	return value.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1');
}

function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function serializeNodeXml(node: VSWordMindmapNode, indentLevel: number): string {
	const pad = '\t'.repeat(indentLevel);
	const id = node.id && /^[A-Za-z_][\w.-]*$/.test(node.id)
		? node.id
		: `n_${Math.abs(hashStr(node.text + String(indentLevel))).toString(36)}`;
	const text = escapeXmlAttr(node.text ?? '');
	const kids = node.children ?? [];
	if (kids.length === 0) {
		return `${pad}<node ID="${escapeXmlAttr(id)}" TEXT="${text}"/>\n`;
	}
	let out = `${pad}<node ID="${escapeXmlAttr(id)}" TEXT="${text}">\n`;
	for (const c of kids) {
		out += serializeNodeXml(c, indentLevel + 1);
	}
	out += `${pad}</node>\n`;
	return out;
}

function hashStr(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) - h + s.charCodeAt(i)) | 0;
	}
	return h || 1;
}

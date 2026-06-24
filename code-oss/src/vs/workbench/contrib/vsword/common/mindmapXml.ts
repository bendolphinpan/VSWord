/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface VSWordMindmapNode {
	readonly id?: string;
	readonly text: string;
	readonly side?: 'left' | 'right';
	readonly folded: boolean;
	readonly link?: string;
	readonly color?: string;
	readonly backgroundColor?: string;
	readonly icons: readonly string[];
	readonly children: readonly VSWordMindmapNode[];
}

export interface VSWordMindmapXmlDocument {
	readonly originalXml: string;
	readonly root?: VSWordMindmapNode;
}

interface MutableMindmapNode {
	id?: string;
	text: string;
	side?: 'left' | 'right';
	folded: boolean;
	link?: string;
	color?: string;
	backgroundColor?: string;
	icons: string[];
	children: MutableMindmapNode[];
}

interface XmlAttribute {
	readonly name: string;
	readonly value: string;
	readonly valueStart: number;
	readonly valueEnd: number;
	readonly quote: string;
}

interface XmlTag {
	readonly name: string;
	readonly raw: string;
	readonly start: number;
	readonly end: number;
	readonly closing: boolean;
	readonly selfClosing: boolean;
	readonly attributes: readonly XmlAttribute[];
}

export function parseMindmapXml(xml: string): VSWordMindmapXmlDocument {
	const stack: MutableMindmapNode[] = [];
	let root: MutableMindmapNode | undefined;

	for (const tag of scanTags(xml)) {
		if (tag.closing) {
			if (tag.name === 'node') {
				stack.pop();
			}
			continue;
		}

		if (tag.name === 'node') {
			const node = createNode(tag.attributes);
			const parent = stack[stack.length - 1];
			if (parent) {
				parent.children.push(node);
			} else if (!root) {
				root = node;
			}
			if (!tag.selfClosing) {
				stack.push(node);
			}
			continue;
		}

		if (tag.name === 'icon') {
			const current = stack[stack.length - 1];
			const icon = getAttr(tag.attributes, 'BUILTIN');
			if (current && icon) {
				current.icons.push(icon);
			}
		}
	}

	return { originalXml: xml, root };
}

export function serializeMindmapXml(document: VSWordMindmapXmlDocument): string {
	return document.originalXml;
}

export function updateMindmapNodeText(xml: string, nodeId: string, text: string): string {
	for (const tag of scanTags(xml)) {
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}

		const encoded = escapeXmlAttribute(text);
		const textAttr = tag.attributes.find(attribute => attribute.name === 'TEXT');
		if (textAttr) {
			return xml.slice(0, textAttr.valueStart) + encoded + xml.slice(textAttr.valueEnd);
		}

		const insertAt = tag.selfClosing ? tag.end - 2 : tag.end - 1;
		return xml.slice(0, insertAt) + ` TEXT="${encoded}"` + xml.slice(insertAt);
	}

	return xml;
}

export interface NewMindmapChildOptions {
	readonly newId: string;
	readonly text: string;
	readonly position?: 'left' | 'right';
}

/**
 * Insert a new `<node ID="..." TEXT="..." />` as the last child of the node with `parentId`.
 * Preserves the surrounding XML byte-for-byte; only inserts the new subtree.
 *
 * If the parent is self-closing (e.g. `<node ID="x" TEXT="x" />`), it is expanded to an
 * open/close pair around the new child so unknown attributes are retained.
 */
export function appendMindmapChild(xml: string, parentId: string, options: NewMindmapChildOptions): string {
	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== parentId) {
			continue;
		}

		const childXml = renderNewNodeXml(options);
		if (tag.selfClosing) {
			// Rewrite the self-closing tag into open + child + close pair.
			const opening = tag.raw.replace(/\/\s*>$/, '>');
			const closing = `</${tag.name}>`;
			return xml.slice(0, tag.start) + opening + childXml + closing + xml.slice(tag.end);
		}

		// Find the matching closing tag at the same depth.
		const closeIndex = findMatchingCloseIndex(tags, i);
		if (closeIndex === -1) {
			return xml;
		}
		const closeTag = tags[closeIndex];
		return xml.slice(0, closeTag.start) + childXml + xml.slice(closeTag.start);
	}
	return xml;
}

/**
 * Insert a new `<node ID="..." TEXT="..." />` immediately after the node with `siblingId`,
 * inside the same parent. Returns the XML unchanged if the sibling has no parent (root) or
 * cannot be located.
 */
export function appendMindmapSibling(xml: string, siblingId: string, options: NewMindmapChildOptions): string {
	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== siblingId) {
			continue;
		}

		// Refuse to insert next to the root: it has no enclosing parent node.
		if (!hasParentNode(tags, i)) {
			return xml;
		}

		const endIndex = tag.selfClosing ? i : findMatchingCloseIndex(tags, i);
		if (endIndex === -1) {
			return xml;
		}
		const insertOffset = tags[endIndex].end;
		const childXml = renderNewNodeXml(options);
		return xml.slice(0, insertOffset) + childXml + xml.slice(insertOffset);
	}
	return xml;
}

/**
 * Remove the `<node ID="...">…</node>` subtree (or self-closing tag) with the given id.
 * Returns the XML unchanged if the target is the root (no parent) or cannot be found.
 */
export function removeMindmapNode(xml: string, nodeId: string): string {
	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}

		// Refuse to delete the root: it has no enclosing parent node.
		if (!hasParentNode(tags, i)) {
			return xml;
		}

		if (tag.selfClosing) {
			return xml.slice(0, tag.start) + xml.slice(tag.end);
		}
		const closeIndex = findMatchingCloseIndex(tags, i);
		if (closeIndex === -1) {
			return xml;
		}
		const closeTag = tags[closeIndex];
		return xml.slice(0, tag.start) + xml.slice(closeTag.end);
	}
	return xml;
}

function findMatchingCloseIndex(tags: XmlTag[], openIndex: number): number {
	let depth = 0;
	for (let j = openIndex + 1; j < tags.length; j++) {
		const candidate = tags[j];
		if (candidate.name !== 'node') {
			continue;
		}
		if (candidate.closing) {
			if (depth === 0) {
				return j;
			}
			depth--;
			continue;
		}
		if (!candidate.selfClosing) {
			depth++;
		}
	}
	return -1;
}

function hasParentNode(tags: XmlTag[], targetIndex: number): boolean {
	let depth = 0;
	for (let j = targetIndex - 1; j >= 0; j--) {
		const candidate = tags[j];
		if (candidate.name !== 'node') {
			continue;
		}
		if (candidate.closing) {
			depth++;
			continue;
		}
		if (candidate.selfClosing) {
			continue;
		}
		if (depth === 0) {
			return true;
		}
		depth--;
	}
	return false;
}

function renderNewNodeXml(options: NewMindmapChildOptions): string {
	const id = escapeXmlAttribute(options.newId);
	const text = escapeXmlAttribute(options.text);
	const position = options.position ? ` POSITION="${options.position}"` : '';
	return `<node ID="${id}" TEXT="${text}"${position} />`;
}

function createNode(attributes: readonly XmlAttribute[]): MutableMindmapNode {
	const position = getAttr(attributes, 'POSITION')?.toLowerCase();
	const node: MutableMindmapNode = {
		id: getAttr(attributes, 'ID'),
		text: getAttr(attributes, 'TEXT') ?? '',
		folded: getAttr(attributes, 'FOLDED')?.toLowerCase() === 'true',
		link: getAttr(attributes, 'LINK'),
		color: getAttr(attributes, 'COLOR'),
		backgroundColor: getAttr(attributes, 'BACKGROUND_COLOR'),
		icons: [],
		children: []
	};

	if (position === 'left' || position === 'right') {
		node.side = position;
	}

	return node;
}

function getAttr(attributes: readonly XmlAttribute[], name: string): string | undefined {
	return attributes.find(attribute => attribute.name === name)?.value;
}

function scanTags(xml: string): XmlTag[] {
	const tags: XmlTag[] = [];
	const tagRegex = /<\s*(\/)?\s*([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)\s*>/g;
	let match: RegExpExecArray | null;
	while ((match = tagRegex.exec(xml))) {
		const raw = match[0];
		const name = match[2];
		const body = match[3] ?? '';
		const closing = Boolean(match[1]);
		const selfClosing = !closing && /\/\s*>$/.test(raw);
		const bodyStart = match.index + raw.indexOf(body);
		tags.push({
			name,
			raw,
			start: match.index,
			end: match.index + raw.length,
			closing,
			selfClosing,
			attributes: closing ? [] : parseAttributes(body, bodyStart)
		});
	}
	return tags;
}

function parseAttributes(body: string, bodyStart: number): XmlAttribute[] {
	const attributes: XmlAttribute[] = [];
	const attrRegex = /([^\s=\/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
	let match: RegExpExecArray | null;
	while ((match = attrRegex.exec(body))) {
		const quote = match[2][0];
		const rawValue = quote === '"' ? match[3] : match[4];
		const valueTokenStart = bodyStart + match.index + match[0].lastIndexOf(match[2]);
		const valueStart = valueTokenStart + 1;
		attributes.push({
			name: match[1],
			value: unescapeXmlAttribute(rawValue ?? ''),
			valueStart,
			valueEnd: valueStart + (rawValue?.length ?? 0),
			quote
		});
	}
	return attributes;
}

function unescapeXmlAttribute(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, '\'')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function escapeXmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

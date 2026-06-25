/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface VSWordMindmapFont {
	readonly name?: string;
	readonly size?: number;
	readonly bold: boolean;
	readonly italic: boolean;
}

export interface VSWordMindmapEdge {
	readonly color?: string;
	readonly width?: string;
	readonly style?: string;
}

export interface VSWordMindmapArrowlink {
	readonly id: string;
	readonly destination: string;
	readonly startArrow?: 'None' | 'Default';
	readonly endArrow?: 'None' | 'Default';
	readonly color?: string;
	readonly style?: string;
	readonly startInclination?: string;
	readonly endInclination?: string;
}

export interface VSWordMindmapNode {
	readonly id?: string;
	readonly text: string;
	readonly side?: 'left' | 'right';
	readonly folded: boolean;
	readonly link?: string;
	readonly color?: string;
	readonly backgroundColor?: string;
	readonly font?: VSWordMindmapFont;
	readonly edge?: VSWordMindmapEdge;
	readonly arrowlinks: readonly VSWordMindmapArrowlink[];
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
	font?: VSWordMindmapFont;
	edge?: VSWordMindmapEdge;
	arrowlinks: VSWordMindmapArrowlink[];
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

		if (tag.name === 'font') {
			const current = stack[stack.length - 1];
			if (current) {
				const sizeRaw = getAttr(tag.attributes, 'SIZE');
				const sizeNum = sizeRaw === undefined ? undefined : Number.parseInt(sizeRaw, 10);
				current.font = {
					name: getAttr(tag.attributes, 'NAME'),
					size: sizeNum !== undefined && Number.isFinite(sizeNum) ? sizeNum : undefined,
					bold: getAttr(tag.attributes, 'BOLD')?.toLowerCase() === 'true',
					italic: getAttr(tag.attributes, 'ITALIC')?.toLowerCase() === 'true'
				};
			}
		}

		if (tag.name === 'edge') {
			const current = stack[stack.length - 1];
			if (current) {
				current.edge = {
					color: getAttr(tag.attributes, 'COLOR'),
					width: getAttr(tag.attributes, 'WIDTH'),
					style: getAttr(tag.attributes, 'STYLE')
				};
			}
		}

		if (tag.name === 'arrowlink') {
			const current = stack[stack.length - 1];
			const id = getAttr(tag.attributes, 'ID');
			const destination = getAttr(tag.attributes, 'DESTINATION');
			if (current && id && destination) {
				const startRaw = getAttr(tag.attributes, 'STARTARROW');
				const endRaw = getAttr(tag.attributes, 'ENDARROW');
				current.arrowlinks.push({
					id,
					destination,
					startArrow: startRaw === 'None' || startRaw === 'Default' ? startRaw : undefined,
					endArrow: endRaw === 'None' || endRaw === 'Default' ? endRaw : undefined,
					color: getAttr(tag.attributes, 'COLOR'),
					style: getAttr(tag.attributes, 'STYLE'),
					startInclination: getAttr(tag.attributes, 'STARTINCLINATION'),
					endInclination: getAttr(tag.attributes, 'ENDINCLINATION')
				});
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
	readonly siblingPlacement?: 'before' | 'after';
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
		const insertOffset = options.siblingPlacement === 'before' ? tag.start : tags[endIndex].end;
		const childXml = renderNewNodeXml(options);
		return xml.slice(0, insertOffset) + childXml + xml.slice(insertOffset);
	}
	return xml;
}

export interface MoveMindmapNodeOptions {
	readonly parentId: string;
	readonly siblingId?: string;
	readonly placement: 'inside' | 'before' | 'after';
}

/**
 * Move an existing `<node>` subtree to a new parent/sibling location.
 * Preserves the moved subtree byte-for-byte and leaves unknown XML untouched.
 */
export function moveMindmapNode(xml: string, nodeId: string, options: MoveMindmapNodeOptions): string {
	const tags = scanTags(xml);
	const sourceIndex = findNodeOpenIndexById(tags, nodeId);
	if (sourceIndex === -1 || !hasParentNode(tags, sourceIndex)) {
		return xml;
	}

	const sourceTag = tags[sourceIndex];
	const sourceEndIndex = sourceTag.selfClosing ? sourceIndex : findMatchingCloseIndex(tags, sourceIndex);
	if (sourceEndIndex === -1) {
		return xml;
	}
	const sourceStart = sourceTag.start;
	const sourceEnd = tags[sourceEndIndex].end;
	const movedXml = xml.slice(sourceStart, sourceEnd);

	const edits: Array<{ start: number; end: number; text: string }> = [{ start: sourceStart, end: sourceEnd, text: '' }];

	if (options.placement === 'inside') {
		const parentIndex = findNodeOpenIndexById(tags, options.parentId);
		if (parentIndex === -1 || isTagInsideRange(tags[parentIndex], sourceStart, sourceEnd)) {
			return xml;
		}
		const parentTag = tags[parentIndex];
		if (parentTag.selfClosing) {
			edits.push({
				start: parentTag.start,
				end: parentTag.end,
				text: renderOpenTagFromSelfClosingPreservingPad(xml, parentTag) + movedXml + `</${parentTag.name}>`
			});
		} else {
			const parentCloseIndex = findMatchingCloseIndex(tags, parentIndex);
			if (parentCloseIndex === -1) {
				return xml;
			}
			edits.push({ start: tags[parentCloseIndex].start, end: tags[parentCloseIndex].start, text: movedXml });
		}
	} else {
		if (!options.siblingId) {
			return xml;
		}
		const siblingIndex = findNodeOpenIndexById(tags, options.siblingId);
		if (siblingIndex === -1 || !hasParentNode(tags, siblingIndex) || isTagInsideRange(tags[siblingIndex], sourceStart, sourceEnd)) {
			return xml;
		}
		const siblingParentId = findParentNodeId(tags, siblingIndex);
		if (siblingParentId !== options.parentId) {
			return xml;
		}
		const siblingTag = tags[siblingIndex];
		const siblingEndIndex = siblingTag.selfClosing ? siblingIndex : findMatchingCloseIndex(tags, siblingIndex);
		if (siblingEndIndex === -1) {
			return xml;
		}
		const insertAt = options.placement === 'before' ? siblingTag.start : tags[siblingEndIndex].end;
		edits.push({ start: insertAt, end: insertAt, text: movedXml });
	}

	return applyXmlEdits(xml, edits);
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

/**
 * Set or clear the `FOLDED="true"` attribute on the `<node ID="...">` with the given id.
 * Preserves the surrounding XML byte-for-byte; only inserts/updates/removes the FOLDED attr.
 */
export function setMindmapNodeFolded(xml: string, nodeId: string, folded: boolean): string {
	for (const tag of scanTags(xml)) {
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}

		const foldedAttr = tag.attributes.find(attribute => attribute.name === 'FOLDED');
		if (folded) {
			if (foldedAttr) {
				return xml.slice(0, foldedAttr.valueStart) + 'true' + xml.slice(foldedAttr.valueEnd);
			}
			// Insert ` FOLDED="true"` directly after the last existing attribute value's closing quote,
			// so we don't double the whitespace that already pads `<node ... />` self-closing tags.
			let insertAt: number;
			if (tag.attributes.length > 0) {
				const last = tag.attributes[tag.attributes.length - 1];
				insertAt = last.valueEnd + 1; // past closing quote
			} else {
				insertAt = tag.start + 1 + tag.name.length; // right after `<node`
			}
			return xml.slice(0, insertAt) + ` FOLDED="true"` + xml.slice(insertAt);
		}

		if (!foldedAttr) {
			return xml;
		}
		// Remove ` FOLDED="..."` (including leading whitespace) by finding the attr name token.
		const nameStart = xml.lastIndexOf('FOLDED', foldedAttr.valueStart);
		if (nameStart < 0) {
			return xml;
		}
		// Capture preceding whitespace so we don't leave a double space.
		let removeStart = nameStart;
		while (removeStart > 0 && /\s/.test(xml.charAt(removeStart - 1))) {
			removeStart--;
		}
		const removeEnd = foldedAttr.valueEnd + 1; // include closing quote
		return xml.slice(0, removeStart) + xml.slice(removeEnd);
	}
	return xml;
}

/**
 * Add an `<icon BUILTIN="..."/>` child to the `<node ID="...">` with the given id.
 * - Inserts the icon immediately after the node's open tag, preserving every other byte (including hook / cloud / richcontent / nested nodes / unknown attrs).
 * - When `icon` is already present on the node, returns the input unchanged (no-op, never duplicates).
 * - When the node is self-closing, expands it to `<node ...></node>` so the icon child has a place to live, preserving all attrs.
 * - When the node id is not found, returns the input unchanged.
 */
export function addMindmapNodeIcon(xml: string, nodeId: string, icon: string): string {
	if (!icon) {
		return xml;
	}
	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}

		// Check whether this <icon BUILTIN="..."/> is already a direct child.
		if (nodeAlreadyHasIcon(tags, i, icon)) {
			return xml;
		}

		const insertion = `<icon BUILTIN="${escapeXmlAttribute(icon)}"/>`;
		if (tag.selfClosing) {
			const openOnly = renderOpenTagFromSelfClosing(xml, tag);
			const closeOnly = `</${tag.name}>`;
			return xml.slice(0, tag.start) + openOnly + insertion + closeOnly + xml.slice(tag.end);
		}
		return xml.slice(0, tag.end) + insertion + xml.slice(tag.end);
	}
	return xml;
}

/**
 * Remove the first matching `<icon BUILTIN="..."/>` direct child from the `<node ID="...">` with the given id.
 * - Only removes a single occurrence so callers can repeat to drop duplicates intentionally.
 * - Preserves every other byte: hook / cloud / richcontent / nested nodes / unknown attrs are untouched.
 * - Returns the input unchanged when the node is self-closing, when the node id is not found, or when the icon is absent.
 */
export function removeMindmapNodeIcon(xml: string, nodeId: string, icon: string): string {
	if (!icon) {
		return xml;
	}
	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}
		if (tag.selfClosing) {
			return xml;
		}
		const closeIndex = findMatchingCloseIndex(tags, i);
		if (closeIndex === -1) {
			return xml;
		}
		// Walk direct children: skip nested `<node>` subtrees, only look at top-level `<icon BUILTIN="...">` tags.
		let depth = 0;
		for (let j = i + 1; j < closeIndex; j++) {
			const child = tags[j];
			if (child.name === 'node') {
				if (child.closing) {
					depth = Math.max(0, depth - 1);
				} else if (!child.selfClosing) {
					depth++;
				}
				continue;
			}
			if (depth !== 0) {
				continue;
			}
			if (child.name === 'icon' && !child.closing && getAttr(child.attributes, 'BUILTIN') === icon) {
				return xml.slice(0, child.start) + xml.slice(child.end);
			}
		}
		return xml;
	}
	return xml;
}

function nodeAlreadyHasIcon(tags: XmlTag[], openIndex: number, icon: string): boolean {
	const open = tags[openIndex];
	if (open.selfClosing) {
		return false;
	}
	const closeIndex = findMatchingCloseIndex(tags, openIndex);
	if (closeIndex === -1) {
		return false;
	}
	let depth = 0;
	for (let j = openIndex + 1; j < closeIndex; j++) {
		const child = tags[j];
		if (child.name === 'node') {
			if (child.closing) {
				depth = Math.max(0, depth - 1);
			} else if (!child.selfClosing) {
				depth++;
			}
			continue;
		}
		if (depth !== 0) {
			continue;
		}
		if (child.name === 'icon' && !child.closing && getAttr(child.attributes, 'BUILTIN') === icon) {
			return true;
		}
	}
	return false;
}

/**
 * Set or clear a single string attribute (e.g. `COLOR`, `BACKGROUND_COLOR`) on the `<node ID="...">`
 * with the given id. Preserves every other byte of the source.
 *
 * - `value === null` removes the attribute entirely (including leading whitespace).
 * - `value === undefined` is treated as a no-op.
 * - When the attribute already exists, only the quoted value range is replaced.
 * - When the attribute is missing and `value` is non-null, it is inserted directly after the
 *   last existing attribute (or right after `<node` if the tag had no attributes), without
 *   doubling whitespace.
 */
export function setMindmapNodeAttribute(xml: string, nodeId: string, attributeName: string, value: string | null | undefined): string {
	if (value === undefined) {
		return xml;
	}
	for (const tag of scanTags(xml)) {
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}
		const existing = tag.attributes.find(attribute => attribute.name === attributeName);
		if (value === null) {
			if (!existing) {
				return xml;
			}
			const nameStart = xml.lastIndexOf(attributeName, existing.valueStart);
			if (nameStart < 0) {
				return xml;
			}
			let removeStart = nameStart;
			while (removeStart > 0 && /\s/.test(xml.charAt(removeStart - 1))) {
				removeStart--;
			}
			const removeEnd = existing.valueEnd + 1; // include closing quote
			return xml.slice(0, removeStart) + xml.slice(removeEnd);
		}
		const encoded = escapeXmlAttribute(value);
		if (existing) {
			return xml.slice(0, existing.valueStart) + encoded + xml.slice(existing.valueEnd);
		}
		let insertAt: number;
		if (tag.attributes.length > 0) {
			const last = tag.attributes[tag.attributes.length - 1];
			insertAt = last.valueEnd + 1;
		} else {
			insertAt = tag.start + 1 + tag.name.length;
		}
		return xml.slice(0, insertAt) + ` ${attributeName}="${encoded}"` + xml.slice(insertAt);
	}
	return xml;
}

/**
 * Convenience wrapper: set the foreground `COLOR` attribute on a node. Pass `null` to clear.
 */
export function setMindmapNodeColor(xml: string, nodeId: string, color: string | null): string {
	return setMindmapNodeAttribute(xml, nodeId, 'COLOR', color);
}

/**
 * Convenience wrapper: set the `BACKGROUND_COLOR` attribute on a node. Pass `null` to clear.
 */
export function setMindmapNodeBackgroundColor(xml: string, nodeId: string, color: string | null): string {
	return setMindmapNodeAttribute(xml, nodeId, 'BACKGROUND_COLOR', color);
}

export interface MindmapFontPatch {
	readonly name?: string | null;
	readonly size?: number | null;
	readonly bold?: boolean | null;
	readonly italic?: boolean | null;
}

/**
 * Update the `<font ... />` child of the `<node ID="...">` with the given id.
 *
 * - Patch entries map to FreeMind attrs `NAME` / `SIZE` / `BOLD` / `ITALIC`.
 *   * `string`/`number`/`true`/`false` → set the attribute.
 *   * `null` → clear that specific attribute (other font attrs are kept).
 *   * `undefined` (or missing key) → leave that attribute alone.
 * - If the node has no `<font>` child and the patch has any non-null/undefined value, a new
 *   `<font ... />` is inserted directly after the node's open tag (self-closing nodes are
 *   expanded). If every patch value is `null`/`undefined`, the source is returned unchanged.
 * - If the patch leaves the `<font>` tag with no attributes, the tag is removed entirely.
 * - All other children (icons / hooks / nested nodes / unknown XML) are preserved byte-for-byte.
 */
export function setMindmapNodeFont(xml: string, nodeId: string, patch: MindmapFontPatch): string {
	const hasAnyDefined = ['name', 'size', 'bold', 'italic'].some(key => (patch as any)[key] !== undefined);
	if (!hasAnyDefined) {
		return xml;
	}

	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}

		const existingFontIndex = findDirectChildFont(tags, i);
		if (existingFontIndex !== -1) {
			const fontTag = tags[existingFontIndex];
			const updated = applyFontPatchToTag(xml, fontTag, patch);
			if (updated === null) {
				// Remove font tag entirely (and a single trailing newline-or-spaces if any).
				return xml.slice(0, fontTag.start) + xml.slice(fontTag.end);
			}
			return xml.slice(0, fontTag.start) + updated + xml.slice(fontTag.end);
		}

		// No existing <font>: build one from the patch.
		const attrs = renderFontAttrsFromPatch(patch, undefined);
		if (!attrs) {
			return xml;
		}
		const insertion = `<font ${attrs}/>`;
		if (tag.selfClosing) {
			const openOnly = renderOpenTagFromSelfClosing(xml, tag);
			const closeOnly = `</${tag.name}>`;
			return xml.slice(0, tag.start) + openOnly + insertion + closeOnly + xml.slice(tag.end);
		}
		return xml.slice(0, tag.end) + insertion + xml.slice(tag.end);
	}
	return xml;
}

export interface MindmapEdgePatch {
	readonly color?: string | null;
	readonly width?: string | number | null;
	readonly style?: string | null;
}

const EDGE_STYLE_WHITELIST: ReadonlySet<string> = new Set([
	'linear', 'bezier', 'sharp_linear', 'sharp_bezier', 'hide_edge'
]);

/**
 * Update the `<edge ... />` child of the `<node ID="...">` with the given id.
 *
 * - Patch entries map to FreeMind attrs `COLOR` / `WIDTH` / `STYLE`.
 *   * `string` / `number` → set the attribute.
 *   * `null` → clear that specific attribute (other edge attrs are kept).
 *   * `undefined` (or missing key) → leave that attribute alone.
 * - If the node has no `<edge>` child and the patch has any non-null/undefined value, a new
 *   `<edge ... />` is inserted directly after the node's open tag (self-closing nodes are
 *   expanded). If every patch value is `null`/`undefined`, the source is returned unchanged.
 * - If the patch leaves the `<edge>` tag with no attributes, the tag is removed entirely.
 * - Style values outside the FreeMind whitelist (linear/bezier/sharp_linear/sharp_bezier/hide_edge)
 *   are rejected silently (returns xml unchanged for that field) — callers should validate first.
 * - All other children (icons / hooks / fonts / nested nodes / unknown XML) are preserved byte-for-byte.
 */
export function setMindmapNodeEdge(xml: string, nodeId: string, patch: MindmapEdgePatch): string {
	const hasAnyDefined = ['color', 'width', 'style'].some(key => (patch as any)[key] !== undefined);
	if (!hasAnyDefined) {
		return xml;
	}
	if (patch.style !== undefined && patch.style !== null && !EDGE_STYLE_WHITELIST.has(patch.style)) {
		return xml;
	}

	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== nodeId) {
			continue;
		}

		const existingEdgeIndex = findDirectChildEdge(tags, i);
		if (existingEdgeIndex !== -1) {
			const edgeTag = tags[existingEdgeIndex];
			const updated = applyEdgePatchToTag(xml, edgeTag, patch);
			if (updated === null) {
				return xml.slice(0, edgeTag.start) + xml.slice(edgeTag.end);
			}
			return xml.slice(0, edgeTag.start) + updated + xml.slice(edgeTag.end);
		}

		// No existing <edge>: build one from the patch.
		const attrs = renderEdgeAttrsFromPatch(patch);
		if (!attrs) {
			return xml;
		}
		const insertion = `<edge ${attrs}/>`;
		if (tag.selfClosing) {
			const openOnly = renderOpenTagFromSelfClosing(xml, tag);
			const closeOnly = `</${tag.name}>`;
			return xml.slice(0, tag.start) + openOnly + insertion + closeOnly + xml.slice(tag.end);
		}
		return xml.slice(0, tag.end) + insertion + xml.slice(tag.end);
	}
	return xml;
}

export interface MindmapArrowlinkPatch {
	readonly destination?: string;
	readonly startArrow?: 'None' | 'Default' | null;
	readonly endArrow?: 'None' | 'Default' | null;
	readonly color?: string | null;
	readonly style?: string | null;
	readonly startInclination?: string | null;
	readonly endInclination?: string | null;
}

export interface NewMindmapArrowlinkOptions {
	readonly newId: string;
	readonly destination: string;
	readonly startArrow?: 'None' | 'Default';
	readonly endArrow?: 'None' | 'Default';
	readonly color?: string;
	readonly style?: string;
}

const ARROW_END_WHITELIST: ReadonlySet<string> = new Set(['None', 'Default']);

/**
 * Append a new `<arrowlink ID="..." DESTINATION="..." ... />` child to the node with `sourceNodeId`.
 *
 * - The arrowlink links the source node to the node identified by `options.destination`.
 * - The new tag is inserted directly before the source node's closing tag so it follows any
 *   existing `<font>` / `<edge>` / `<icon>` / `<arrowlink>` / nested `<node>` children.
 * - Self-closing source nodes are expanded.
 * - Defaults: `ENDARROW="Default"` if no arrows specified.
 * - Returns the source xml unchanged when the source node cannot be found.
 */
export function appendMindmapArrowlink(xml: string, sourceNodeId: string, options: NewMindmapArrowlinkOptions): string {
	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'node') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== sourceNodeId) {
			continue;
		}

		const attrs: Record<string, string> = {
			ID: options.newId,
			DESTINATION: options.destination,
			STARTARROW: options.startArrow ?? 'None',
			ENDARROW: options.endArrow ?? 'Default'
		};
		if (options.color !== undefined) { attrs['COLOR'] = options.color; }
		if (options.style !== undefined) { attrs['STYLE'] = options.style; }
		const insertion = renderArrowlinkTag(attrs);

		if (tag.selfClosing) {
			const openOnly = renderOpenTagFromSelfClosing(xml, tag);
			const closeOnly = `</${tag.name}>`;
			return xml.slice(0, tag.start) + openOnly + insertion + closeOnly + xml.slice(tag.end);
		}
		// Insert right before the matching </node>.
		const closeIndex = findMatchingCloseIndex(tags, i);
		if (closeIndex === -1) {
			return xml.slice(0, tag.end) + insertion + xml.slice(tag.end);
		}
		const insertAt = tags[closeIndex].start;
		return xml.slice(0, insertAt) + insertion + xml.slice(insertAt);
	}
	return xml;
}

/**
 * Update the `<arrowlink ID="..."/>` child of any node with the given `arrowlinkId`.
 *
 * - Patch entries map to FreeMind attrs DESTINATION / STARTARROW / ENDARROW / COLOR / STYLE / STARTINCLINATION / ENDINCLINATION.
 *   * Non-null value → set the attribute.
 *   * `null` → clear the attribute (others kept).
 *   * `undefined` → leave alone.
 * - STARTARROW / ENDARROW are rejected silently if not in {None, Default}.
 * - DESTINATION cannot be cleared (null is ignored — DESTINATION is required).
 * - If every meaningful attr ends up undefined, returns xml unchanged.
 */
export function updateMindmapArrowlink(xml: string, arrowlinkId: string, patch: MindmapArrowlinkPatch): string {
	const hasAnyDefined = ['destination', 'startArrow', 'endArrow', 'color', 'style', 'startInclination', 'endInclination']
		.some(key => (patch as any)[key] !== undefined);
	if (!hasAnyDefined) {
		return xml;
	}
	if (patch.startArrow !== undefined && patch.startArrow !== null && !ARROW_END_WHITELIST.has(patch.startArrow)) {
		return xml;
	}
	if (patch.endArrow !== undefined && patch.endArrow !== null && !ARROW_END_WHITELIST.has(patch.endArrow)) {
		return xml;
	}

	const tags = scanTags(xml);
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.closing || tag.name !== 'arrowlink') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== arrowlinkId) {
			continue;
		}
		const current: Record<string, string> = {};
		for (const attribute of tag.attributes) {
			current[attribute.name] = attribute.value;
		}
		mergeArrowlinkPatch(current, patch);
		const replacement = renderArrowlinkTag(current);
		return xml.slice(0, tag.start) + replacement + xml.slice(tag.end);
	}
	return xml;
}

/**
 * Remove the `<arrowlink ID="..."/>` child anywhere in the tree.
 * Returns xml unchanged if the arrowlink is not found.
 */
export function removeMindmapArrowlink(xml: string, arrowlinkId: string): string {
	for (const tag of scanTags(xml)) {
		if (tag.closing || tag.name !== 'arrowlink') {
			continue;
		}
		if (getAttr(tag.attributes, 'ID') !== arrowlinkId) {
			continue;
		}
		return xml.slice(0, tag.start) + xml.slice(tag.end);
	}
	return xml;
}

function renderArrowlinkTag(attrs: Record<string, string>): string {
	const order = ['ID', 'DESTINATION', 'STARTARROW', 'ENDARROW', 'COLOR', 'STYLE', 'STARTINCLINATION', 'ENDINCLINATION'];
	const parts: string[] = [];
	for (const key of order) {
		const value = attrs[key];
		if (value === undefined) {
			continue;
		}
		parts.push(`${key}="${escapeXmlAttribute(value)}"`);
	}
	for (const key of Object.keys(attrs)) {
		if (order.indexOf(key) === -1) {
			parts.push(`${key}="${escapeXmlAttribute(attrs[key])}"`);
		}
	}
	return `<arrowlink ${parts.join(' ')}/>`;
}

function mergeArrowlinkPatch(map: Record<string, string>, patch: MindmapArrowlinkPatch): void {
	if (patch.destination !== undefined && patch.destination !== null) {
		map['DESTINATION'] = patch.destination;
	}
	if (patch.startArrow !== undefined) {
		if (patch.startArrow === null) { delete map['STARTARROW']; } else { map['STARTARROW'] = patch.startArrow; }
	}
	if (patch.endArrow !== undefined) {
		if (patch.endArrow === null) { delete map['ENDARROW']; } else { map['ENDARROW'] = patch.endArrow; }
	}
	if (patch.color !== undefined) {
		if (patch.color === null) { delete map['COLOR']; } else { map['COLOR'] = patch.color; }
	}
	if (patch.style !== undefined) {
		if (patch.style === null) { delete map['STYLE']; } else { map['STYLE'] = patch.style; }
	}
	if (patch.startInclination !== undefined) {
		if (patch.startInclination === null) { delete map['STARTINCLINATION']; } else { map['STARTINCLINATION'] = patch.startInclination; }
	}
	if (patch.endInclination !== undefined) {
		if (patch.endInclination === null) { delete map['ENDINCLINATION']; } else { map['ENDINCLINATION'] = patch.endInclination; }
	}
}

function findDirectChildEdge(tags: XmlTag[], openIndex: number): number {
	const open = tags[openIndex];
	if (open.selfClosing) {
		return -1;
	}
	const closeIndex = findMatchingCloseIndex(tags, openIndex);
	if (closeIndex === -1) {
		return -1;
	}
	let depth = 0;
	for (let j = openIndex + 1; j < closeIndex; j++) {
		const child = tags[j];
		if (child.name === 'node') {
			if (child.closing) {
				depth = Math.max(0, depth - 1);
			} else if (!child.selfClosing) {
				depth++;
			}
			continue;
		}
		if (depth !== 0) {
			continue;
		}
		if (child.name === 'edge' && !child.closing) {
			return j;
		}
	}
	return -1;
}

function applyEdgePatchToTag(xml: string, edgeTag: XmlTag, patch: MindmapEdgePatch): string | null {
	const current: Record<string, string> = {};
	for (const attribute of edgeTag.attributes) {
		current[attribute.name] = attribute.value;
	}
	mergeEdgePatch(current, patch);
	const attrString = renderEdgeAttrsFromMap(current);
	if (!attrString) {
		return null;
	}
	return `<edge ${attrString}/>`;
}

function renderEdgeAttrsFromPatch(patch: MindmapEdgePatch): string | null {
	const map: Record<string, string> = {};
	mergeEdgePatch(map, patch);
	return renderEdgeAttrsFromMap(map);
}

function renderEdgeAttrsFromMap(map: Record<string, string>): string | null {
	const order = ['COLOR', 'WIDTH', 'STYLE'];
	const parts: string[] = [];
	for (const key of order) {
		const value = map[key];
		if (value === undefined) {
			continue;
		}
		parts.push(`${key}="${escapeXmlAttribute(value)}"`);
	}
	if (parts.length === 0) {
		return null;
	}
	return parts.join(' ');
}

function mergeEdgePatch(map: Record<string, string>, patch: MindmapEdgePatch): void {
	if (patch.color !== undefined) {
		if (patch.color === null) { delete map['COLOR']; } else { map['COLOR'] = patch.color; }
	}
	if (patch.width !== undefined) {
		if (patch.width === null) { delete map['WIDTH']; } else { map['WIDTH'] = String(patch.width); }
	}
	if (patch.style !== undefined) {
		if (patch.style === null) { delete map['STYLE']; } else { map['STYLE'] = patch.style; }
	}
}

function findDirectChildFont(tags: XmlTag[], openIndex: number): number {
	const open = tags[openIndex];
	if (open.selfClosing) {
		return -1;
	}
	const closeIndex = findMatchingCloseIndex(tags, openIndex);
	if (closeIndex === -1) {
		return -1;
	}
	let depth = 0;
	for (let j = openIndex + 1; j < closeIndex; j++) {
		const child = tags[j];
		if (child.name === 'node') {
			if (child.closing) {
				depth = Math.max(0, depth - 1);
			} else if (!child.selfClosing) {
				depth++;
			}
			continue;
		}
		if (depth !== 0) {
			continue;
		}
		if (child.name === 'font' && !child.closing) {
			return j;
		}
	}
	return -1;
}

function applyFontPatchToTag(xml: string, fontTag: XmlTag, patch: MindmapFontPatch): string | null {
	const current: Record<string, string> = {};
	for (const attribute of fontTag.attributes) {
		current[attribute.name] = attribute.value;
	}
	mergeFontPatch(current, patch);
	const attrString = renderFontAttrsFromMap(current);
	if (!attrString) {
		return null;
	}
	return `<font ${attrString}/>`;
}

function renderFontAttrsFromPatch(patch: MindmapFontPatch, _existing: undefined): string | null {
	const map: Record<string, string> = {};
	mergeFontPatch(map, patch);
	return renderFontAttrsFromMap(map);
}

function renderFontAttrsFromMap(map: Record<string, string>): string | null {
	const order = ['NAME', 'SIZE', 'BOLD', 'ITALIC'];
	const parts: string[] = [];
	for (const key of order) {
		const value = map[key];
		if (value === undefined) {
			continue;
		}
		parts.push(`${key}="${escapeXmlAttribute(value)}"`);
	}
	if (parts.length === 0) {
		return null;
	}
	return parts.join(' ');
}

function mergeFontPatch(map: Record<string, string>, patch: MindmapFontPatch): void {
	if (patch.name !== undefined) {
		if (patch.name === null) { delete map['NAME']; } else { map['NAME'] = patch.name; }
	}
	if (patch.size !== undefined) {
		if (patch.size === null) { delete map['SIZE']; } else { map['SIZE'] = String(patch.size); }
	}
	if (patch.bold !== undefined) {
		if (patch.bold === null || patch.bold === false) { delete map['BOLD']; } else { map['BOLD'] = 'true'; }
	}
	if (patch.italic !== undefined) {
		if (patch.italic === null || patch.italic === false) { delete map['ITALIC']; } else { map['ITALIC'] = 'true'; }
	}
}

function renderOpenTagFromSelfClosing(xml: string, tag: XmlTag): string {
	// `<node ... />` → `<node ...>`; preserves attribute formatting exactly.
	const original = xml.slice(tag.start, tag.end);
	// Strip the final `/>` (with optional whitespace before it) and append `>`.
	const trimmed = original.replace(/\s*\/>$/, '>');
	return trimmed;
}

function renderOpenTagFromSelfClosingPreservingPad(xml: string, tag: XmlTag): string {
	// `<node ... />` → `<node ... >`; used when moving into an existing parent
	// where preserving that parent tag's whitespace is more important than normalizing it.
	return xml.slice(tag.start, tag.end).replace(/\/>$/, '>');
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

function findNodeOpenIndexById(tags: XmlTag[], nodeId: string): number {
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (!tag.closing && tag.name === 'node' && getAttr(tag.attributes, 'ID') === nodeId) {
			return i;
		}
	}
	return -1;
}

function findParentNodeId(tags: XmlTag[], targetIndex: number): string | undefined {
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
			return getAttr(candidate.attributes, 'ID');
		}
		depth--;
	}
	return undefined;
}

function isTagInsideRange(tag: XmlTag, start: number, end: number): boolean {
	return tag.start >= start && tag.start < end;
}

function applyXmlEdits(xml: string, edits: Array<{ start: number; end: number; text: string }>): string {
	let result = xml;
	const ordered = [...edits].sort((a, b) => b.start - a.start);
	for (const edit of ordered) {
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	}
	return result;
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
		arrowlinks: [],
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
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&#10;/g, '\n')
		.replace(/&#xA;/g, '\n')
		.replace(/&#13;/g, '\n')
		.replace(/&#9;/g, '	');
}

function escapeXmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { VSWordMindmapArrowlink, VSWordMindmapEdge, VSWordMindmapFont, VSWordMindmapNode, VSWordMindmapSummary } from './mindmapXml.js';

// Reference to keep TypeScript happy (unused import warning elimination)
const __unused: VSWordMindmapSummary | undefined = undefined;
void __unused;

export const VSWORD_MIND_ELIXIR_META_VERSION = 1;

export interface VSWordMindElixirSummary {
	readonly id: string;
	readonly parent: string;
	readonly start: number;
	readonly end: number;
	readonly label: string;
	readonly style?: {
		readonly stroke?: string;
		readonly labelColor?: string;
	};
}
export interface VSWordMindElixirNodeMetadata {
	readonly vsword: {
		readonly version: typeof VSWORD_MIND_ELIXIR_META_VERSION;
		readonly source: 'freemind-mm';
		readonly side?: 'left' | 'right';
		readonly folded: boolean;
		readonly edge?: VSWordMindmapEdge;
		readonly icons: readonly string[];
		readonly font?: VSWordMindmapFont;
		readonly arrowlinks: readonly VSWordMindmapArrowlink[];
		readonly generatedId?: true;
	};
}

export interface VSWordMindElixirNode {
	readonly id: string;
	readonly topic: string;
	readonly style?: Partial<{
		fontSize: string;
		fontFamily: string;
		color: string;
		background: string;
		fontWeight: string;
		fontStyle: string;
	}>;
	readonly children?: readonly VSWordMindElixirNode[];
	readonly icons?: readonly string[];
	readonly hyperLink?: string;
	readonly expanded?: boolean;
	readonly direction?: 0 | 1;
	readonly branchColor?: string;
	readonly metadata: VSWordMindElixirNodeMetadata;
}

export interface VSWordMindElixirArrowMetadata {
	readonly vsword: {
		readonly version: typeof VSWORD_MIND_ELIXIR_META_VERSION;
		readonly source: 'freemind-arrowlink';
		readonly startArrow?: 'None' | 'Default';
		readonly endArrow?: 'None' | 'Default';
		readonly startInclination?: string;
		readonly endInclination?: string;
	};
}

export interface VSWordMindElixirArrow {
	readonly id: string;
	readonly label: string;
	readonly from: string;
	readonly to: string;
	readonly bidirectional?: boolean;
	readonly style?: Partial<{
		stroke: string;
		strokeWidth: string | number;
		strokeDasharray: string;
	}>;
	readonly metadata: VSWordMindElixirArrowMetadata;
}

export interface VSWordMindElixirData {
	readonly nodeData: VSWordMindElixirNode;
	readonly arrows: readonly VSWordMindElixirArrow[];
	readonly summaries: readonly VSWordMindElixirSummary[];
	readonly direction: 2;
	readonly meta: {
		readonly vsword: {
			readonly version: typeof VSWORD_MIND_ELIXIR_META_VERSION;
			readonly source: 'freemind-mm';
		};
	};
};

export function mindmapToMindElixirData(root: VSWordMindmapNode): VSWordMindElixirData {
	const arrows: VSWordMindElixirArrow[] = [];
	const summaries: VSWordMindElixirSummary[] = [];
	const nodeData = mindmapNodeToMindElixirNode(root, 'root', arrows, summaries);
	return {
		nodeData,
		arrows,
		summaries,
		direction: 2,
		meta: {
			vsword: {
				version: VSWORD_MIND_ELIXIR_META_VERSION,
				source: 'freemind-mm'
			}
		}
	};
}

function mindmapNodeToMindElixirNode(node: VSWordMindmapNode, path: string, arrows: VSWordMindElixirArrow[], summaries: VSWordMindElixirSummary[]): VSWordMindElixirNode {
	const id = node.id ?? `vsword-generated-${path}`;
	for (const arrowlink of (node.arrowlinks || [])) {
		arrows.push(mindmapArrowlinkToMindElixirArrow(arrowlink, id));
	}
	// Collect summaries from this node: convert to ME format
	if (node.summaries) {
		for (const summary of node.summaries) {
			summaries.push({
				id: summary.id,
				parent: id,
				start: summary.start,
				end: summary.end,
				label: summary.label,
				style: summary.style
			});
		}
	}
	const children = node.children.map((child, index) => mindmapNodeToMindElixirNode(child, `${path}-${index}`, arrows, summaries));
	const result: VSWordMindElixirNode = {
		id,
		topic: node.text,
		style: styleFromMindmapNode(node),
		children: children.length ? children : undefined,
		hyperLink: node.link,
		expanded: node.folded ? false : undefined,
		direction: sideToDirection(node.side),
		branchColor: node.edge?.color,
		metadata: {
			vsword: {
				version: VSWORD_MIND_ELIXIR_META_VERSION,
				source: 'freemind-mm',
				side: node.side,
				folded: node.folded,
				edge: node.edge,
				icons: [...(node.icons || [])],
				font: node.font,
				arrowlinks: [...(node.arrowlinks || [])],
				generatedId: node.id ? undefined : true
			}
		}
	};
	return omitUndefinedElixirNodeFields(result);
}

export function mindElixirNodeToMindmapNode(node: VSWordMindElixirNode): VSWordMindmapNode {
	const metadata = node.metadata?.vsword;
	const style = node.style ?? {};
	const folded = metadata?.folded ?? node.expanded === false;
	const icons = metadata?.icons ? [...metadata.icons] : [];
	const arrowlinks = metadata?.arrowlinks ? [...metadata.arrowlinks] : [];
	const children = (node.children ?? []).map(child => mindElixirNodeToMindmapNode(child));
	const result: VSWordMindmapNode = {
		id: metadata?.generatedId ? undefined : node.id,
		text: node.topic,
		side: metadata?.side ?? directionToSide(node.direction),
		folded,
		link: node.hyperLink,
		color: style.color,
		backgroundColor: style.background,
		font: styleToFont(style, metadata?.font),
		edge: metadata?.edge,
		arrowlinks,
		icons,
		children
	};
	return omitUndefinedNodeFields(result);
}


function mindmapArrowlinkToMindElixirArrow(arrowlink: VSWordMindmapArrowlink, from: string): VSWordMindElixirArrow {
	const result: VSWordMindElixirArrow = {
		id: arrowlink.id,
		label: '',
		from,
		to: arrowlink.destination,
		bidirectional: arrowlink.startArrow === 'Default' && arrowlink.endArrow === 'Default' ? true : undefined,
		style: styleFromArrowlink(arrowlink),
		metadata: {
			vsword: {
				version: VSWORD_MIND_ELIXIR_META_VERSION,
				source: 'freemind-arrowlink',
				startArrow: arrowlink.startArrow,
				endArrow: arrowlink.endArrow,
				startInclination: arrowlink.startInclination,
				endInclination: arrowlink.endInclination
			}
		}
	};
	return omitUndefinedArrowFields(result);
}

function styleFromMindmapNode(node: VSWordMindmapNode): VSWordMindElixirNode['style'] {
	const style: NonNullable<VSWordMindElixirNode['style']> = {};
	if (node.color) {
		style.color = node.color;
	}
	if (node.backgroundColor) {
		style.background = node.backgroundColor;
	}
	if (node.font?.name) {
		style.fontFamily = node.font.name;
	}
	if (node.font?.size !== undefined) {
		style.fontSize = `${node.font.size}px`;
	}
	if (node.font?.bold) {
		style.fontWeight = 'bold';
	}
	if (node.font?.italic) {
		style.fontStyle = 'italic';
	}
	return Object.keys(style).length ? style : undefined;
}

function styleFromArrowlink(arrowlink: VSWordMindmapArrowlink): VSWordMindElixirArrow['style'] {
	const style: NonNullable<VSWordMindElixirArrow['style']> = {};
	if (arrowlink.color) {
		style.stroke = arrowlink.color;
	}
	if (arrowlink.style === 'dashed') {
		style.strokeDasharray = '6 4';
	}
	return Object.keys(style).length ? style : undefined;
}

function styleToFont(style: NonNullable<VSWordMindElixirNode['style']>, fallback?: VSWordMindmapFont): VSWordMindmapFont | undefined {
	const size = parseFontSize(style.fontSize) ?? fallback?.size;
	const name = style.fontFamily ?? fallback?.name;
	const bold = style.fontWeight === 'bold' || style.fontWeight === '700' || fallback?.bold === true;
	const italic = style.fontStyle === 'italic' || fallback?.italic === true;
	if (!name && size === undefined && !bold && !italic) {
		return undefined;
	}
	return {
		name,
		size,
		bold,
		italic
	};
}

function parseFontSize(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function sideToDirection(side: 'left' | 'right' | undefined): 0 | 1 | undefined {
	if (side === 'left') {
		return 0;
	}
	if (side === 'right') {
		return 1;
	}
	return undefined;
}

function directionToSide(direction: 0 | 1 | undefined): 'left' | 'right' | undefined {
	if (direction === 0) {
		return 'left';
	}
	if (direction === 1) {
		return 'right';
	}
	return undefined;
}

function omitUndefinedElixirNodeFields(node: VSWordMindElixirNode): VSWordMindElixirNode {
	return pruneUndefined(node) as VSWordMindElixirNode;
}

function omitUndefinedArrowFields(arrow: VSWordMindElixirArrow): VSWordMindElixirArrow {
	return pruneUndefined(arrow) as VSWordMindElixirArrow;
}

function omitUndefinedNodeFields(node: VSWordMindmapNode): VSWordMindmapNode {
	return pruneUndefined(node) as VSWordMindmapNode;
}

function pruneUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(item => pruneUndefined(item)) as T;
	}
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			if (item !== undefined) {
				result[key] = pruneUndefined(item);
			}
		}
		return result as T;
	}
	return value;
}

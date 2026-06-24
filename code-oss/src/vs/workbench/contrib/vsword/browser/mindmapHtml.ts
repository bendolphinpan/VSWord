/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../webview/common/webview.js';
import { VSWordMindmapNode } from '../common/mindmapXml.js';

export interface VSWordMindmapWebviewModel {
	readonly fileName: string;
	readonly root?: VSWordMindmapNode;
	readonly nodeCount: number;
	readonly sourceKind: 'mm';
	readonly editable: boolean;
	readonly selectedNodeId?: string;
}

export function getMindmapHtml(model: VSWordMindmapWebviewModel): string {
	const cspSource = webviewGenericCspSource;
	const data = escapeScriptJson(model);
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-vsword-mindmap';">
<title>VSWord Mindmap</title>
<style>
	* { box-sizing: border-box; }
	html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
	body {
		font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
		background: radial-gradient(circle at 50% 50%, rgba(120, 120, 120, 0.08), transparent 0 28px), var(--vscode-editor-background, #ffffff);
		background-size: 32px 32px;
		color: var(--vscode-foreground, #1f2328);
	}
	#app { width: 100vw; height: 100vh; position: relative; }
	#toolbar {
		position: fixed;
		top: 12px;
		left: 12px;
		right: 12px;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.35));
		border-radius: 10px;
		background: color-mix(in srgb, var(--vscode-editorWidget-background, #f7f7f7) 92%, transparent);
		box-shadow: 0 8px 28px rgba(0,0,0,.10);
		backdrop-filter: blur(10px);
	}
	.title { font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.badge {
		font-size: 12px;
		padding: 3px 8px;
		border-radius: 999px;
		background: var(--vscode-badge-background, #007acc);
		color: var(--vscode-badge-foreground, #fff);
	}
	.spacer { flex: 1; }
	.hint { color: var(--vscode-descriptionForeground, #666); font-size: 12px; white-space: nowrap; }
	#status {
		font-size: 12px;
		color: var(--vscode-descriptionForeground, #666);
		min-width: 86px;
		text-align: right;
	}
	#status.error { color: var(--vscode-errorForeground, #e51400); }
	#status.success { color: var(--vscode-testing-iconPassed, #2ea043); }
	button {
		border: 1px solid var(--vscode-button-border, transparent);
		border-radius: 6px;
		padding: 4px 9px;
		background: var(--vscode-button-secondaryBackground, #e5e5e5);
		color: var(--vscode-button-secondaryForeground, #222);
		cursor: pointer;
	}
	button:hover { background: var(--vscode-button-secondaryHoverBackground, #d5d5d5); }
	#mindmap-svg { width: 100%; height: 100%; display: block; cursor: grab; }
	#mindmap-svg.panning { cursor: grabbing; }
	.link {
		fill: none;
		stroke: var(--vscode-charts-blue, #4f8cc9);
		stroke-width: 2.1;
		stroke-linecap: round;
		opacity: .72;
	}
	.arrowlink {
		fill: none;
		stroke: var(--vscode-charts-purple, #b46ce0);
		stroke-width: 1.6;
		stroke-linecap: round;
		opacity: 0.85;
		pointer-events: none;
	}
	.arrowlink.selected { stroke-width: 2.6; opacity: 1; }
	.arrowlink-hit {
		fill: none;
		stroke: transparent;
		stroke-width: 14;
		cursor: pointer;
		pointer-events: stroke;
	}
	.al-drag-preview {
		fill: none;
		stroke: var(--vscode-charts-purple, #b46ce0);
		stroke-width: 1.8;
		stroke-dasharray: 6 4;
		opacity: 0.7;
		pointer-events: none;
	}
	.al-endpoint {
		fill: var(--vscode-editorWidget-background, #fff);
		stroke: var(--vscode-charts-purple, #b46ce0);
		stroke-width: 2;
		cursor: grab;
	}
	.al-endpoint:hover { fill: var(--vscode-charts-purple, #b46ce0); }
	.topic.al-target-hover rect {
		stroke: var(--vscode-charts-purple, #b46ce0) !important;
		stroke-width: 3 !important;
		filter: drop-shadow(0 0 6px rgba(180, 108, 224, .55)) !important;
	}
	.topic rect {
		fill: var(--vscode-editorWidget-background, #fff);
		stroke: var(--vscode-editorWidget-border, #b8c2cc);
		stroke-width: 1.3;
		rx: 12;
		ry: 12;
		filter: drop-shadow(0 4px 10px rgba(0,0,0,.12));
	}
	.topic.root rect {
		fill: var(--vscode-button-background, #0e70c0);
		stroke: var(--vscode-button-background, #0e70c0);
	}
	.topic.root text { fill: var(--vscode-button-foreground, #fff); font-weight: 700; }
	.topic text {
		font-size: 13px;
		font-weight: 560;
		fill: var(--vscode-foreground, #1f2328);
		user-select: none;
		pointer-events: none;
	}
	.topic .meta {
		font-size: 11px;
		fill: var(--vscode-descriptionForeground, #6a737d);
		font-weight: 400;
	}
	.topic.root .meta { fill: rgba(255,255,255,.82); }
	.topic.selected rect {
		stroke: var(--vscode-focusBorder, #007fd4);
		stroke-width: 2.5;
		filter: drop-shadow(0 0 4px rgba(0, 127, 212, .35));
	}
	.fold-handle {
		cursor: pointer;
		fill: var(--vscode-editorWidget-background, #2d2d30);
		stroke: var(--vscode-focusBorder, #007fd4);
		stroke-width: 1.2;
	}
	.fold-handle:hover { fill: var(--vscode-list-hoverBackground, #3a3d41); }
	.fold-handle-label {
		pointer-events: none;
		text-anchor: middle;
		dominant-baseline: central;
		font-size: 11px;
		font-weight: 600;
		fill: var(--vscode-foreground, #ddd);
	}
	.icon-picker {
		position: fixed;
		z-index: 60;
		min-width: 220px;
		padding: 8px 10px;
		background: var(--vscode-editorWidget-background, #2d2d30);
		color: var(--vscode-editorWidget-foreground, #ddd);
		border: 1px solid var(--vscode-focusBorder, #007fd4);
		border-radius: 4px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
		font-size: 12px;
	}
	.icon-picker-title {
		font-weight: 600;
		margin-bottom: 6px;
		opacity: .85;
	}
	.icon-picker-grid {
		display: grid;
		grid-template-columns: repeat(8, 22px);
		gap: 4px;
	}
	.icon-picker-cell {
		width: 22px;
		height: 22px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: 1px solid transparent;
		background: var(--vscode-list-hoverBackground, #3a3d41);
		font-size: 14px;
	}
	.icon-picker-cell.active {
		border-color: var(--vscode-focusBorder, #007fd4);
		background: var(--vscode-list-activeSelectionBackground, #094771);
	}
	.icon-picker-cell:hover {
		background: rgba(255, 255, 255, 0.18);
	}
	.style-panel {
		position: absolute;
		z-index: 30;
		background: rgba(20, 20, 24, 0.96);
		color: #f2f2f2;
		border: 1px solid #444;
		border-radius: 6px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 240px;
		max-width: 320px;
		box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
		font-size: 12px;
	}
	.style-panel-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.style-panel-label {
		opacity: 0.7;
		font-size: 11px;
	}
	.style-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.style-swatch {
		width: 18px;
		height: 18px;
		border-radius: 3px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		cursor: pointer;
		box-sizing: border-box;
	}
	.style-swatch.clear {
		background: transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: #ccc;
	}
	.style-swatch.active {
		outline: 2px solid #f2f2f2;
	}
	.style-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.style-btn {
		background: rgba(255, 255, 255, 0.06);
		color: #f2f2f2;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 2px 8px;
		cursor: pointer;
		font-size: 12px;
	}
	.style-btn:hover {
		background: rgba(255, 255, 255, 0.14);
	}
	.style-btn.active {
		background: #2563eb;
		border-color: #2563eb;
	}
	.edit-box {
		position: fixed;
		z-index: 20;
		min-width: 180px;
		padding: 6px 8px;
		border: 1px solid var(--vscode-focusBorder, #007acc);
		border-radius: 8px;
		background: var(--vscode-input-background, #fff);
		color: var(--vscode-input-foreground, #222);
		font: 13px var(--vscode-font-family, sans-serif);
		box-shadow: 0 8px 24px rgba(0,0,0,.18);
		outline: none;
	}
	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		text-align: center;
		color: var(--vscode-descriptionForeground, #666);
		pointer-events: none;
	}
	.empty[hidden] {
		/* HTML hidden attribute alone is overridden by the display:flex above.
		 * Force-hide here so the overlay never blocks SVG hit-testing
		 * when a root node is in fact present. */
		display: none !important;
	}
</style>
</head>
<body>
<div id="app">
	<div id="toolbar">
		<span class="title">🧠 <span id="file-name"></span></span>
		<span class="badge">.mm</span>
		<span class="badge" id="node-count"></span>
		<span class="spacer"></span>
		<span class="hint" id="mode-hint">Read-only MVP · pan/zoom · XMind-style layout</span>
		<span id="status"></span>
		<button id="fit">Fit</button>
	</div>
	<svg id="mindmap-svg" aria-label="VSWord Mindmap"><defs><marker id="al-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--vscode-charts-purple, #b46ce0)"/></marker><marker id="al-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="var(--vscode-charts-purple, #b46ce0)"/></marker></defs><g id="viewport"><g id="links"></g><g id="arrowlinks"></g><g id="topics"></g><g id="arrowlink-overlay"></g></g></svg>
	<div id="empty" class="empty" hidden>No mindmap root node found in this .mm file.</div>
</div>
<script nonce="vsword-mindmap">
(function () {
	'use strict';
	const model = ${data};
	const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	const editable = Boolean(model.editable && vscode);
	// Surface any uncaught JS error directly to the status bar so future bugs
	// don't manifest as silent "nothing happens". Without this, the previous
	// T-5.9 regression looked like dead UI from the user's side.
	function reportError(prefix, err) {
		try {
			const msg = (err && err.stack) ? err.stack : String(err);
			const el = document.getElementById('status');
			if (el) {
				el.textContent = '[' + prefix + '] ' + (msg.split('\\n')[0] || msg).slice(0, 240);
				el.style.color = 'var(--vscode-errorForeground, #f48771)';
			}
			if (vscode) { vscode.postMessage({ type: 'webviewError', prefix: prefix, message: msg }); }
			// eslint-disable-next-line no-console
			console.error('[vsword-mindmap]', prefix, err);
		} catch (_) { /* swallow */ }
	}
	window.addEventListener('error', function (e) { reportError('uncaught', e.error || e.message); });
	window.addEventListener('unhandledrejection', function (e) { reportError('promise', e.reason); });
	const pendingEdits = new Map();
	const pendingStructure = new Map();
	let editingInput = null;
	let editingNode = null;
	let saveSeq = 0;
	let selectedNodeId = model.selectedNodeId || null;
	const nodeElements = new Map();
	const nodeParents = new Map();
	const allNodesById = new Map();
	let selectedArrowlinkKey = null;
	const svg = document.getElementById('mindmap-svg');
	const viewport = document.getElementById('viewport');
	const linksGroup = document.getElementById('links');
	const arrowlinksGroup = document.getElementById('arrowlinks');
	const arrowlinkOverlay = document.getElementById('arrowlink-overlay');
	const topicsGroup = document.getElementById('topics');
	const empty = document.getElementById('empty');
	document.getElementById('file-name').textContent = model.fileName;
	document.getElementById('node-count').textContent = String(model.nodeCount) + ' nodes';
	document.getElementById('mode-hint').textContent = editable ? 'Tab=child · Enter=sibling · Space=fold · i=icon · s=style · a=arrowlink · Delete=remove · Dbl-click=edit' : 'Read-only MVP · pan/zoom · XMind-style layout';

	const state = { x: 0, y: 0, zoom: 1, panning: false, lastX: 0, lastY: 0 };
	const layout = { topicGapX: 190, topicGapY: 28, minTopicWidth: 108, maxTopicWidth: 220, lineHeight: 18, padX: 14, padY: 9 };
	const placed = [];

	if (!model.root) {
		empty.hidden = false;
		return;
	}

	function textWidth(text) { return Math.min(layout.maxTopicWidth, Math.max(layout.minTopicWidth, 32 + String(text || '').length * 7)); }
	function topicHeight(node) { return node.icons && node.icons.length ? 58 : 42; }
	function sideOf(child, index) {
		if (child.side === 'left' || child.side === 'right') { return child.side; }
		return index % 2 === 0 ? 'right' : 'left';
	}
	function measure(node) {
		const children = Array.isArray(node.children) ? node.children : [];
		if (!children.length || node.folded) { return topicHeight(node) + layout.topicGapY; }
		let total = 0;
		for (const child of children) { total += measure(child); }
		return Math.max(topicHeight(node) + layout.topicGapY, total);
	}
	function placeSubtree(node, x, top, side, depth) {
		const children = Array.isArray(node.children) && !node.folded ? node.children : [];
		const ownW = textWidth(node.text);
		const ownH = topicHeight(node);
		const subtreeH = measure(node);
		const y = top + subtreeH / 2;
		placed.push({ node: node, x: x, y: y, w: ownW, h: ownH, side: side, depth: depth });
		let cursor = top;
		for (const child of children) {
			const childH = measure(child);
			placeSubtree(child, x + (side === 'left' ? -layout.topicGapX : layout.topicGapX), cursor, side, depth + 1);
			cursor += childH;
		}
	}
	function layoutTree(root) {
		const rootW = textWidth(root.text) + 34;
		const rootH = topicHeight(root) + 12;
		placed.push({ node: root, x: 0, y: 0, w: rootW, h: rootH, side: 'root', depth: 0 });
		const children = Array.isArray(root.children) && !root.folded ? root.children : [];
		const left = [];
		const right = [];
		children.forEach(function (child, index) { (sideOf(child, index) === 'left' ? left : right).push(child); });
		function placeSide(items, side) {
			let total = 0;
			items.forEach(function (child) { total += measure(child); });
			let cursor = -total / 2;
			items.forEach(function (child) {
				const h = measure(child);
				placeSubtree(child, side === 'left' ? -layout.topicGapX : layout.topicGapX, cursor, side, 1);
				cursor += h;
			});
		}
		placeSide(left, 'left');
		placeSide(right, 'right');
	}
	function nodeKey(node, index) { return node.id || ('node-' + index); }
	function findPlaced(node) { return placed.find(function (item) { return item.node === node; }); }
	function makeSvg(tag, attrs) {
		const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
		Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, String(attrs[key])); });
		return el;
	}
	function truncate(text, max) {
		text = String(text || 'Untitled');
		return text.length > max ? text.slice(0, max - 1) + '…' : text;
	}
	function renderLink(parent, child) {
		const p = findPlaced(parent);
		const c = findPlaced(child);
		if (!p || !c) { return; }
		const edge = child && child.edge ? child.edge : null;
		if (edge && edge.style === 'hide_edge') { return; }
		const pEdge = c.side === 'left' ? p.x - p.w / 2 : p.x + p.w / 2;
		const cEdge = c.side === 'left' ? c.x + c.w / 2 : c.x - c.w / 2;
		const mid = (pEdge + cEdge) / 2;
		const style = edge && edge.style ? edge.style : 'bezier';
		let d;
		if (style === 'linear') {
			d = 'M ' + pEdge + ' ' + p.y + ' L ' + cEdge + ' ' + c.y;
		} else if (style === 'sharp_linear') {
			d = 'M ' + pEdge + ' ' + p.y + ' L ' + mid + ' ' + p.y + ' L ' + mid + ' ' + c.y + ' L ' + cEdge + ' ' + c.y;
		} else if (style === 'sharp_bezier') {
			d = 'M ' + pEdge + ' ' + p.y + ' Q ' + mid + ' ' + p.y + ', ' + mid + ' ' + ((p.y + c.y) / 2) + ' Q ' + mid + ' ' + c.y + ', ' + cEdge + ' ' + c.y;
		} else {
			d = 'M ' + pEdge + ' ' + p.y + ' C ' + mid + ' ' + p.y + ', ' + mid + ' ' + c.y + ', ' + cEdge + ' ' + c.y;
		}
		const attrs = { class: 'link', d: d };
		if (edge) {
			if (edge.color) { attrs.stroke = edge.color; }
			if (edge.width) {
				if (edge.width === 'thin') {
					attrs['stroke-width'] = '1';
				} else {
					const n = parseInt(String(edge.width), 10);
					if (Number.isFinite(n) && n > 0) { attrs['stroke-width'] = String(Math.max(1, Math.min(8, n))); }
				}
			}
		}
		linksGroup.appendChild(makeSvg('path', attrs));
	}
	function collectAllNodes(node) {
		if (!node) { return; }
		if (node.id) { allNodesById.set(node.id, node); }
		const children = Array.isArray(node.children) ? node.children : [];
		for (const child of children) { collectAllNodes(child); }
	}
	function isNodeVisible(nodeId) { return nodeElements.has(nodeId); }
	function findVisibleAncestorId(nodeId) {
		let cur = nodeId;
		const guard = new Set();
		while (cur && !guard.has(cur)) {
			if (isNodeVisible(cur)) { return cur; }
			guard.add(cur);
			const parent = nodeParents.get(cur);
			if (!parent || !parent.id) { break; }
			cur = parent.id;
		}
		// Fallback: ascend via full-tree parent map by scanning allNodesById children.
		const fullParents = new Map();
		allNodesById.forEach(function (n) {
			(n.children || []).forEach(function (c) { if (c.id) { fullParents.set(c.id, n.id); } });
		});
		cur = fullParents.get(nodeId);
		const guard2 = new Set();
		while (cur && !guard2.has(cur)) {
			if (isNodeVisible(cur)) { return cur; }
			guard2.add(cur);
			cur = fullParents.get(cur);
		}
		return null;
	}
	function placedById(id) {
		const entry = nodeElements.get(id);
		return entry ? entry.item : null;
	}
	function anchorOnRect(item, towardX) {
		// Anchor on the left or right edge of the rect closest to target.
		const leftX = item.x - item.w / 2;
		const rightX = item.x + item.w / 2;
		const useRight = towardX >= item.x;
		return { x: useRight ? rightX : leftX, y: item.y, side: useRight ? 'right' : 'left' };
	}
	function arrowlinkPathD(srcItem, dstItem) {
		const sa = anchorOnRect(srcItem, dstItem.x);
		const da = anchorOnRect(dstItem, srcItem.x);
		const dx = da.x - sa.x;
		const dy = da.y - sa.y;
		const dist = Math.max(40, Math.hypot(dx, dy));
		const bulge = Math.min(140, dist * 0.35);
		const cx = (sa.x + da.x) / 2;
		const cy = (sa.y + da.y) / 2 - bulge;
		return { d: 'M ' + sa.x + ' ' + sa.y + ' Q ' + cx + ' ' + cy + ', ' + da.x + ' ' + da.y, sa: sa, da: da };
	}
	function arrowlinkKey(sourceId, arrowlinkId) { return sourceId + '|' + arrowlinkId; }
	function renderArrowlinks() {
		while (arrowlinksGroup.firstChild) { arrowlinksGroup.removeChild(arrowlinksGroup.firstChild); }
		allNodesById.forEach(function (node) {
			if (!node.id) { return; }
			const arrowlinks = Array.isArray(node.arrowlinks) ? node.arrowlinks : [];
			if (!arrowlinks.length) { return; }
			const renderSrcId = isNodeVisible(node.id) ? node.id : findVisibleAncestorId(node.id);
			if (!renderSrcId) { return; }
			const srcItem = placedById(renderSrcId);
			if (!srcItem) { return; }
			arrowlinks.forEach(function (al) {
				if (!al || !al.destination) { return; }
				const renderDstId = isNodeVisible(al.destination) ? al.destination : findVisibleAncestorId(al.destination);
				if (!renderDstId) { return; }
				const dstItem = placedById(renderDstId);
				if (!dstItem) { return; }
				if (renderSrcId === renderDstId) { return; }
				const geom = arrowlinkPathD(srcItem, dstItem);
				const key = arrowlinkKey(node.id, al.id || ('al-' + (al.destination || 'x')));
				const attrs = { class: 'arrowlink' + (selectedArrowlinkKey === key ? ' selected' : ''), d: geom.d, 'data-al-key': key };
				if (al.color) { attrs.stroke = al.color; }
				const startArrow = String(al.startArrow || '').toLowerCase();
				const endArrow = String(al.endArrow || 'default').toLowerCase();
				if (endArrow !== 'none') { attrs['marker-end'] = 'url(#al-arrow-end)'; }
				if (startArrow && startArrow !== 'none') { attrs['marker-start'] = 'url(#al-arrow-start)'; }
				const path = makeSvg('path', attrs);
				const hit = makeSvg('path', { class: 'arrowlink-hit', d: geom.d, 'data-al-key': key });
				arrowlinksGroup.appendChild(path);
				arrowlinksGroup.appendChild(hit);
				if (editable) {
					hit.addEventListener('mousedown', function (event) {
						if (event.button !== 0) { return; }
						event.preventDefault();
						event.stopPropagation();
						selectArrowlink(key);
					});
				}
				if (selectedArrowlinkKey === key && editable) {
					const endpoint = makeSvg('circle', { class: 'al-endpoint', cx: geom.da.x, cy: geom.da.y, r: 6, 'data-al-key': key });
					endpoint.addEventListener('mousedown', function (event) {
						if (event.button !== 0) { return; }
						event.preventDefault();
						event.stopPropagation();
						beginEndpointDrag(node.id, al.id, geom.sa, event);
					});
					arrowlinksGroup.appendChild(endpoint);
				}
			});
		});
	}
	function selectArrowlink(key) {
		selectedArrowlinkKey = key;
		selectedNodeId = null;
		nodeElements.forEach(function (entry) { entry.group.classList.remove('selected'); });
		renderArrowlinks();
	}
	function clearArrowlinkSelection() {
		if (selectedArrowlinkKey) {
			selectedArrowlinkKey = null;
			renderArrowlinks();
		}
	}
	function parseArrowlinkKey(key) {
		if (!key) { return null; }
		const idx = key.indexOf('|');
		if (idx < 0) { return null; }
		return { sourceId: key.slice(0, idx), arrowlinkId: key.slice(idx + 1) };
	}
	function deleteSelectedArrowlink() {
		const parts = parseArrowlinkKey(selectedArrowlinkKey);
		if (!parts) { return false; }
		dispatchStructure({ type: 'removeArrowlink', sourceId: parts.sourceId, arrowlinkId: parts.arrowlinkId }, false);
		return true;
	}
	function clientToViewport(clientX, clientY) {
		const rect = svg.getBoundingClientRect();
		return {
			x: (clientX - rect.left - state.x) / state.zoom,
			y: (clientY - rect.top - state.y) / state.zoom
		};
	}
	function topicIdAtClient(clientX, clientY) {
		const el = document.elementFromPoint(clientX, clientY);
		let cur = el;
		while (cur && cur !== document.body) {
			if (cur.classList && cur.classList.contains('topic') && cur.getAttribute('data-id')) {
				const id = cur.getAttribute('data-id');
				// data-id may be the synthesised 'node-N' for nodes without id; skip those.
				if (id && id.indexOf('node-') !== 0) { return id; }
				return null;
			}
			cur = cur.parentNode;
		}
		return null;
	}
	function clearTargetHover() {
		nodeElements.forEach(function (entry) { entry.group.classList.remove('al-target-hover'); });
	}
	function setTargetHover(id) {
		clearTargetHover();
		if (!id) { return; }
		const entry = nodeElements.get(id);
		if (entry) { entry.group.classList.add('al-target-hover'); }
	}
	let activeDrag = null; // { mode: 'create'|'endpoint', sourceId, arrowlinkId?, startVp, previewEl, onMove, onUp, onKey }
	function endDrag() {
		if (!activeDrag) { return; }
		if (activeDrag.previewEl && activeDrag.previewEl.parentNode) { activeDrag.previewEl.parentNode.removeChild(activeDrag.previewEl); }
		window.removeEventListener('mousemove', activeDrag.onMove, true);
		window.removeEventListener('mouseup', activeDrag.onUp, true);
		window.removeEventListener('keydown', activeDrag.onKey, true);
		clearTargetHover();
		activeDrag = null;
	}
	function beginCreateDrag(sourceId, originEvent) {
		if (!editable || !sourceId) { return; }
		const srcItem = placedById(sourceId);
		if (!srcItem) { return; }
		endDrag();
		const startVp = { x: srcItem.x, y: srcItem.y };
		const preview = makeSvg('path', { class: 'al-drag-preview', d: 'M ' + startVp.x + ' ' + startVp.y + ' L ' + startVp.x + ' ' + startVp.y });
		arrowlinkOverlay.appendChild(preview);
		const drag = { mode: 'create', sourceId: sourceId, startVp: startVp, previewEl: preview };
		drag.onMove = function (ev) {
			const vp = clientToViewport(ev.clientX, ev.clientY);
			preview.setAttribute('d', 'M ' + startVp.x + ' ' + startVp.y + ' L ' + vp.x + ' ' + vp.y);
			const id = topicIdAtClient(ev.clientX, ev.clientY);
			setTargetHover(id && id !== sourceId ? id : null);
		};
		drag.onUp = function (ev) {
			const targetId = topicIdAtClient(ev.clientX, ev.clientY);
			endDrag();
			if (targetId && targetId !== sourceId) {
				dispatchStructure({ type: 'createArrowlink', sourceId: sourceId, destination: targetId, endArrow: 'Default' }, false);
			} else {
				showStatus('Arrowlink cancelled', '');
			}
		};
		drag.onKey = function (ev) {
			if (ev.key === 'Escape') { ev.preventDefault(); endDrag(); showStatus('Arrowlink cancelled', ''); }
		};
		window.addEventListener('mousemove', drag.onMove, true);
		window.addEventListener('mouseup', drag.onUp, true);
		window.addEventListener('keydown', drag.onKey, true);
		activeDrag = drag;
		if (originEvent) {
			// Seed preview to the current cursor position.
			const vp = clientToViewport(originEvent.clientX, originEvent.clientY);
			preview.setAttribute('d', 'M ' + startVp.x + ' ' + startVp.y + ' L ' + vp.x + ' ' + vp.y);
		}
		showStatus('Drag to a topic… (Esc to cancel)', '');
	}
	function beginEndpointDrag(sourceId, arrowlinkId, anchorVp, originEvent) {
		if (!editable || !sourceId || !arrowlinkId) { return; }
		endDrag();
		const preview = makeSvg('path', { class: 'al-drag-preview', d: 'M ' + anchorVp.x + ' ' + anchorVp.y + ' L ' + anchorVp.x + ' ' + anchorVp.y });
		arrowlinkOverlay.appendChild(preview);
		const drag = { mode: 'endpoint', sourceId: sourceId, arrowlinkId: arrowlinkId, startVp: anchorVp, previewEl: preview };
		drag.onMove = function (ev) {
			const vp = clientToViewport(ev.clientX, ev.clientY);
			preview.setAttribute('d', 'M ' + anchorVp.x + ' ' + anchorVp.y + ' L ' + vp.x + ' ' + vp.y);
			const id = topicIdAtClient(ev.clientX, ev.clientY);
			setTargetHover(id && id !== sourceId ? id : null);
		};
		drag.onUp = function (ev) {
			const targetId = topicIdAtClient(ev.clientX, ev.clientY);
			endDrag();
			if (targetId && targetId !== sourceId) {
				dispatchStructure({ type: 'setArrowlinkEndpoint', sourceId: sourceId, arrowlinkId: arrowlinkId, destination: targetId }, false);
			}
		};
		drag.onKey = function (ev) {
			if (ev.key === 'Escape') { ev.preventDefault(); endDrag(); }
		};
		window.addEventListener('mousemove', drag.onMove, true);
		window.addEventListener('mouseup', drag.onUp, true);
		window.addEventListener('keydown', drag.onKey, true);
		activeDrag = drag;
		if (originEvent) {
			const vp = clientToViewport(originEvent.clientX, originEvent.clientY);
			preview.setAttribute('d', 'M ' + anchorVp.x + ' ' + anchorVp.y + ' L ' + vp.x + ' ' + vp.y);
		}
		showStatus('Drag to redirect destination… (Esc to cancel)', '');
	}
	function startArrowlinkCreateFromSelection() {
		const entry = getSelectedEntry();
		if (!entry || !entry.node.id) { showStatus('Select a source topic first', 'error'); return; }
		beginCreateDrag(entry.node.id, null);
	}
	function renderTopic(item, index) {
		const node = item.node;
		const key = nodeKey(node, index);
		const group = makeSvg('g', { class: 'topic' + (item.depth === 0 ? ' root' : ''), transform: 'translate(' + (item.x - item.w / 2) + ',' + (item.y - item.h / 2) + ')', 'data-id': key });
		const rect = makeSvg('rect', { width: item.w, height: item.h });
		if (node.backgroundColor) { rect.setAttribute('fill', node.backgroundColor); }
		if (node.color) { rect.setAttribute('stroke', node.color); }
		group.appendChild(rect);
		const text = makeSvg('text', { x: layout.padX, y: item.h / 2 - (node.icons && node.icons.length ? 2 : -5) });
		text.textContent = (node.folded ? '⊕ ' : '') + truncate(node.text, Math.floor((item.w - 28) / 7));
		if (node.color) { text.setAttribute('fill', node.color); }
		if (node.font) {
			if (node.font.size) { text.setAttribute('font-size', String(node.font.size)); }
			if (node.font.bold) { text.setAttribute('font-weight', 'bold'); }
			if (node.font.italic) { text.setAttribute('font-style', 'italic'); }
			if (node.font.name) { text.setAttribute('font-family', String(node.font.name)); }
		}
		group.appendChild(text);
		if (node.icons && node.icons.length) {
			const meta = makeSvg('text', { class: 'meta', x: layout.padX, y: item.h - 12 });
			meta.textContent = '🏷 ' + node.icons.slice(0, 4).join(' · ');
			group.appendChild(meta);
		}
		if (editable && node.id) {
			group.style.cursor = 'pointer';
			group.addEventListener('mousedown', function (event) {
				if (event.button !== 0) { return; }
				// CRITICAL: stop propagation so the SVG-level pan handler
				// doesn't grab the gesture and turn every click into a pan.
				// Regression introduced in T-5.9 — previously nodes were
				// non-interactive in read-only mode so this didn't matter,
				// but with editable nodes we must capture the click here.
				event.stopPropagation();
				selectNode(node.id);
			});
			group.addEventListener('dblclick', function (event) {
				event.preventDefault();
				event.stopPropagation();
				selectNode(node.id);
				startEditing(node, item, text);
			});
		}
		nodeElements.set(key, { node: node, text: text, group: group, item: item });
		topicsGroup.appendChild(group);

		const hasChildren = Array.isArray(node.children) && node.children.length > 0;
		if (hasChildren && node.id) {
			const handleSide = item.side === 'left' ? 'left' : (item.side === 'root' ? 'right' : item.side);
			const handleX = handleSide === 'left' ? item.x - item.w / 2 - 14 : item.x + item.w / 2 + 14;
			const handle = makeSvg('g', { class: 'fold-handle-group', transform: 'translate(' + handleX + ',' + item.y + ')' });
			const circle = makeSvg('circle', { class: 'fold-handle', r: 9, cx: 0, cy: 0 });
			const label = makeSvg('text', { class: 'fold-handle-label', x: 0, y: 0 });
			label.textContent = node.folded ? '+' : '−';
			handle.appendChild(circle);
			handle.appendChild(label);
			handle.addEventListener('mousedown', function (event) {
				if (event.button !== 0) { return; }
				event.preventDefault();
				event.stopPropagation();
				selectNode(node.id);
				toggleFold(node);
			});
			topicsGroup.appendChild(handle);
		}
	}
	function traverse(node, fn) {
		const children = Array.isArray(node.children) && !node.folded ? node.children : [];
		children.forEach(function (child) {
			if (child.id) { nodeParents.set(child.id, node); }
			fn(node, child);
			traverse(child, fn);
		});
	}
	function selectNode(id) {
		if (!id) { return; }
		selectedNodeId = id;
		if (selectedArrowlinkKey) {
			selectedArrowlinkKey = null;
			renderArrowlinks();
		}
		nodeElements.forEach(function (entry) {
			if (!entry.node.id) { return; }
			entry.group.classList.toggle('selected', entry.node.id === id);
		});
	}
	function applyInitialSelection() {
		if (selectedNodeId && nodeElements.size) {
			let found = false;
			nodeElements.forEach(function (entry) {
				if (!entry.node.id) { return; }
				if (entry.node.id === selectedNodeId) { found = true; }
			});
			if (found) { selectNode(selectedNodeId); }
		}
	}
	function getSelectedEntry() {
		if (!selectedNodeId) { return null; }
		var match = null;
		nodeElements.forEach(function (entry) {
			if (entry.node.id === selectedNodeId) { match = entry; }
		});
		return match;
	}
	function dispatchStructure(payload, expectNewSelection) {
		if (!editable) { return; }
		const requestId = String(++saveSeq);
		pendingStructure.set(requestId, { expectNewSelection: !!expectNewSelection });
		payload.requestId = requestId;
		showStatus('Saving…', '');
		vscode.postMessage(payload);
	}
	function requestAppendChild() {
		const entry = getSelectedEntry();
		if (!entry || !entry.node.id) { return; }
		dispatchStructure({ type: 'appendChild', parentId: entry.node.id, text: 'New topic' }, true);
	}
	function requestAppendSibling() {
		const entry = getSelectedEntry();
		if (!entry || !entry.node.id) { return; }
		const parent = nodeParents.get(entry.node.id);
		if (!parent) {
			showStatus('Root has no sibling', 'error');
			return;
		}
		dispatchStructure({ type: 'appendSibling', siblingId: entry.node.id, text: 'New topic', position: entry.item.side === 'left' ? 'left' : (entry.item.side === 'right' ? 'right' : undefined) }, true);
	}
	function requestRemove() {
		const entry = getSelectedEntry();
		if (!entry || !entry.node.id) { return; }
		if (!nodeParents.get(entry.node.id)) {
			showStatus('Cannot delete the root', 'error');
			return;
		}
		dispatchStructure({ type: 'removeNode', nodeId: entry.node.id }, false);
	}
	function toggleFold(node) {
		if (!node || !node.id) { return; }
		if (!Array.isArray(node.children) || node.children.length === 0) {
			showStatus('No children to fold', 'error');
			return;
		}
		dispatchStructure({ type: 'toggleFolded', nodeId: node.id, folded: !node.folded }, true);
	}
	function toggleFoldSelected() {
		const entry = getSelectedEntry();
		if (entry) { toggleFold(entry.node); }
	}
	const BUILTIN_ICONS = [
		{ id: 'idea', glyph: '💡' },
		{ id: 'help', glyph: '❓' },
		{ id: 'attention', glyph: '⚠' },
		{ id: 'flag', glyph: '🚩' },
		{ id: 'button_ok', glyph: '✅' },
		{ id: 'button_cancel', glyph: '❌' },
		{ id: 'full-1', glyph: '①' },
		{ id: 'full-2', glyph: '②' },
		{ id: 'full-3', glyph: '③' },
		{ id: 'full-4', glyph: '④' },
		{ id: 'full-5', glyph: '⑤' },
		{ id: 'stop-sign', glyph: '🛑' },
		{ id: 'clock', glyph: '⏰' },
		{ id: 'calendar', glyph: '📅' },
		{ id: 'wizard', glyph: '🪄' },
		{ id: 'family', glyph: '👨‍👩‍👧' }
	];
	let iconPickerEl = null;
	function closeIconPicker() {
		if (iconPickerEl) {
			iconPickerEl.remove();
			iconPickerEl = null;
		}
	}
	const TEXT_COLOR_SWATCHES = ['#000000', '#1f2937', '#ef4444', '#f59e0b', '#10b981', '#2563eb', '#7c3aed', '#db2777'];
	const BG_COLOR_SWATCHES = ['#ffffff', '#fde68a', '#fecaca', '#bbf7d0', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#e5e7eb'];
	const EDGE_COLOR_SWATCHES = ['#94a3b8', '#1f2937', '#ef4444', '#f59e0b', '#10b981', '#2563eb', '#7c3aed', '#db2777'];
	let stylePanelEl = null;
	function closeStylePanel() {
		if (stylePanelEl) {
			stylePanelEl.remove();
			stylePanelEl = null;
		}
	}
	function buildSwatchRow(palette, current, onPick) {
		const wrap = document.createElement('div');
		wrap.className = 'style-swatches';
		const clearCell = document.createElement('div');
		clearCell.className = 'style-swatch clear' + (current ? '' : ' active');
		clearCell.title = 'Clear';
		clearCell.textContent = '✕';
		clearCell.addEventListener('mousedown', function (event) {
			event.preventDefault();
			event.stopPropagation();
			onPick(null);
		});
		wrap.appendChild(clearCell);
		palette.forEach(function (color) {
			const cell = document.createElement('div');
			cell.className = 'style-swatch' + (current && current.toLowerCase() === color.toLowerCase() ? ' active' : '');
			cell.style.background = color;
			cell.title = color;
			cell.addEventListener('mousedown', function (event) {
				event.preventDefault();
				event.stopPropagation();
				onPick(color);
			});
			wrap.appendChild(cell);
		});
		return wrap;
	}
	function openStylePanel() {
		closeStylePanel();
		closeIconPicker();
		const entry = getSelectedEntry();
		if (!entry || !entry.node.id) { return; }
		const rect = entry.group.getBoundingClientRect();
		const panel = document.createElement('div');
		panel.className = 'style-panel';
		panel.style.left = Math.max(8, rect.left) + 'px';
		panel.style.top = (rect.bottom + 6) + 'px';
		panel.addEventListener('mousedown', function (event) { event.stopPropagation(); });

		const colorSec = document.createElement('div');
		colorSec.className = 'style-panel-section';
		const colorLabel = document.createElement('div');
		colorLabel.className = 'style-panel-label';
		colorLabel.textContent = 'Text color';
		colorSec.appendChild(colorLabel);
		colorSec.appendChild(buildSwatchRow(TEXT_COLOR_SWATCHES, entry.node.color || null, function (color) {
			dispatchStructure({ type: 'setColor', nodeId: entry.node.id, color: color }, true);
			closeStylePanel();
		}));
		panel.appendChild(colorSec);

		const bgSec = document.createElement('div');
		bgSec.className = 'style-panel-section';
		const bgLabel = document.createElement('div');
		bgLabel.className = 'style-panel-label';
		bgLabel.textContent = 'Background';
		bgSec.appendChild(bgLabel);
		bgSec.appendChild(buildSwatchRow(BG_COLOR_SWATCHES, entry.node.backgroundColor || null, function (color) {
			dispatchStructure({ type: 'setBackgroundColor', nodeId: entry.node.id, color: color }, true);
			closeStylePanel();
		}));
		panel.appendChild(bgSec);

		const fontSec = document.createElement('div');
		fontSec.className = 'style-panel-section';
		const fontLabel = document.createElement('div');
		fontLabel.className = 'style-panel-label';
		const currentSize = entry.node.font && entry.node.font.size ? entry.node.font.size : 12;
		const currentBold = !!(entry.node.font && entry.node.font.bold);
		const currentItalic = !!(entry.node.font && entry.node.font.italic);
		fontLabel.textContent = 'Font · size ' + currentSize;
		fontSec.appendChild(fontLabel);
		const fontRow = document.createElement('div');
		fontRow.className = 'style-row';
		const minus = document.createElement('button');
		minus.className = 'style-btn';
		minus.textContent = 'A−';
		minus.title = 'Smaller (-1)';
		minus.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			const next = Math.max(6, currentSize - 1);
			dispatchStructure({ type: 'setFont', nodeId: entry.node.id, size: next }, true);
			closeStylePanel();
		});
		const plus = document.createElement('button');
		plus.className = 'style-btn';
		plus.textContent = 'A+';
		plus.title = 'Larger (+1)';
		plus.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			const next = Math.min(96, currentSize + 1);
			dispatchStructure({ type: 'setFont', nodeId: entry.node.id, size: next }, true);
			closeStylePanel();
		});
		const boldBtn = document.createElement('button');
		boldBtn.className = 'style-btn' + (currentBold ? ' active' : '');
		boldBtn.textContent = 'B';
		boldBtn.style.fontWeight = 'bold';
		boldBtn.title = 'Toggle bold';
		boldBtn.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			dispatchStructure({ type: 'setFont', nodeId: entry.node.id, bold: !currentBold }, true);
			closeStylePanel();
		});
		const italicBtn = document.createElement('button');
		italicBtn.className = 'style-btn' + (currentItalic ? ' active' : '');
		italicBtn.textContent = 'I';
		italicBtn.style.fontStyle = 'italic';
		italicBtn.title = 'Toggle italic';
		italicBtn.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			dispatchStructure({ type: 'setFont', nodeId: entry.node.id, italic: !currentItalic }, true);
			closeStylePanel();
		});
		const resetBtn = document.createElement('button');
		resetBtn.className = 'style-btn';
		resetBtn.textContent = 'Reset';
		resetBtn.title = 'Remove font overrides';
		resetBtn.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			dispatchStructure({ type: 'setFont', nodeId: entry.node.id, size: null, bold: null, italic: null, name: null }, true);
			closeStylePanel();
		});
		fontRow.appendChild(minus);
		fontRow.appendChild(plus);
		fontRow.appendChild(boldBtn);
		fontRow.appendChild(italicBtn);
		fontRow.appendChild(resetBtn);
		fontSec.appendChild(fontRow);
		panel.appendChild(fontSec);

		const edgeSec = document.createElement('div');
		edgeSec.className = 'style-panel-section';
		const edgeLabel = document.createElement('div');
		edgeLabel.className = 'style-panel-label';
		edgeLabel.textContent = 'Edge (line to parent)';
		edgeSec.appendChild(edgeLabel);
		if (entry.item && entry.item.depth === 0) {
			const edgeHint = document.createElement('div');
			edgeHint.className = 'style-panel-label';
			edgeHint.style.opacity = '0.6';
			edgeHint.textContent = 'Root node has no parent edge';
			edgeSec.appendChild(edgeHint);
		} else {
			const curEdge = entry.node.edge || {};
			edgeSec.appendChild(buildSwatchRow(EDGE_COLOR_SWATCHES, curEdge.color || null, function (color) {
				dispatchStructure({ type: 'setEdge', nodeId: entry.node.id, color: color }, true);
				closeStylePanel();
			}));
			const widthRow = document.createElement('div');
			widthRow.className = 'style-row';
			const widthOpts = [{ k: null, label: 'auto' }, { k: 'thin', label: 'thin' }, { k: 1, label: '1' }, { k: 2, label: '2' }, { k: 4, label: '4' }, { k: 6, label: '6' }];
			widthOpts.forEach(function (opt) {
				const btn = document.createElement('button');
				const isActive = (opt.k === null && !curEdge.width) || (curEdge.width != null && String(curEdge.width) === String(opt.k));
				btn.className = 'style-btn' + (isActive ? ' active' : '');
				btn.textContent = opt.label;
				btn.title = 'Width: ' + opt.label;
				btn.addEventListener('click', function (event) {
					event.preventDefault();
					event.stopPropagation();
					dispatchStructure({ type: 'setEdge', nodeId: entry.node.id, width: opt.k }, true);
					closeStylePanel();
				});
				widthRow.appendChild(btn);
			});
			edgeSec.appendChild(widthRow);
			const styleRow = document.createElement('div');
			styleRow.className = 'style-row';
			const styleOpts = [
				{ k: null, label: 'auto' },
				{ k: 'bezier', label: 'curve' },
				{ k: 'linear', label: 'line' },
				{ k: 'sharp_linear', label: 'L-shape' },
				{ k: 'sharp_bezier', label: 'rounded' },
				{ k: 'hide_edge', label: 'hide' }
			];
			styleOpts.forEach(function (opt) {
				const btn = document.createElement('button');
				const isActive = (opt.k === null && !curEdge.style) || (curEdge.style === opt.k);
				btn.className = 'style-btn' + (isActive ? ' active' : '');
				btn.textContent = opt.label;
				btn.title = 'Style: ' + opt.label;
				btn.addEventListener('click', function (event) {
					event.preventDefault();
					event.stopPropagation();
					dispatchStructure({ type: 'setEdge', nodeId: entry.node.id, style: opt.k }, true);
					closeStylePanel();
				});
				styleRow.appendChild(btn);
			});
			edgeSec.appendChild(styleRow);
		}
		panel.appendChild(edgeSec);

		const hint = document.createElement('div');
		hint.className = 'style-panel-label';
		hint.textContent = 'Esc to close';
		panel.appendChild(hint);

		document.body.appendChild(panel);
		stylePanelEl = panel;
	}
	function openIconPicker() {
		closeIconPicker();
		const entry = getSelectedEntry();
		if (!entry || !entry.node.id) { return; }
		const rect = entry.group.getBoundingClientRect();
		const picker = document.createElement('div');
		picker.className = 'icon-picker';
		picker.style.left = Math.max(8, rect.left) + 'px';
		picker.style.top = (rect.bottom + 6) + 'px';
		const title = document.createElement('div');
		title.className = 'icon-picker-title';
		title.textContent = 'Icons · click to toggle · Esc to close';
		picker.appendChild(title);
		const grid = document.createElement('div');
		grid.className = 'icon-picker-grid';
		const current = new Set(Array.isArray(entry.node.icons) ? entry.node.icons : []);
		BUILTIN_ICONS.forEach(function (icon) {
			const cell = document.createElement('div');
			cell.className = 'icon-picker-cell' + (current.has(icon.id) ? ' active' : '');
			cell.title = icon.id;
			cell.textContent = icon.glyph;
			cell.addEventListener('mousedown', function (event) {
				event.preventDefault();
				event.stopPropagation();
				dispatchStructure({ type: 'toggleIcon', nodeId: entry.node.id, icon: icon.id, add: !current.has(icon.id) }, true);
				closeIconPicker();
			});
			grid.appendChild(cell);
		});
		picker.appendChild(grid);
		document.body.appendChild(picker);
		iconPickerEl = picker;
	}
	function showStatus(message, kind) {
		const status = document.getElementById('status');
		status.textContent = message || '';
		status.className = kind || '';
	}
	function startEditing(node, item, textEl) {
		if (!editable || !node.id) { return; }
		finishEditing(false);
		const rect = svg.getBoundingClientRect();
		const screenX = rect.left + state.x + (item.x - item.w / 2 + 6) * state.zoom;
		const screenY = rect.top + state.y + (item.y - item.h / 2 + 6) * state.zoom;
		const input = document.createElement('input');
		input.className = 'edit-box';
		input.value = node.text || '';
		input.style.left = screenX + 'px';
		input.style.top = screenY + 'px';
		input.style.width = Math.max(180, item.w * state.zoom - 12) + 'px';
		document.body.appendChild(input);
		editingInput = input;
		editingNode = { node: node, textEl: textEl, oldText: node.text || '' };
		input.focus();
		input.select();
		input.addEventListener('keydown', function (event) {
			if (event.isComposing) { return; }
			if (event.key === 'Enter') { event.preventDefault(); finishEditing(true); }
			if (event.key === 'Escape') { event.preventDefault(); finishEditing(false); }
		});
		input.addEventListener('blur', function () { finishEditing(true); });
	}
	function finishEditing(commit) {
		if (!editingInput || !editingNode) { return; }
		const input = editingInput;
		const current = editingNode;
		editingInput = null;
		editingNode = null;
		input.remove();
		const nextText = input.value.trim();
		if (!commit || !nextText || nextText === current.oldText || !current.node.id) { return; }
		current.node.text = nextText;
		current.textEl.textContent = (current.node.folded ? '⊕ ' : '') + truncate(nextText, 24);
		const requestId = String(++saveSeq);
		pendingEdits.set(requestId, current);
		showStatus('Saving…', '');
		vscode.postMessage({ type: 'updateNodeText', requestId: requestId, nodeId: current.node.id, text: nextText });
	}
	window.addEventListener('message', function (event) {
		const msg = event.data || {};
		if (msg.type === 'nodeTextUpdated') {
			const pending = pendingEdits.get(String(msg.requestId));
			pendingEdits.delete(String(msg.requestId));
			if (msg.ok) {
				showStatus('Saved', 'success');
				return;
			}
			if (pending) {
				pending.node.text = pending.oldText;
				pending.textEl.textContent = (pending.node.folded ? '⊕ ' : '') + truncate(pending.oldText, 24);
			}
			showStatus('Save failed', 'error');
			return;
		}
		if (msg.type === 'structureUpdated') {
			pendingStructure.delete(String(msg.requestId));
			if (!msg.ok) {
				showStatus('Save failed', 'error');
			}
		}
	});
	if (editable) {
		window.addEventListener('keydown', function (event) {
			if (editingInput) { return; }
			if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) { return; }
			if (event.metaKey || event.ctrlKey || event.altKey) { return; }
			if (event.key === 'Tab') {
				event.preventDefault();
				requestAppendChild();
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				if (selectedNodeId && nodeParents.get(selectedNodeId)) {
					requestAppendSibling();
				} else {
					const entry = getSelectedEntry();
					if (entry) { startEditing(entry.node, entry.item, entry.text); }
				}
				return;
			}
			if (event.key === 'F2') {
				event.preventDefault();
				const entry = getSelectedEntry();
				if (entry) { startEditing(entry.node, entry.item, entry.text); }
				return;
			}
			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				if (selectedArrowlinkKey) {
					deleteSelectedArrowlink();
				} else {
					requestRemove();
				}
				return;
			}
			if (event.key === 'a' || event.key === 'A') {
				event.preventDefault();
				startArrowlinkCreateFromSelection();
				return;
			}
			if (event.key === ' ' || event.code === 'Space') {
				event.preventDefault();
				toggleFoldSelected();
				return;
			}
			if (event.key === 'i' || event.key === 'I') {
				event.preventDefault();
				openIconPicker();
				return;
			}
			if (event.key === 's' || event.key === 'S') {
				event.preventDefault();
				openStylePanel();
				return;
			}
			if (event.key === 'Escape') {
				closeIconPicker();
				closeStylePanel();
				clearArrowlinkSelection();
				return;
			}
		});
	}
	function updateTransform() { viewport.setAttribute('transform', 'translate(' + state.x + ',' + state.y + ') scale(' + state.zoom + ')'); }
	function fit() {
		const box = viewport.getBBox();
		const width = Math.max(1, svg.clientWidth);
		const height = Math.max(1, svg.clientHeight);
		const scale = Math.max(0.18, Math.min(1.4, Math.min((width - 120) / Math.max(1, box.width), (height - 120) / Math.max(1, box.height))));
		state.zoom = scale;
		state.x = width / 2 - (box.x + box.width / 2) * scale;
		state.y = height / 2 - (box.y + box.height / 2) * scale + 20;
		updateTransform();
	}
	layoutTree(model.root);
	collectAllNodes(model.root);
	traverse(model.root, renderLink);
	placed.forEach(renderTopic);
	renderArrowlinks();
	if (!nodeParents.size && model.root) {
		// Ensure parent map built even when traverse skipped folded subtrees.
		(function walk(parent) {
			(parent.children || []).forEach(function (child) {
				if (child.id) { nodeParents.set(child.id, parent); }
				walk(child);
			});
		})(model.root);
	}
	if (!selectedNodeId && model.root && model.root.id) {
		selectedNodeId = model.root.id;
	}
	applyInitialSelection();
	fit();
	document.getElementById('fit').addEventListener('click', fit);
	svg.addEventListener('wheel', function (event) {
		event.preventDefault();
		const rect = svg.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		const oldZoom = state.zoom;
		const delta = event.deltaY < 0 ? 1.12 : 0.88;
		state.zoom = Math.max(0.12, Math.min(3.5, state.zoom * delta));
		const factor = state.zoom / oldZoom;
		state.x = mouseX - (mouseX - state.x) * factor;
		state.y = mouseY - (mouseY - state.y) * factor;
		updateTransform();
	}, { passive: false });
	svg.addEventListener('mousedown', function (event) {
		state.panning = true;
		state.lastX = event.clientX;
		state.lastY = event.clientY;
		svg.classList.add('panning');
	});
	window.addEventListener('mousemove', function (event) {
		if (!state.panning) { return; }
		state.x += event.clientX - state.lastX;
		state.y += event.clientY - state.lastY;
		state.lastX = event.clientX;
		state.lastY = event.clientY;
		updateTransform();
	});
	window.addEventListener('mouseup', function () {
		state.panning = false;
		svg.classList.remove('panning');
	});
})();
</script>
</body>
</html>`;
}

function escapeScriptJson(value: VSWordMindmapWebviewModel): string {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

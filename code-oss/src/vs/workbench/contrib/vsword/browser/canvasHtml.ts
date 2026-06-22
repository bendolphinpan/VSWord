/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Generates the HTML content for the Canvas webview.
 *
 * This is a self-contained single-file app: SVG-based infinite canvas with
 * pan/zoom, draggable file cards, and postMessage communication back to the
 * host for persistence and file-open actions.
 */

export function getCanvasHtml(): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VSWord Canvas</title>
<style>
	* { margin: 0; padding: 0; box-sizing: border-box; }
	html, body { width: 100%; height: 100%; overflow: hidden; font-family: var(--vscode-font-family, 'Segoe UI', sans-serif); }
	body { background: var(--vscode-editor-background, #ffffff); }

	#canvas-container {
		width: 100vw;
		height: 100vh;
		cursor: grab;
		position: relative;
	}
	#canvas-container.panning { cursor: grabbing; }

	#canvas-svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* Grid background pattern */
	.canvas-bg {
		fill: var(--vscode-editor-background, #ffffff);
	}
	.grid-line {
		stroke: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.15));
		stroke-width: 1;
	}

	/* File card */
	.card {
		cursor: move;
	}
	.card-bg {
		fill: var(--vscode-editorHoverWidget-background, #f5f5f5);
		stroke: var(--vscode-editorHoverWidget-border, #cccccc);
		stroke-width: 1;
		rx: 6;
		ry: 6;
		transition: stroke 0.15s, fill 0.15s;
	}
	.card:hover .card-bg {
		fill: var(--vscode-list-hoverBackground, #e8e8e8);
		stroke: var(--vscode-focusBorder, #0078d4);
	}
	.card.selected .card-bg {
		stroke: var(--vscode-focusBorder, #0078d4);
		stroke-width: 2;
	}
	.card-icon {
		font-size: 20px;
		pointer-events: none;
		user-select: none;
	}
	.card-label {
		font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
		font-size: 13px;
		fill: var(--vscode-foreground, #333333);
		pointer-events: none;
		user-select: none;
		font-weight: 500;
	}
	.card-path {
		font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
		font-size: 11px;
		fill: var(--vscode-descriptionForeground, #888888);
		pointer-events: none;
		user-select: none;
	}

	/* Toolbar */
	#toolbar {
		position: fixed;
		top: 12px;
		left: 12px;
		z-index: 100;
		display: flex;
		gap: 8px;
		align-items: center;
		background: var(--vscode-editorHoverWidget-background, #f5f5f5);
		border: 1px solid var(--vscode-editorHoverWidget-border, #ddd);
		border-radius: 6px;
		padding: 6px 10px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.08);
	}
	#toolbar button {
		background: var(--vscode-button-background, #0078d4);
		color: var(--vscode-button-foreground, #ffffff);
		border: none;
		border-radius: 4px;
		padding: 4px 8px;
		cursor: pointer;
		font-size: 12px;
		font-family: var(--vscode-font-family, sans-serif);
	}
	#toolbar button:hover {
		background: var(--vscode-button-hoverBackground, #006cbd);
	}
	#zoom-display {
		font-size: 12px;
		color: var(--vscode-descriptionForeground, #888);
		min-width: 48px;
		text-align: center;
	}

		/* Edge */
		.edge {
			stroke: var(--vscode-editor-foreground, #333);
			stroke-width: 2;
			fill: none;
			cursor: pointer;
			transition: stroke 0.15s, stroke-width 0.15s;
		}
		.edge:hover { stroke: var(--vscode-focusBorder, #0078d4); stroke-width: 3; }
		.edge.selected { stroke: var(--vscode-focusBorder, #0078d4); stroke-width: 3; }
		.edge.dragging { stroke: var(--vscode-focusBorder, #0078d4); stroke-width: 2; stroke-dasharray: 6 4; }
		.edge-arrow {
			fill: var(--vscode-editor-foreground, #333);
			cursor: pointer;
		}
		.edge-arrow:hover, .edge-arrow.selected { fill: var(--vscode-focusBorder, #0078d4); }
		/* Connection ports on cards */
		.port {
			fill: var(--vscode-editorWidget-background, #fff);
			stroke: var(--vscode-descriptionForeground, #888);
			stroke-width: 1.5;
			cursor: crosshair;
			opacity: 0;
			transition: opacity 0.2s;
		}
		.card:hover .port { opacity: 1; }
		.port:hover { fill: var(--vscode-focusBorder, #0078d4); stroke: var(--vscode-focusBorder, #0078d4); }

		/* Preview (expanded card) */
	.card-expanded .card-bg {
		fill: var(--vscode-editor-background, #ffffff);
	}
	.preview-btn {
		cursor: pointer;
		pointer-events: all;
	}
	.preview-btn-bg {
		fill: var(--vscode-button-secondaryBackground, #e0e0e0);
		stroke: var(--vscode-button-secondaryBorder, #ccc);
		stroke-width: 1;
		rx: 3;
		ry: 3;
	}
	.preview-btn:hover .preview-btn-bg {
		fill: var(--vscode-list-hoverBackground, #d0d0d0);
	}
	.preview-btn-text {
		font-size: 11px;
		fill: var(--vscode-button-secondaryForeground, #333);
		pointer-events: none;
		user-select: none;
	}
	.md-preview {
		font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
		font-size: 12px;
		color: var(--vscode-foreground, #333);
		overflow: hidden;
	}
	.md-preview h1 { font-size: 15px; font-weight: 600; margin: 4px 0 2px; }
	.md-preview h2 { font-size: 14px; font-weight: 600; margin: 4px 0 2px; }
	.md-preview h3 { font-size: 13px; font-weight: 600; margin: 3px 0 2px; }
	.md-preview p { margin: 2px 0; }
	.md-preview ul { margin: 2px 0 2px 16px; padding: 0; }
	.md-preview li { margin: 1px 0; }
	.md-preview code {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 11px;
		background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
		padding: 1px 3px;
		border-radius: 3px;
	}
	.md-preview pre {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 11px;
		background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
		padding: 4px 6px;
		border-radius: 4px;
		overflow: hidden;
		margin: 2px 0;
	}
	.md-preview strong { font-weight: 600; }
	.md-preview em { font-style: italic; }

	/* Text node */
	.text-node { cursor: move; }
	.text-node-bg {
		fill: var(--vscode-editorWidget-background, #fffbe8);
		stroke: var(--vscode-editorWidget-border, #d4c97e);
		stroke-width: 1;
		rx: 4; ry: 4;
	}
	.text-node:hover .text-node-bg, .text-node.selected .text-node-bg {
		stroke: var(--vscode-focusBorder, #0078d4);
		stroke-width: 2;
	}
	.text-content {
		font-family: var(--vscode-font-family, sans-serif);
		font-size: 13px;
		color: var(--vscode-foreground, #222);
		width: 100%; height: 100%;
		padding: 6px 8px;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		box-sizing: border-box;
		white-space: pre-wrap;
		overflow: hidden;
	}

	/* Group node */
	.group-node { cursor: move; }
	.group-bg {
		fill: var(--vscode-editorGroupHeader-tabsBackground, rgba(120,120,120,0.08));
		stroke: var(--vscode-editorGroup-border, #888);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		rx: 8; ry: 8;
	}
	.group-node:hover .group-bg, .group-node.selected .group-bg {
		stroke: var(--vscode-focusBorder, #0078d4);
	}
	.group-header {
		fill: var(--vscode-editorGroup-border, rgba(120,120,120,0.2));
		rx: 8; ry: 8;
	}
	.group-label-text {
		font-family: var(--vscode-font-family, sans-serif);
		font-size: 12px;
		font-weight: 600;
		fill: var(--vscode-foreground, #333);
		pointer-events: none;
		user-select: none;
	}

	/* Drawing node */
	.drawing-node { cursor: move; }
	.drawing-stroke {
		fill: none;
		stroke: var(--vscode-editor-foreground, #333);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.drawing-node.selected .drawing-stroke {
		stroke: var(--vscode-focusBorder, #0078d4);
	}
	.drawing-bbox {
		fill: transparent;
		stroke: none;
	}
	.drawing-node:hover .drawing-bbox, .drawing-node.selected .drawing-bbox {
		stroke: var(--vscode-focusBorder, #0078d4);
		stroke-dasharray: 4 3;
		stroke-width: 1;
	}

	#toolbar button.tool-active {
		background: var(--vscode-button-hoverBackground, #006cbd);
		outline: 2px solid var(--vscode-focusBorder, #0078d4);
	}
	#canvas-container.tool-text { cursor: text; }
	#canvas-container.tool-group { cursor: crosshair; }
	#canvas-container.tool-draw { cursor: crosshair; }

	/* Empty state */
	#empty-state {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: var(--vscode-descriptionForeground, #888);
		pointer-events: none;
	}
	#empty-state h2 { font-size: 18px; margin-bottom: 8px; }
	#empty-state p { font-size: 13px; }
</style>
</head>
<body>

<div id="toolbar">
	<button id="btn-zoom-out" title="Zoom out">−</button>
	<span id="zoom-display">100%</span>
	<button id="btn-zoom-in" title="Zoom in">+</button>
	<button id="btn-fit" title="Fit to view">Fit</button>
	<button id="btn-reset" title="Reset zoom">1:1</button>
	<span style="width:1px;height:18px;background:var(--vscode-editorGroup-border,#999);margin:0 4px"></span>
	<button id="btn-add-text" title="Add text note (T)">+ Text</button>
	<button id="btn-add-group" title="Add group (G)">+ Group</button>
	<button id="btn-draw" title="Draw freehand (D)">✎ Draw</button>
</div>

<div id="canvas-container">
	<svg id="canvas-svg" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
				<path class="grid-line" d="M 40 0 L 0 0 0 40" fill="none"/>
			</pattern>
		</defs>
		<g id="viewport-group">
			<rect id="grid-rect" class="canvas-bg" width="10000" height="10000" x="-5000" y="-5000" fill="url(#grid-pattern)"/>
			<g id="edges-group"></g>
			<g id="nodes-group"></g>
		</g>
	</svg>
</div>

<div id="empty-state" style="display:none">
	<h2>Canvas is empty</h2>
	<p>Open a folder to see files as cards on this canvas.</p>
</div>

<script>
(function() {
	'use strict';

	const vscode = acquireVsCodeApi();
	const svg = document.getElementById('canvas-svg');
	const viewportGroup = document.getElementById('viewport-group');
	const nodesGroup = document.getElementById('nodes-group');
	const edgesGroup = document.getElementById('edges-group');
	const zoomDisplay = document.getElementById('zoom-display');
	const emptyState = document.getElementById('empty-state');

	// Canvas state
	let state = {
		viewport: { x: 0, y: 0, zoom: 1 },
		nodes: [],
		edges: []
	};

	let selectedId = null;
	let expandedNodes = {}; // nodeId -> true
	let fileContents = {};  // nodeId -> string
	let pendingLoad = {};   // nodeId -> true (request sent, waiting)
	let currentTool = null; // null | 'text' | 'group' | 'draw'
	let editingNodeId = null; // text node currently being edited

	// Viewport transform
	function applyViewport() {
		const { x, y, zoom } = state.viewport;
		viewportGroup.setAttribute('transform', 'translate(' + x + ',' + y + ') scale(' + zoom + ')');
		zoomDisplay.textContent = Math.round(zoom * 100) + '%';
	}

	// ---- Markdown to HTML (minimal, safe) ----
	function escapeHtml(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function mdToHtml(md) {
		const lines = md.split('\\n');
		let html = '';
		let inList = false;
		let inCode = false;
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			// Code fence
			if (line.trimStart().startsWith('\\x60\\x60\\x60')) {
				if (inCode) {
					html += '</code></pre>';
					inCode = false;
				} else {
					html += '<pre><code>';
					inCode = true;
				}
				continue;
			}
			if (inCode) {
				html += escapeHtml(line) + '\\n';
				continue;
			}
			// Headings
			if (line.startsWith('### ')) { html += '<h3>' + inlineMd(line.slice(4)) + '</h3>'; continue; }
			if (line.startsWith('## ')) { html += '<h2>' + inlineMd(line.slice(3)) + '</h2>'; continue; }
			if (line.startsWith('# ')) { html += '<h1>' + inlineMd(line.slice(2)) + '</h1>'; continue; }
			// List items
			if (line.match(/^\\s*[-*+]\\s/)) {
				if (!inList) { html += '<ul>'; inList = true; }
				html += '<li>' + inlineMd(line.replace(/^\\s*[-*+]\\s/, '')) + '</li>';
				continue;
			} else if (inList) {
				html += '</ul>';
				inList = false;
			}
			// Empty line
			if (line.trim() === '') { continue; }
			// Paragraph
			html += '<p>' + inlineMd(line) + '</p>';
		}
		if (inList) html += '</ul>';
		if (inCode) html += '</code></pre>';
		return html;
	}

	function inlineMd(s) {
		s = escapeHtml(s);
		// Bold
		s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
		// Italic
		s = s.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
		// Inline code
		// Inline code — use \\x60 to avoid backtick in template literal
		s = s.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
		// Links
		s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
		return s;
	}

	// ---- Expanded card height ----
	const COLLAPSED_HEIGHT = 80;
	const PREVIEW_HEADER = 24; // space for the preview button row
	const PREVIEW_MAX_HEIGHT = 300;
	const PREVIEW_PADDING = 8;

	function getExpandedHeight(node) {
		// Estimate based on content length; capped
		const content = fileContents[node.id] || '';
		const lineCount = content.split('\\n').length;
		return Math.min(COLLAPSED_HEIGHT + PREVIEW_HEADER + PREVIEW_MAX_HEIGHT, COLLAPSED_HEIGHT + PREVIEW_HEADER + lineCount * 16 + PREVIEW_PADDING * 2);
	}

	function getNodeHeight(node) {
		if (expandedNodes[node.id]) {
			return getExpandedHeight(node);
		}
		return node.height;
	}

	// Render all node types
	function renderNodes() {
		nodesGroup.innerHTML = '';
		emptyState.style.display = state.nodes.length === 0 ? 'block' : 'none';

		// Group nodes are drawn first (behind), then others on top
		const groups = state.nodes.filter(function(n) { return n.type === 'group'; });
		const others = state.nodes.filter(function(n) { return n.type !== 'group'; });
		for (const node of groups) renderOneNode(node);
		for (const node of others) renderOneNode(node);
	}

	function renderOneNode(node) {
		if (node.type === 'file') return renderFileNode(node);
		if (node.type === 'text') return renderTextNode(node);
		if (node.type === 'group') return renderGroupNode(node);
		if (node.type === 'drawing') return renderDrawingNode(node);
	}

	function renderTextNode(node) {
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', 'text-node' + (selectedId === node.id ? ' selected' : ''));
		g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
		g.dataset.id = node.id;
		g.dataset.nodeType = 'text';
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('class', 'text-node-bg');
		rect.setAttribute('width', node.width);
		rect.setAttribute('height', node.height);
		g.appendChild(rect);
		const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
		fo.setAttribute('x', 0);
		fo.setAttribute('y', 0);
		fo.setAttribute('width', node.width);
		fo.setAttribute('height', node.height);
		const isEditing = editingNodeId === node.id;
		if (isEditing) {
			const ta = document.createElementNS('http://www.w3.org/1999/xhtml', 'textarea');
			ta.setAttribute('class', 'text-content');
			ta.value = node.text || '';
			ta.dataset.editFor = node.id;
			fo.appendChild(ta);
		} else {
			const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
			div.setAttribute('class', 'text-content');
			div.textContent = node.text || '(empty note — double-click to edit)';
			fo.appendChild(div);
		}
		g.appendChild(fo);
		nodesGroup.appendChild(g);
		if (isEditing) {
			const ta = fo.querySelector('textarea');
			if (ta) { ta.focus(); ta.select && ta.select(); }
		}
	}

	function renderGroupNode(node) {
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', 'group-node' + (selectedId === node.id ? ' selected' : ''));
		g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
		g.dataset.id = node.id;
		g.dataset.nodeType = 'group';
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('class', 'group-bg');
		rect.setAttribute('width', node.width);
		rect.setAttribute('height', node.height);
		g.appendChild(rect);
		// Header strip
		const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		header.setAttribute('class', 'group-header');
		header.setAttribute('x', 0);
		header.setAttribute('y', 0);
		header.setAttribute('width', node.width);
		header.setAttribute('height', 22);
		g.appendChild(header);
		const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		label.setAttribute('class', 'group-label-text');
		label.setAttribute('x', 10);
		label.setAttribute('y', 15);
		label.textContent = node.label || 'Group';
		g.appendChild(label);
		nodesGroup.appendChild(g);
	}

	function renderDrawingNode(node) {
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', 'drawing-node' + (selectedId === node.id ? ' selected' : ''));
		g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
		g.dataset.id = node.id;
		g.dataset.nodeType = 'drawing';
		// Invisible bbox for hit-testing & selection rectangle
		const bbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		bbox.setAttribute('class', 'drawing-bbox');
		bbox.setAttribute('width', node.width);
		bbox.setAttribute('height', node.height);
		g.appendChild(bbox);
		// Polyline from points (relative to node origin)
		if (node.points && node.points.length >= 2) {
			const ptsStr = node.points.map(function(p) { return p[0] + ',' + p[1]; }).join(' ');
			const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
			pl.setAttribute('class', 'drawing-stroke');
			pl.setAttribute('points', ptsStr);
			g.appendChild(pl);
		}
		nodesGroup.appendChild(g);
	}

	function renderFileNode(node) {
			const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			const isExpanded = !!expandedNodes[node.id];
			const renderHeight = getNodeHeight(node);
			g.setAttribute('class', 'card' + (selectedId === node.id ? ' selected' : '') + (isExpanded ? ' card-expanded' : ''));
			g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
			g.dataset.id = node.id;

			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('class', 'card-bg');
			rect.setAttribute('width', node.width);
			rect.setAttribute('height', renderHeight);
			g.appendChild(rect);

			// File icon based on extension
			const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			iconText.setAttribute('class', 'card-icon');
			iconText.setAttribute('x', 12);
			iconText.setAttribute('y', 28);
			const icons = { md: '📝', txt: '📄', mm: '🧠', json: '⚙', csv: '📊' };
			iconText.textContent = icons[node.extension] || '📄';
			g.appendChild(iconText);

			// Label (basename)
			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('class', 'card-label');
			label.setAttribute('x', 40);
			label.setAttribute('y', 28);
			label.textContent = node.label;
			g.appendChild(label);

			// Path (subtle)
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			path.setAttribute('class', 'card-path');
			path.setAttribute('x', 40);
			path.setAttribute('y', 48);
			path.textContent = node.filePath;
			g.appendChild(path);

			// Expand/collapse button
			const btnG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			btnG.setAttribute('class', 'preview-btn');
			btnG.setAttribute('transform', 'translate(' + (node.width - 60) + ', 8)');
			const btnRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			btnRect.setAttribute('class', 'preview-btn-bg');
			btnRect.setAttribute('width', 48);
			btnRect.setAttribute('height', 18);
			btnG.appendChild(btnRect);
			const btnText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			btnText.setAttribute('class', 'preview-btn-text');
			btnText.setAttribute('x', 24);
			btnText.setAttribute('y', 13);
			btnText.setAttribute('text-anchor', 'middle');
			btnText.textContent = isExpanded ? '− Collapse' : '+ Preview';
			btnG.appendChild(btnText);
			btnG.dataset.previewBtn = node.id;
			g.appendChild(btnG);

			// Size hint
			const size = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			size.setAttribute('class', 'card-path');
			size.setAttribute('x', 12);
			size.setAttribute('y', 68);
			size.textContent = '.' + node.extension;
			g.appendChild(size);

			// If expanded, render markdown preview via foreignObject
			if (isExpanded) {
				const content = fileContents[node.id];
				if (content !== undefined) {
					const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
					fo.setAttribute('x', 8);
					fo.setAttribute('y', COLLAPSED_HEIGHT);
					fo.setAttribute('width', node.width - 16);
					fo.setAttribute('height', renderHeight - COLLAPSED_HEIGHT - PREVIEW_PADDING);
					const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
					div.setAttribute('class', 'md-preview');
					div.innerHTML = mdToHtml(content);
					fo.appendChild(div);
					g.appendChild(fo);
				} else if (pendingLoad[node.id]) {
					const loadingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
					loadingText.setAttribute('class', 'card-path');
					loadingText.setAttribute('x', 12);
					loadingText.setAttribute('y', COLLAPSED_HEIGHT + 20);
					loadingText.textContent = 'Loading...';
					g.appendChild(loadingText);
				}
			}

			// Connection ports (4 dots on edges)
			const ports = [
				{ port: 'top', cx: node.width / 2, cy: 0 },
				{ port: 'right', cx: node.width, cy: renderHeight / 2 },
				{ port: 'bottom', cx: node.width / 2, cy: renderHeight },
				{ port: 'left', cx: 0, cy: renderHeight / 2 }
			];
			for (const p of ports) {
				const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				circle.setAttribute('class', 'port');
				circle.setAttribute('cx', p.cx);
				circle.setAttribute('cy', p.cy);
				circle.setAttribute('r', 5);
				circle.dataset.port = p.port;
				circle.dataset.nodeId = node.id;
				g.appendChild(circle);
			}

			nodesGroup.appendChild(g);
	}

		function renderEdges() {
			edgesGroup.innerHTML = '';
			for (const edge of state.edges) {
				const fromNode = state.nodes.find(function(n) { return n.id === edge.from; });
				const toNode = state.nodes.find(function(n) { return n.id === edge.to; });
				if (!fromNode || !toNode) continue;

				const fromPt = getPortPoint(fromNode, edge.fromPort);
				const toPt = getPortPoint(toNode, edge.toPort);
				const d = buildEdgePath(fromPt, toPt, edge.fromPort, edge.toPort);

				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				path.setAttribute('class', 'edge' + (selectedId === edge.id ? ' selected' : ''));
				path.setAttribute('d', d);
				path.setAttribute('fill', 'none');
				path.dataset.id = edge.id;
				path.dataset.edge = 'true';
				edgesGroup.appendChild(path);

				// Arrowhead
				const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
				arrow.setAttribute('class', 'edge-arrow');
				arrow.setAttribute('points', arrowPoints(toPt, edge.toPort));
				arrow.dataset.id = edge.id;
				arrow.dataset.edge = 'true';
				edgesGroup.appendChild(arrow);
			}

			// Render in-progress edge (if any)
			if (dragState && dragState.type === 'edge') {
				const fromNode = state.nodes.find(function(n) { return n.id === dragState.fromId; });
				if (fromNode) {
					const fromPt = getPortPoint(fromNode, dragState.fromPort);
					const toPt = { x: dragState.curX, y: dragState.curY };
					const d = buildEdgePath(fromPt, toPt, dragState.fromPort, 'center');
					const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
					path.setAttribute('class', 'edge dragging');
					path.setAttribute('d', d);
					path.setAttribute('fill', 'none');
					edgesGroup.appendChild(path);
				}
			}
		}

		function getPortPoint(node, port) {
				const h = (node.type === 'file' && expandedNodes[node.id]) ? getNodeHeight(node) : node.height;
				const cx = node.x + node.width / 2;
				const cy = node.y + h / 2;
				switch (port) {
					case 'top': return { x: cx, y: node.y };
					case 'right': return { x: node.x + node.width, y: cy };
					case 'bottom': return { x: cx, y: node.y + h };
					case 'left': return { x: node.x, y: cy };
					default: return { x: cx, y: cy };
				}
		}

		function buildEdgePath(from, to, fromPort, toPort) {
			// Bezier curve with control points offset from the ports
			const dx = to.x - from.x;
			const dy = to.y - from.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const offset = Math.max(40, dist * 0.4);

			let c1x = from.x, c1y = from.y, c2x = to.x, c2y = to.y;
			switch (fromPort) {
				case 'top': c1y = from.y - offset; break;
				case 'right': c1x = from.x + offset; break;
				case 'bottom': c1y = from.y + offset; break;
				case 'left': c1x = from.x - offset; break;
			}
			switch (toPort) {
				case 'top': c2y = to.y - offset; break;
				case 'right': c2x = to.x + offset; break;
				case 'bottom': c2y = to.y + offset; break;
				case 'left': c2x = to.x - offset; break;
			}
			return 'M ' + from.x + ' ' + from.y + ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + to.x + ' ' + to.y;
		}

		function arrowPoints(pt, port) {
			const size = 8;
			let dx = 0, dy = 0;
			switch (port) {
				case 'top': dy = -1; break;
				case 'right': dx = 1; break;
				case 'bottom': dy = 1; break;
				case 'left': dx = -1; break;
				default: dx = 1; break;
			}
			const tip = pt;
			const left = { x: pt.x - dy * size - dx * size, y: pt.y + dx * size - dy * size };
			const right = { x: pt.x + dy * size - dx * size, y: pt.y - dx * size - dy * size };
			return tip.x + ',' + tip.y + ' ' + left.x + ',' + left.y + ' ' + right.x + ',' + right.y;
		}

	function render() {
		renderNodes();
		renderEdges();
		applyViewport();
	}

	// ---- Dragging ----
	let dragState = null;

	function screenToCanvas(sx, sy) {
		const rect = svg.getBoundingClientRect();
		const px = sx - rect.left;
		const py = sy - rect.top;
		return {
			x: (px - state.viewport.x) / state.viewport.zoom,
			y: (py - state.viewport.y) / state.viewport.zoom
		};
	}

	svg.addEventListener('mousedown', function(e) {
		// If a tool is active and we click empty space, create a node / start drawing
		if (currentTool) {
			const onNode = e.target.closest('[data-id]');
			if (!onNode) {
				const pos = screenToCanvas(e.clientX, e.clientY);
				if (currentTool === 'text') {
					const newNode = {
						id: 'text_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
						type: 'text',
						x: Math.round(pos.x), y: Math.round(pos.y),
						width: 200, height: 80,
						parentId: null,
						text: ''
					};
					state.nodes.push(newNode);
					editingNodeId = newNode.id;
					selectedId = newNode.id;
					vscode.postMessage({ type: 'nodeCreated', node: newNode });
					setTool(null);
					renderNodes();
					e.preventDefault();
					return;
				}
				if (currentTool === 'group') {
					dragState = {
						type: 'create-group',
						startX: pos.x, startY: pos.y, curX: pos.x, curY: pos.y
					};
					e.preventDefault();
					return;
				}
				if (currentTool === 'draw') {
					dragState = {
						type: 'draw',
						startX: pos.x, startY: pos.y,
						points: [[0, 0]],
						minX: pos.x, minY: pos.y, maxX: pos.x, maxY: pos.y
					};
					e.preventDefault();
					return;
				}
			}
		}

		// Check for preview button click (expand/collapse)
		const previewBtn = e.target.closest('[data-preview-btn]');
		if (previewBtn) {
			const nodeId = previewBtn.dataset.previewBtn;
			if (expandedNodes[nodeId]) {
				delete expandedNodes[nodeId];
				renderNodes();
			} else {
				expandedNodes[nodeId] = true;
				if (fileContents[nodeId] === undefined && !pendingLoad[nodeId]) {
					pendingLoad[nodeId] = true;
					vscode.postMessage({ type: 'loadFileContent', nodeId: nodeId });
				}
				renderNodes();
			}
			e.preventDefault();
			return;
		}

		// Don't start drag on the textarea itself — let it receive input
		if (e.target.tagName === 'TEXTAREA') return;

		// Check for edge click first (for selection)
		const edgeEl = e.target.closest('[data-edge="true"]');
		if (edgeEl) {
			selectedId = edgeEl.dataset.id;
			renderEdges();
			e.preventDefault();
			return;
		}

		// Check for port click (start edge creation)
		const portEl = e.target.closest('.port');
		if (portEl) {
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			dragState = {
				type: 'edge',
				fromId: portEl.dataset.nodeId,
				fromPort: portEl.dataset.port,
				curX: canvasPos.x,
				curY: canvasPos.y
			};
			e.preventDefault();
			return;
		}

		// Any node-like target (file card / text / group / drawing)
		const target = e.target.closest('[data-id]');
		if (target) {
			const nodeId = target.dataset.id;
			const node = state.nodes.find(function(n) { return n.id === nodeId; });
			if (!node) return;
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			dragState = {
				type: 'card',
				nodeId: nodeId,
				offsetX: canvasPos.x - node.x,
				offsetY: canvasPos.y - node.y,
				// snapshot children of group at drag start for group-move
				childOffsets: node.type === 'group' ? state.nodes
					.filter(function(c) { return c.parentId === node.id; })
					.map(function(c) { return { id: c.id, dx: c.x - node.x, dy: c.y - node.y }; }) : null
			};
			selectedId = nodeId;
			editingNodeId = null;
			renderNodes();
			e.preventDefault();
		} else {
			// Start panning
			dragState = {
				type: 'pan',
				startX: e.clientX,
				startY: e.clientY,
				origX: state.viewport.x,
				origY: state.viewport.y
			};
			document.getElementById('canvas-container').classList.add('panning');
			selectedId = null;
			editingNodeId = null;
			renderNodes();
			renderEdges();
		}
	});

	document.addEventListener('mousemove', function(e) {
		if (!dragState) return;
		if (dragState.type === 'card') {
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			const node = state.nodes.find(function(n) { return n.id === dragState.nodeId; });
			if (node) {
				node.x = Math.round(canvasPos.x - dragState.offsetX);
				node.y = Math.round(canvasPos.y - dragState.offsetY);
				// Move children along with group
				if (dragState.childOffsets) {
					for (const co of dragState.childOffsets) {
						const child = state.nodes.find(function(n) { return n.id === co.id; });
						if (child) {
							child.x = node.x + co.dx;
							child.y = node.y + co.dy;
						}
					}
				}
				renderNodes();
				renderEdges();
			}
		} else if (dragState.type === 'pan') {
			state.viewport.x = dragState.origX + (e.clientX - dragState.startX);
			state.viewport.y = dragState.origY + (e.clientY - dragState.startY);
			applyViewport();
		} else if (dragState.type === 'edge') {
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			dragState.curX = canvasPos.x;
			dragState.curY = canvasPos.y;
			renderEdges();
		} else if (dragState.type === 'create-group') {
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			dragState.curX = canvasPos.x;
			dragState.curY = canvasPos.y;
			renderCreatePreview();
		} else if (dragState.type === 'draw') {
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			const px = canvasPos.x - dragState.startX;
			const py = canvasPos.y - dragState.startY;
			dragState.points.push([px, py]);
			if (canvasPos.x < dragState.minX) dragState.minX = canvasPos.x;
			if (canvasPos.y < dragState.minY) dragState.minY = canvasPos.y;
			if (canvasPos.x > dragState.maxX) dragState.maxX = canvasPos.x;
			if (canvasPos.y > dragState.maxY) dragState.maxY = canvasPos.y;
			renderCreatePreview();
		}
	});

	// Live preview for in-progress create-group / draw
	let previewEl = null;
	function renderCreatePreview() {
		if (previewEl) { previewEl.remove(); previewEl = null; }
		if (!dragState) return;
		if (dragState.type === 'create-group') {
			const x = Math.min(dragState.startX, dragState.curX);
			const y = Math.min(dragState.startY, dragState.curY);
			const w = Math.abs(dragState.curX - dragState.startX);
			const h = Math.abs(dragState.curY - dragState.startY);
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('class', 'group-bg');
			rect.setAttribute('x', x); rect.setAttribute('y', y);
			rect.setAttribute('width', w); rect.setAttribute('height', h);
			nodesGroup.appendChild(rect);
			previewEl = rect;
		} else if (dragState.type === 'draw') {
			const pts = dragState.points.map(function(p) { return (dragState.startX + p[0]) + ',' + (dragState.startY + p[1]); }).join(' ');
			const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
			pl.setAttribute('class', 'drawing-stroke');
			pl.setAttribute('points', pts);
			nodesGroup.appendChild(pl);
			previewEl = pl;
		}
	}

	document.addEventListener('mouseup', function(e) {
		if (dragState) {
			if (dragState.type === 'card') {
				// Determine which nodes moved
				const ids = [dragState.nodeId];
				if (dragState.childOffsets) {
					for (const co of dragState.childOffsets) ids.push(co.id);
				}
				const movedNodes = state.nodes
					.filter(function(n) { return ids.indexOf(n.id) !== -1; })
					.map(function(n) { return { id: n.id, x: n.x, y: n.y }; });
				// Detect group containment for the dragged node (skip if it's itself a group)
				const draggedNode = state.nodes.find(function(n) { return n.id === dragState.nodeId; });
				if (draggedNode && draggedNode.type !== 'group') {
					const newParent = findContainingGroup(draggedNode);
					const newParentId = newParent ? newParent.id : null;
					if (draggedNode.parentId !== newParentId) {
						draggedNode.parentId = newParentId;
						vscode.postMessage({ type: 'nodeParentChanged', nodeId: draggedNode.id, parentId: newParentId });
					}
				}
				vscode.postMessage({ type: 'nodesMoved', nodes: movedNodes });
			} else if (dragState.type === 'pan') {
				vscode.postMessage({ type: 'viewportChanged', viewport: state.viewport });
			} else if (dragState.type === 'edge') {
				// Check if released on a card or port
				const targetCard = e.target.closest('[data-id]');
				const targetPort = e.target.closest('.port');
				if (targetCard) {
					const toId = targetCard.dataset.id || (targetPort && targetPort.dataset.nodeId);
					if (toId && toId !== dragState.fromId) {
						let toPort = 'center';
						if (targetPort && targetPort.dataset.port) {
							toPort = targetPort.dataset.port;
						}
						const newEdge = {
							id: 'edge_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
							from: dragState.fromId,
							to: toId,
							fromPort: dragState.fromPort,
							toPort: toPort
						};
						state.edges.push(newEdge);
						vscode.postMessage({ type: 'edgeCreated', edge: newEdge });
						renderEdges();
					}
				}
				renderEdges();
			} else if (dragState.type === 'create-group') {
				if (previewEl) { previewEl.remove(); previewEl = null; }
				const x = Math.min(dragState.startX, dragState.curX);
				const y = Math.min(dragState.startY, dragState.curY);
				const w = Math.abs(dragState.curX - dragState.startX);
				const h = Math.abs(dragState.curY - dragState.startY);
				if (w > 30 && h > 30) {
					const newNode = {
						id: 'group_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
						type: 'group',
						x: Math.round(x), y: Math.round(y),
						width: Math.round(w), height: Math.round(h),
						parentId: null,
						label: 'Group'
					};
					state.nodes.push(newNode);
					// Capture nodes whose center falls inside this rectangle as children
					const reparented = [];
					for (const n of state.nodes) {
						if (n.id === newNode.id) continue;
						if (n.type === 'group') continue;
						const cx = n.x + n.width / 2;
						const cy = n.y + n.height / 2;
						if (cx >= newNode.x && cx <= newNode.x + newNode.width &&
							cy >= newNode.y && cy <= newNode.y + newNode.height) {
							n.parentId = newNode.id;
							reparented.push({ id: n.id, parentId: newNode.id });
						}
					}
					selectedId = newNode.id;
					vscode.postMessage({ type: 'nodeCreated', node: newNode });
					for (const r of reparented) {
						vscode.postMessage({ type: 'nodeParentChanged', nodeId: r.id, parentId: r.parentId });
					}
					setTool(null);
					renderNodes();
				} else {
					setTool(null);
				}
			} else if (dragState.type === 'draw') {
				if (previewEl) { previewEl.remove(); previewEl = null; }
				if (dragState.points && dragState.points.length > 2) {
					// Normalize points to bbox origin
					const offsetX = dragState.minX - dragState.startX;
					const offsetY = dragState.minY - dragState.startY;
					const normalizedPoints = dragState.points.map(function(p) { return [p[0] - offsetX, p[1] - offsetY]; });
					const w = Math.max(20, dragState.maxX - dragState.minX);
					const h = Math.max(20, dragState.maxY - dragState.minY);
					const newNode = {
						id: 'draw_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
						type: 'drawing',
						x: Math.round(dragState.minX), y: Math.round(dragState.minY),
						width: Math.round(w), height: Math.round(h),
						parentId: null,
						points: normalizedPoints.map(function(p) { return [Math.round(p[0]), Math.round(p[1])]; })
					};
					state.nodes.push(newNode);
					vscode.postMessage({ type: 'nodeCreated', node: newNode });
					setTool(null);
					renderNodes();
				} else {
					setTool(null);
				}
			}
			dragState = null;
			document.getElementById('canvas-container').classList.remove('panning');
		}
	});

	function findContainingGroup(node) {
		const cx = node.x + node.width / 2;
		const cy = node.y + node.height / 2;
		// Pick the smallest containing group (innermost)
		let best = null;
		let bestArea = Infinity;
		for (const g of state.nodes) {
			if (g.type !== 'group') continue;
			if (g.id === node.id) continue;
			if (cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height) {
				const area = g.width * g.height;
				if (area < bestArea) { best = g; bestArea = area; }
			}
		}
		return best;
	}

	// ---- Double-click ----
	svg.addEventListener('dblclick', function(e) {
		const target = e.target.closest('[data-id]');
		if (!target) return;
		const nodeId = target.dataset.id;
		const node = state.nodes.find(function(n) { return n.id === nodeId; });
		if (!node) return;
		if (node.type === 'file') {
			vscode.postMessage({ type: 'openFile', nodeId: nodeId });
		} else if (node.type === 'text') {
			editingNodeId = nodeId;
			selectedId = nodeId;
			renderNodes();
		} else if (node.type === 'group') {
			// Inline label rename via prompt — simple but works
			const newLabel = window.prompt('Group label', node.label || 'Group');
			if (newLabel !== null) {
				node.label = newLabel;
				vscode.postMessage({ type: 'nodeUpdated', node: { id: node.id, label: newLabel } });
				renderNodes();
			}
		}
	});

	// Commit text edits on textarea blur or Esc
	document.addEventListener('focusout', function(e) {
		if (e.target.tagName === 'TEXTAREA' && e.target.dataset.editFor) {
			const id = e.target.dataset.editFor;
			const node = state.nodes.find(function(n) { return n.id === id; });
			if (node) {
				node.text = e.target.value;
				vscode.postMessage({ type: 'nodeUpdated', node: { id: node.id, text: node.text } });
			}
			editingNodeId = null;
			renderNodes();
		}
	}, true);

	// ---- Zoom (wheel) ----
	svg.addEventListener('wheel', function(e) {
		e.preventDefault();
		const rect = svg.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		const delta = -e.deltaY * 0.001;
		const newZoom = Math.max(0.2, Math.min(3, state.viewport.zoom * (1 + delta)));
		// Zoom toward mouse position
		const scaleChange = newZoom / state.viewport.zoom;
		state.viewport.x = mouseX - (mouseX - state.viewport.x) * scaleChange;
		state.viewport.y = mouseY - (mouseY - state.viewport.y) * scaleChange;
		state.viewport.zoom = newZoom;
		applyViewport();
		vscode.postMessage({ type: 'viewportChanged', viewport: state.viewport });
	}, { passive: false });

	// ---- Toolbar ----
	document.getElementById('btn-zoom-in').addEventListener('click', function() { zoomBy(1.2); });
	document.getElementById('btn-zoom-out').addEventListener('click', function() { zoomBy(1/1.2); });
	document.getElementById('btn-reset').addEventListener('click', function() {
		state.viewport = { x: 0, y: 0, zoom: 1 };
		render();
		vscode.postMessage({ type: 'viewportChanged', viewport: state.viewport });
	});
	document.getElementById('btn-fit').addEventListener('click', function() {
		fitToView();
	});

	function zoomBy(factor) {
		const rect = svg.getBoundingClientRect();
		const cx = rect.width / 2;
		const cy = rect.height / 2;
		const newZoom = Math.max(0.2, Math.min(3, state.viewport.zoom * factor));
		const scaleChange = newZoom / state.viewport.zoom;
		state.viewport.x = cx - (cx - state.viewport.x) * scaleChange;
		state.viewport.y = cy - (cy - state.viewport.y) * scaleChange;
		state.viewport.zoom = newZoom;
		applyViewport();
		vscode.postMessage({ type: 'viewportChanged', viewport: state.viewport });
	}

	function fitToView() {
		if (state.nodes.length === 0) return;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const n of state.nodes) {
			minX = Math.min(minX, n.x);
			minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x + n.width);
			maxY = Math.max(maxY, n.y + n.height);
		}
		const rect = svg.getBoundingClientRect();
		const padding = 40;
		const zoomX = (rect.width - padding * 2) / (maxX - minX);
		const zoomY = (rect.height - padding * 2) / (maxY - minY);
		const newZoom = Math.min(zoomX, zoomY, 1.5);
		state.viewport.zoom = newZoom;
		state.viewport.x = padding - minX * newZoom + (rect.width - padding * 2 - (maxX - minX) * newZoom) / 2;
		state.viewport.y = padding - minY * newZoom + (rect.height - padding * 2 - (maxY - minY) * newZoom) / 2;
		applyViewport();
		vscode.postMessage({ type: 'viewportChanged', viewport: state.viewport });
	}

	// ---- Tool buttons ----
	function setTool(name) {
		currentTool = name;
		const container = document.getElementById('canvas-container');
		container.classList.remove('tool-text', 'tool-group', 'tool-draw');
		document.querySelectorAll('#toolbar button.tool-active').forEach(function(b) { b.classList.remove('tool-active'); });
		if (name === 'text') { container.classList.add('tool-text'); document.getElementById('btn-add-text').classList.add('tool-active'); }
		else if (name === 'group') { container.classList.add('tool-group'); document.getElementById('btn-add-group').classList.add('tool-active'); }
		else if (name === 'draw') { container.classList.add('tool-draw'); document.getElementById('btn-draw').classList.add('tool-active'); }
	}
	document.getElementById('btn-add-text').addEventListener('click', function() { setTool(currentTool === 'text' ? null : 'text'); });
	document.getElementById('btn-add-group').addEventListener('click', function() { setTool(currentTool === 'group' ? null : 'group'); });
	document.getElementById('btn-draw').addEventListener('click', function() { setTool(currentTool === 'draw' ? null : 'draw'); });

	// ---- Receive messages from host ----
	window.addEventListener('message', function(e) {
		const msg = e.data;
		if (msg.type === 'init') {
			state = msg.canvas;
			render();
		} else if (msg.type === 'refresh') {
			state = msg.canvas;
			render();
		} else if (msg.type === 'fileContent') {
			fileContents[msg.nodeId] = msg.content;
			delete pendingLoad[msg.nodeId];
			renderNodes();
		}
	});

	// Request initial data
	vscode.postMessage({ type: 'ready' });

	// ---- Keyboard shortcuts ----
	document.addEventListener('keydown', function(e) {
		// Ignore typing inside text inputs / textareas
		const tag = e.target && e.target.tagName;
		if (tag === 'TEXTAREA' || tag === 'INPUT') {
			if (e.key === 'Escape') {
				e.target.blur();
			}
			return;
		}
		if (e.key === 'Escape') {
			setTool(null);
			selectedId = null;
			editingNodeId = null;
			renderNodes();
			renderEdges();
			return;
		}
		if (e.key === 't' || e.key === 'T') { setTool(currentTool === 'text' ? null : 'text'); return; }
		if (e.key === 'g' || e.key === 'G') { setTool(currentTool === 'group' ? null : 'group'); return; }
		if (e.key === 'd' || e.key === 'D') { setTool(currentTool === 'draw' ? null : 'draw'); return; }
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (!selectedId) return;
			if (selectedId.startsWith('edge_')) {
				state.edges = state.edges.filter(function(edge) { return edge.id !== selectedId; });
				vscode.postMessage({ type: 'edgeDeleted', edgeId: selectedId });
				selectedId = null;
				renderEdges();
				e.preventDefault();
				return;
			}
			// Delete a node (and reparent children of a deleted group to null)
			const id = selectedId;
			const removed = state.nodes.find(function(n) { return n.id === id; });
			if (!removed) return;
			// Cascade for groups: orphan their children but don't delete them
			if (removed.type === 'group') {
				for (const child of state.nodes) {
					if (child.parentId === id) {
						child.parentId = null;
						vscode.postMessage({ type: 'nodeParentChanged', nodeId: child.id, parentId: null });
					}
				}
			}
			state.nodes = state.nodes.filter(function(n) { return n.id !== id; });
			// Also drop any edges that referenced it
			const droppedEdges = state.edges.filter(function(edge) { return edge.from === id || edge.to === id; });
			state.edges = state.edges.filter(function(edge) { return edge.from !== id && edge.to !== id; });
			vscode.postMessage({ type: 'nodeDeleted', nodeId: id });
			for (const de of droppedEdges) {
				vscode.postMessage({ type: 'edgeDeleted', edgeId: de.id });
			}
			selectedId = null;
			editingNodeId = null;
			renderNodes();
			renderEdges();
			e.preventDefault();
		}
	});
})();
</script>
</body>
</html>`;
}

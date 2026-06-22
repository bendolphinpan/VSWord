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

	// Viewport transform
	function applyViewport() {
		const { x, y, zoom } = state.viewport;
		viewportGroup.setAttribute('transform', 'translate(' + x + ',' + y + ') scale(' + zoom + ')');
		zoomDisplay.textContent = Math.round(zoom * 100) + '%';
	}

	// Render file cards
	function renderNodes() {
		nodesGroup.innerHTML = '';
		emptyState.style.display = state.nodes.length === 0 ? 'block' : 'none';

		for (const node of state.nodes) {
			if (node.type !== 'file') continue; // Phase 1: only file nodes

			const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			g.setAttribute('class', 'card' + (selectedId === node.id ? ' selected' : ''));
			g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
			g.dataset.id = node.id;

			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('class', 'card-bg');
			rect.setAttribute('width', node.width);
			rect.setAttribute('height', node.height);
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

			// Size hint
			const size = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			size.setAttribute('class', 'card-path');
			size.setAttribute('x', 12);
			size.setAttribute('y', 68);
			size.textContent = '.' + node.extension;
			g.appendChild(size);

			nodesGroup.appendChild(g);
		}
	}

	function renderEdges() {
		edgesGroup.innerHTML = '';
		// Phase 2: edges rendering will go here
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
		const target = e.target.closest('.card');
		if (target) {
			// Start card drag
			const nodeId = target.dataset.id;
			const node = state.nodes.find(function(n) { return n.id === nodeId; });
			if (!node) return;
			const canvasPos = screenToCanvas(e.clientX, e.clientY);
			dragState = {
				type: 'card',
				nodeId: nodeId,
				offsetX: canvasPos.x - node.x,
				offsetY: canvasPos.y - node.y
			};
			selectedId = nodeId;
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
			renderNodes();
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
				// Update DOM directly for performance (no full re-render)
				const el = nodesGroup.querySelector('[data-id="' + dragState.nodeId + '"]');
				if (el) {
					el.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
				}
			}
		} else if (dragState.type === 'pan') {
			state.viewport.x = dragState.origX + (e.clientX - dragState.startX);
			state.viewport.y = dragState.origY + (e.clientY - dragState.startY);
			applyViewport();
		}
	});

	document.addEventListener('mouseup', function() {
		if (dragState) {
			if (dragState.type === 'card') {
				// Send updated positions to host for persistence
				vscode.postMessage({ type: 'nodesMoved', nodes: state.nodes.map(function(n) { return { id: n.id, x: n.x, y: n.y }; }) });
			} else if (dragState.type === 'pan') {
				vscode.postMessage({ type: 'viewportChanged', viewport: state.viewport });
			}
			dragState = null;
			document.getElementById('canvas-container').classList.remove('panning');
		}
	});

	// ---- Double-click to open file ----
	svg.addEventListener('dblclick', function(e) {
		const target = e.target.closest('.card');
		if (target) {
			vscode.postMessage({ type: 'openFile', nodeId: target.dataset.id });
		}
	});

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

	// ---- Receive messages from host ----
	window.addEventListener('message', function(e) {
		const msg = e.data;
		if (msg.type === 'init') {
			state = msg.canvas;
			render();
		} else if (msg.type === 'refresh') {
			state = msg.canvas;
			render();
		}
	});

	// Request initial data
	vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

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
	<svg id="mindmap-svg" aria-label="VSWord Mindmap"><g id="viewport"><g id="links"></g><g id="topics"></g></g></svg>
	<div id="empty" class="empty" hidden>No mindmap root node found in this .mm file.</div>
</div>
<script nonce="vsword-mindmap">
(function () {
	'use strict';
	const model = ${data};
	const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	const editable = Boolean(model.editable && vscode);
	const pendingEdits = new Map();
	const pendingStructure = new Map();
	let editingInput = null;
	let editingNode = null;
	let saveSeq = 0;
	let selectedNodeId = model.selectedNodeId || null;
	const nodeElements = new Map();
	const nodeParents = new Map();
	const svg = document.getElementById('mindmap-svg');
	const viewport = document.getElementById('viewport');
	const linksGroup = document.getElementById('links');
	const topicsGroup = document.getElementById('topics');
	const empty = document.getElementById('empty');
	document.getElementById('file-name').textContent = model.fileName;
	document.getElementById('node-count').textContent = String(model.nodeCount) + ' nodes';
	document.getElementById('mode-hint').textContent = editable ? 'Tab=child · Enter=sibling · Space=fold · Delete=remove · Dbl-click=edit' : 'Read-only MVP · pan/zoom · XMind-style layout';

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
		const pEdge = c.side === 'left' ? p.x - p.w / 2 : p.x + p.w / 2;
		const cEdge = c.side === 'left' ? c.x + c.w / 2 : c.x - c.w / 2;
		const mid = (pEdge + cEdge) / 2;
		const d = 'M ' + pEdge + ' ' + p.y + ' C ' + mid + ' ' + p.y + ', ' + mid + ' ' + c.y + ', ' + cEdge + ' ' + c.y;
		linksGroup.appendChild(makeSvg('path', { class: 'link', d: d }));
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
				requestRemove();
				return;
			}
			if (event.key === ' ' || event.code === 'Space') {
				event.preventDefault();
				toggleFoldSelected();
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
	traverse(model.root, renderLink);
	placed.forEach(renderTopic);
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

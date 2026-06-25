/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../webview/common/webview.js';
import { mindmapToMindElixirData, VSWordMindElixirData } from '../common/mindmapElixir.js';
import { mindmapToMarkdownBullets } from '../common/mindmapMarkdown.js';
import { VSWordMindmapNode } from '../common/mindmapXml.js';
import { mindElixirScriptBase64, mindElixirStyleBase64 } from './mindmapElixirAssets.js';

export interface VSWordMindmapWebviewModel {
	readonly fileName: string;
	readonly root?: VSWordMindmapNode;
	readonly mindElixirData?: VSWordMindElixirData;
	readonly sourceXml?: string;
	readonly markdownBullets?: string;
	readonly nodeCount: number;
	readonly sourceKind: 'mm';
	readonly editable: boolean;
	readonly selectedNodeId?: string;
}

export function getMindmapHtml(model: VSWordMindmapWebviewModel): string {
	const cspSource = webviewGenericCspSource;
	const htmlModel: VSWordMindmapWebviewModel = {
		...model,
		mindElixirData: model.root ? mindmapToMindElixirData(model.root) : undefined,
		markdownBullets: model.root ? mindmapToMarkdownBullets(model.root) : ''
	};
	const data = escapeScriptJson(htmlModel);
	const elixirCssBase64 = escapeScriptJson(mindElixirStyleBase64);
	const elixirJsBase64 = escapeScriptJson(mindElixirScriptBase64);
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-vsword-mindmap';">
<title>VSWord Mindmap</title>
<style id="mind-elixir-style"></style>
<style>
	* { box-sizing: border-box; }
	html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
	body {
		font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
		background: var(--vscode-editor-background, #ffffff);
		color: var(--vscode-foreground, #1f2328);
	}
	#app { width: 100vw; height: 100vh; position: relative; }
	#toolbar {
		position: fixed;
		top: 12px;
		left: 12px;
		right: 12px;
		z-index: 30;
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
	.badge { font-size: 12px; padding: 3px 8px; border-radius: 999px; background: var(--vscode-badge-background, #007acc); color: var(--vscode-badge-foreground, #fff); }
	.spacer { flex: 1; }
	.hint { color: var(--vscode-descriptionForeground, #666); font-size: 12px; white-space: nowrap; }
	#status { font-size: 12px; color: var(--vscode-descriptionForeground, #666); min-width: 86px; max-width: 38vw; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	#status.error { color: var(--vscode-errorForeground, #e51400); }
	#status.success { color: var(--vscode-testing-iconPassed, #2ea043); }
	button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; padding: 4px 9px; background: var(--vscode-button-secondaryBackground, #e5e5e5); color: var(--vscode-button-secondaryForeground, #222); cursor: pointer; }
	button:hover { background: var(--vscode-button-secondaryHoverBackground, #d5d5d5); }
	button:disabled { opacity: .55; cursor: default; }
	button.danger { color: var(--vscode-errorForeground, #e51400); }
	.toolbar-actions { display: flex; align-items: center; gap: 6px; }
	.view-switcher { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.35)); border-radius: 8px; background: color-mix(in srgb, var(--vscode-editorWidget-background, #f7f7f7) 75%, transparent); }
	.view-switcher button { padding: 3px 8px; border-color: transparent; background: transparent; }
	.view-switcher button.active { background: var(--vscode-button-secondaryBackground, #e5e5e5); border-color: var(--vscode-focusBorder, #0078d4); }
	#style-panel {
		position: fixed;
		top: 64px;
		left: 12px;
		z-index: 29;
		display: none;
		align-items: center;
		gap: 10px;
		max-width: calc(100vw - 24px);
		padding: 7px 9px;
		border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.35));
		border-radius: 10px;
		background: color-mix(in srgb, var(--vscode-editorWidget-background, #f7f7f7) 94%, transparent);
		box-shadow: 0 6px 22px rgba(0,0,0,.10);
		font-size: 12px;
	}
	#style-panel.visible { display: flex; }
	.style-group { display: flex; align-items: center; gap: 4px; }
	.style-label { color: var(--vscode-descriptionForeground, #666); margin-right: 2px; }
	.swatch { width: 20px; height: 20px; border-radius: 999px; padding: 0; border-color: rgba(128,128,128,.55); }
	.swatch.clear { background: repeating-linear-gradient(45deg, transparent 0 4px, rgba(128,128,128,.28) 4px 6px); }
	select.style-select { height: 24px; border-radius: 6px; border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,.55)); background: var(--vscode-dropdown-background, #fff); color: var(--vscode-dropdown-foreground, #222); }
	#map { position: absolute; inset: 0; padding-top: 52px; }
	#source-view, #markdown-view { position: absolute; inset: 0; padding: 68px 16px 16px; overflow: auto; background: var(--vscode-editor-background, #ffffff); }
	#source-view[hidden], #markdown-view[hidden], #map[hidden] { display: none !important; }
	.source-code, .markdown-code { margin: 0; min-height: 100%; white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family, Consolas, monospace); font-size: var(--vscode-editor-font-size, 13px); line-height: 1.55; }
	.source-code { color: var(--vscode-editor-foreground, #1f2328); }
	.markdown-code { color: var(--vscode-foreground, #1f2328); }
	#empty { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; padding: 24px; text-align: center; color: var(--vscode-descriptionForeground, #666); pointer-events: none; }
	#empty.visible { display: flex; }
	.map-container { background: radial-gradient(circle at 50% 50%, rgba(120, 120, 120, 0.08), transparent 0 28px), var(--vscode-editor-background, #ffffff) !important; background-size: 32px 32px !important; }
	.map-container me-tpc { box-shadow: 0 4px 10px rgba(0,0,0,.12); }
	.map-container me-root me-tpc { font-weight: 700; }
</style>
</head>
<body>
<div id="app">
	<div id="toolbar">
		<span class="title">🧠 <span id="file-name"></span></span>
		<span class="badge">.mm</span>
		<span class="badge" id="node-count"></span>
		<span class="spacer"></span>
		<div class="view-switcher" aria-label="Display mode">
			<button id="view-mindmap" data-view-mode="mindmap" title="Show visual mindmap">Mindmap</button>
			<button id="view-xml" data-view-mode="xml" title="Show .mm XML source">XML</button>
			<button id="view-md" data-view-mode="markdown" title="Show Markdown bullet notes">MD</button>
		</div>
		<span class="hint" id="mode-hint">Mind Elixir · select a topic, then use toolbar or shortcuts</span>
		<div class="toolbar-actions">
			<button id="add-child" title="Add child topic (Tab)">+ Child</button>
			<button id="add-sibling" title="Add sibling topic (Enter)">+ Sibling</button>
			<button id="edit-node" title="Edit selected topic (F2 / double-click)">Edit</button>
			<button id="style-node" title="Show style controls for selected topic">Style</button>
			<button id="delete-node" class="danger" title="Delete selected topic (Delete)">Delete</button>
			<button id="fit">Fit</button>
		</div>
		<span id="status"></span>
	</div>
	<div id="style-panel" aria-label="Selected topic style controls">
		<div class="style-group"><span class="style-label">Text</span><button class="swatch" data-color="#1f6feb" data-style-action="text-color" title="Blue text" style="background:#1f6feb"></button><button class="swatch" data-color="#cf222e" data-style-action="text-color" title="Red text" style="background:#cf222e"></button><button class="swatch clear" data-style-action="text-color-clear" title="Clear text color"></button></div>
		<div class="style-group"><span class="style-label">Fill</span><button class="swatch" data-color="#dbeafe" data-style-action="fill-color" title="Blue fill" style="background:#dbeafe"></button><button class="swatch" data-color="#fff8c5" data-style-action="fill-color" title="Yellow fill" style="background:#fff8c5"></button><button class="swatch clear" data-style-action="fill-color-clear" title="Clear fill"></button></div>
		<div class="style-group"><button data-style-action="bold" title="Toggle bold">B</button><button data-style-action="italic" title="Toggle italic"><em>I</em></button><select id="font-size" class="style-select" title="Font size"><option value="">Size</option><option value="12">12</option><option value="14">14</option><option value="16">16</option><option value="20">20</option><option value="24">24</option></select></div>
		<div class="style-group"><span class="style-label">Icon</span><button data-style-action="icon-idea" title="Add idea icon">💡</button><button data-style-action="icon-ok" title="Add OK icon">✅</button><button data-style-action="icon-stop" title="Add stop icon">⛔</button></div>
		<div class="style-group"><span class="style-label">Edge</span><button class="swatch" data-color="#1f6feb" data-style-action="edge-color" title="Blue edge" style="background:#1f6feb"></button><button class="swatch" data-color="#cf222e" data-style-action="edge-color" title="Red edge" style="background:#cf222e"></button><select id="edge-style" class="style-select" title="Edge style"><option value="">Edge</option><option value="bezier">Bezier</option><option value="linear">Linear</option><option value="sharp_bezier">Sharp</option><option value="hide_edge">Hidden</option></select><select id="edge-width" class="style-select" title="Edge width"><option value="">Width</option><option value="1">1</option><option value="2">2</option><option value="4">4</option><option value="6">6</option></select></div>
	</div>
	<div id="map" aria-label="VSWord Mindmap"></div>
	<div id="source-view" aria-label=".mm XML source" hidden><pre class="source-code" id="source-code"></pre></div>
	<div id="markdown-view" aria-label="Markdown bullet notes" hidden><pre class="markdown-code" id="markdown-code"></pre></div>
	<div id="empty">No mindmap root node found in this .mm file.</div>
</div>
<script nonce="vsword-mindmap">
(function () {
	function decodeBase64Utf8(value) {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
		return new TextDecoder('utf-8').decode(bytes);
	}
	document.getElementById('mind-elixir-style').textContent = decodeBase64Utf8(${elixirCssBase64});
	const script = document.createElement('script');
	script.nonce = 'vsword-mindmap';
	script.textContent = decodeBase64Utf8(${elixirJsBase64});
	document.currentScript.after(script);
})();
</script>
<script nonce="vsword-mindmap">
(function () {
	'use strict';
	const model = ${data};
	const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	const editable = Boolean(model.editable && vscode);
	const status = document.getElementById('status');
	const viewState = vscode && typeof vscode.getState === 'function' ? (vscode.getState() || {}) : {};
	let saveSeq = 0;
	let selectedNodeId = model.selectedNodeId || viewState.selectedNodeId || null;
	let stylePanelOpen = Boolean(viewState.stylePanelOpen);
	let viewMode = viewState.viewMode === 'xml' || viewState.viewMode === 'markdown' ? viewState.viewMode : 'mindmap';
	let mind = null;
	const toolbarButtons = ['add-child', 'add-sibling', 'edit-node', 'style-node', 'delete-node'].map(function (id) { return document.getElementById(id); });
	const stylePanel = document.getElementById('style-panel');

	function setStatus(text, className) {
		status.textContent = text || '';
		status.className = className || '';
	}

	function saveViewState() {
		if (vscode && typeof vscode.setState === 'function') {
			vscode.setState({ selectedNodeId: selectedNodeId, stylePanelOpen: stylePanelOpen, viewMode: viewMode });
		}
	}

	function updateToolbarState() {
		const hasSelection = Boolean(selectedNodeId);
		const mapMode = viewMode === 'mindmap';
		for (const button of toolbarButtons) {
			if (button) { button.disabled = !editable || !hasSelection || !mapMode; }
		}
		stylePanel.classList.toggle('visible', Boolean(editable && hasSelection && stylePanelOpen && mapMode));
		saveViewState();
	}

	function getSelectedNodeObject() {
		const element = selectedElement();
		return element && element.nodeObj ? element.nodeObj : null;
	}

	function selectedStyle() {
		const node = getSelectedNodeObject();
		const metadata = node && node.metadata && node.metadata.vsword ? node.metadata.vsword : {};
		return { node: node, style: (node && node.style) || {}, font: metadata.font || {}, edge: metadata.edge || {}, icons: metadata.icons || [] };
	}

	function refreshStyleControls() {
		const state = selectedStyle();
		const size = document.getElementById('font-size');
		if (size) { size.value = state.font.size ? String(state.font.size) : ''; }
		const edgeStyle = document.getElementById('edge-style');
		if (edgeStyle) { edgeStyle.value = state.edge.style || ''; }
		const edgeWidth = document.getElementById('edge-width');
		if (edgeWidth) { edgeWidth.value = state.edge.width || ''; }
	}

	function postStyle(type, payload) {
		if (!selectedNodeId) { setStatus('Select a topic first', 'error'); return; }
		saveViewState();
		post(type, Object.assign({ nodeId: selectedNodeId }, payload || {}));
	}

	function toggleFontFlag(flag) {
		const state = selectedStyle();
		const current = Boolean(state.font && state.font[flag]);
		const payload = {};
		payload[flag] = !current;
		postStyle('setFont', payload);
	}

	function toggleIcon(icon) {
		const state = selectedStyle();
		const icons = Array.isArray(state.icons) ? state.icons : [];
		postStyle('toggleIcon', { icon: icon, add: icons.indexOf(icon) < 0 });
	}

	function handleStyleAction(target) {
		const action = target && target.getAttribute ? target.getAttribute('data-style-action') : '';
		if (!action) { return; }
		if (action === 'text-color') { postStyle('setColor', { color: target.getAttribute('data-color') }); return; }
		if (action === 'text-color-clear') { postStyle('setColor', { color: null }); return; }
		if (action === 'fill-color') { postStyle('setBackgroundColor', { color: target.getAttribute('data-color') }); return; }
		if (action === 'fill-color-clear') { postStyle('setBackgroundColor', { color: null }); return; }
		if (action === 'bold') { toggleFontFlag('bold'); return; }
		if (action === 'italic') { toggleFontFlag('italic'); return; }
		if (action === 'icon-idea') { toggleIcon('idea'); return; }
		if (action === 'icon-ok') { toggleIcon('button_ok'); return; }
		if (action === 'icon-stop') { toggleIcon('stop'); return; }
		if (action === 'edge-color') { postStyle('setEdge', { color: target.getAttribute('data-color') }); return; }
	}

	function selectedElement() {
		if (!mind || !selectedNodeId) { return null; }
		try { return mind.findEle(selectedNodeId); } catch (_) { return null; }
	}

	function runSelected(actionName, action) {
		const element = selectedElement();
		if (!element) {
			setStatus('Select a topic first', 'error');
			return;
		}
		try { action(element); } catch (err) { reportError(actionName, err); }
	}

	function reportError(prefix, err) {
		try {
			const msg = (err && err.stack) ? err.stack : String(err);
			setStatus('[' + prefix + '] ' + (msg.split('\\n')[0] || msg).slice(0, 240), 'error');
			if (vscode) { vscode.postMessage({ type: 'webviewError', prefix: prefix, message: msg }); }
			console.error('[vsword-mindmap]', prefix, err);
		} catch (_) { /* swallow */ }
	}

	window.addEventListener('error', function (e) { reportError('uncaught', e.error || e.message); });
	window.addEventListener('unhandledrejection', function (e) { reportError('promise', e.reason); });

	document.getElementById('file-name').textContent = model.fileName;
	document.getElementById('node-count').textContent = String(model.nodeCount) + ' nodes';
	document.getElementById('source-code').textContent = model.sourceXml || '';
	document.getElementById('markdown-code').textContent = model.markdownBullets || '';
	updateToolbarState();

	if (!model.mindElixirData) {
		document.getElementById('empty').classList.add('visible');
		setViewMode(viewMode);
		return;
	}

	const MindElixirCtor = window.MindElixir && (window.MindElixir.default || window.MindElixir);
	if (!MindElixirCtor) {
		reportError('init', new Error('MindElixir library did not load'));
		return;
	}

	function post(type, payload) {
		if (!vscode) { return; }
		vscode.postMessage(Object.assign({ type: type, requestId: 'me-' + (++saveSeq) }, payload || {}));
		setStatus('Saving...', '');
	}

	function setViewMode(mode) {
		viewMode = mode === 'xml' || mode === 'markdown' ? mode : 'mindmap';
		document.getElementById('map').hidden = viewMode !== 'mindmap';
		document.getElementById('source-view').hidden = viewMode !== 'xml';
		document.getElementById('markdown-view').hidden = viewMode !== 'markdown';
		document.querySelectorAll('[data-view-mode]').forEach(function (button) {
			button.classList.toggle('active', button.getAttribute('data-view-mode') === viewMode);
		});
		const hint = viewMode === 'xml'
			? '.mm XML source · read-only preview in this page'
			: viewMode === 'markdown'
				? 'Markdown bullet notes · XMind-style outline preview'
				: (editable ? 'Mind Elixir · toolbar: child/sibling/edit/delete · drag to move · shortcuts still work' : 'Read-only · pan/zoom · Fit');
		document.getElementById('mode-hint').textContent = hint;
		updateToolbarState();
		if (viewMode === 'mindmap' && mind) {
			setTimeout(function () {
				try { if (typeof mind.scaleFit === 'function') { mind.scaleFit(); } else { mind.toCenter(); } } catch (_) { /* noop */ }
			}, 0);
		}
	}

	function parentDirection(parent, child) {
		if (child && child.direction === 0) { return 'left'; }
		if (child && child.direction === 1) { return 'right'; }
		if (parent && Array.isArray(parent.children)) {
			const index = parent.children.indexOf(child);
			if (index >= 0) {
				return index % 2 === 0 ? 'right' : 'left';
			}
		}
		return undefined;
	}

	function siblingForInsertedNode(obj, type) {
		const parent = obj && obj.parent;
		if (!parent || !Array.isArray(parent.children)) { return null; }
		const index = parent.children.indexOf(obj);
		if (index < 0) { return null; }
		if (type === 'before') {
			return parent.children[index + 1] || null;
		}
		return parent.children[index - 1] || null;
	}

	function firstMovedNode(operation) {
		const nodes = Array.isArray(operation.objs) ? operation.objs : (operation.obj ? [operation.obj] : []);
		return nodes && nodes[0] ? nodes[0] : null;
	}

	function moveTargetNode(operation) {
		return operation.toObj || operation.obj || null;
	}

	function postMove(operation, placement) {
		const moved = firstMovedNode(operation);
		const target = moveTargetNode(operation);
		if (!moved || !moved.id || !target || !target.id) { return; }
		if (placement === 'inside') {
			post('moveNode', { nodeId: moved.id, parentId: target.id, placement: 'inside' });
			return;
		}
		const parent = target.parent;
		if (!parent || !parent.id) { return; }
		post('moveNode', { nodeId: moved.id, parentId: parent.id, siblingId: target.id, placement: placement });
	}

	function handleOperation(operation) {
		if (!editable || !operation || !operation.name) { return; }
		const obj = operation.obj;
		switch (operation.name) {
			case 'moveNodeBefore':
				postMove(operation, 'before');
				return;
			case 'moveNodeAfter':
				postMove(operation, 'after');
				return;
			case 'moveNodeIn':
				postMove(operation, 'inside');
				return;
			case 'finishEdit':
				if (obj && obj.id) { post('updateNodeText', { nodeId: obj.id, text: obj.topic || 'New topic' }); }
				return;
			case 'addChild':
				if (obj && obj.parent && obj.parent.id) { post('appendChild', { parentId: obj.parent.id, text: obj.topic || 'New topic' }); }
				return;
			case 'insertSibling': {
				const sibling = siblingForInsertedNode(obj, operation.type === 'before' ? 'before' : 'after');
				if (sibling && sibling.id) { post('appendSibling', { siblingId: sibling.id, text: obj.topic || 'New topic', position: parentDirection(obj.parent, obj), siblingPlacement: operation.type === 'before' ? 'before' : 'after' }); }
				return;
			}
			case 'removeNodes': {
				const node = Array.isArray(operation.objs) ? operation.objs[0] : undefined;
				if (node && node.id) { post('removeNode', { nodeId: node.id }); }
				return;
			}
			case 'createArrow':
				if (obj && obj.from && obj.to) { post('createArrowlink', { sourceId: obj.from, destination: obj.to, startArrow: obj.bidirectional ? 'Default' : 'None', endArrow: 'Default', color: obj.style && obj.style.stroke }); }
				return;
			case 'removeArrow':
				if (obj && obj.id) { post('removeArrowlink', { arrowlinkId: obj.id }); }
				return;
		}
	}

	try {
		mind = new MindElixirCtor({
			el: '#map',
			direction: MindElixirCtor.SIDE || 2,
			editable: editable,
			keypress: true,
			contextMenu: editable ? { focus: true, link: true } : false,
			toolBar: false,
			allowUndo: true,
			mouseSelectionButton: 0,
			overflowHidden: false,
			newTopicName: 'New topic',
			markdown: function (text) { return String(text || '').replace(/[&<>]/g, function (ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'; }); }
		});
		mind.init(model.mindElixirData);
		mind.bus.addListener('operation', handleOperation);
		mind.bus.addListener('selectNodes', function (nodes) {
			if (nodes && nodes[0]) {
				selectedNodeId = nodes[0].id;
				setStatus(nodes.length + ' selected', '');
				updateToolbarState();
				refreshStyleControls();
			}
		});
		mind.bus.addListener('unselectNodes', function () {
			if (!mind.currentNodes || mind.currentNodes.length === 0) {
				selectedNodeId = null;
				stylePanelOpen = false;
				updateToolbarState();
			}
		});
		mind.bus.addListener('expandNode', function (node) {
			if (editable && node && node.id) { post('toggleFolded', { nodeId: node.id, folded: node.expanded === false }); }
		});
		setTimeout(function () {
			if (selectedNodeId) {
				try { mind.selectNode(mind.findEle(selectedNodeId), true); } catch (_) { /* node may be folded */ }
			}
			try { mind.toCenter(); } catch (_) { /* noop */ }
		}, 0);
		setStatus(editable ? 'Ready' : 'Read-only', 'success');
		setViewMode(viewMode);
	} catch (err) {
		reportError('init', err);
	}

	document.getElementById('fit').addEventListener('click', function () {
		try {
			if (mind && typeof mind.scaleFit === 'function') { mind.scaleFit(); }
			else if (mind && typeof mind.toCenter === 'function') { mind.toCenter(); }
		} catch (err) { reportError('fit', err); }
	});

	document.querySelectorAll('[data-view-mode]').forEach(function (button) {
		button.addEventListener('click', function () { setViewMode(button.getAttribute('data-view-mode')); });
	});

	document.getElementById('add-child').addEventListener('click', function () {
		runSelected('add-child', function (element) { mind.addChild(element); });
	});
	document.getElementById('add-sibling').addEventListener('click', function () {
		runSelected('add-sibling', function (element) { mind.insertSibling('after', element); });
	});
	document.getElementById('edit-node').addEventListener('click', function () {
		runSelected('edit-node', function (element) { mind.beginEdit(element); });
	});
	document.getElementById('style-node').addEventListener('click', function () {
		stylePanelOpen = !stylePanelOpen;
		updateToolbarState();
		refreshStyleControls();
	});
	stylePanel.addEventListener('click', function (event) {
		const target = event.target && event.target.closest ? event.target.closest('[data-style-action]') : event.target;
		handleStyleAction(target);
	});
	document.getElementById('font-size').addEventListener('change', function (event) {
		const value = event.target && event.target.value ? Number(event.target.value) : null;
		postStyle('setFont', { size: Number.isFinite(value) ? value : null });
	});
	document.getElementById('edge-style').addEventListener('change', function (event) {
		const value = event.target && event.target.value ? event.target.value : null;
		postStyle('setEdge', { style: value });
	});
	document.getElementById('edge-width').addEventListener('change', function (event) {
		const value = event.target && event.target.value ? Number(event.target.value) : null;
		postStyle('setEdge', { width: Number.isFinite(value) ? value : null });
	});
	document.getElementById('delete-node').addEventListener('click', function () {
		runSelected('delete-node', function (element) {
			if (element.nodeObj && !element.nodeObj.parent) {
				setStatus('Root topic cannot be deleted', 'error');
				return;
			}
			mind.removeNodes([element]);
		});
	});

	window.addEventListener('message', function (event) {
		const msg = event.data;
		if (!msg || typeof msg.type !== 'string') { return; }
		if (msg.ok === false) { setStatus('Save failed', 'error'); return; }
		if (msg.type === 'nodeTextUpdated' || msg.type === 'structureUpdated') { setStatus('Saved', 'success'); }
	});
})();
</script>
</body>
</html>`;
}

function escapeScriptJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

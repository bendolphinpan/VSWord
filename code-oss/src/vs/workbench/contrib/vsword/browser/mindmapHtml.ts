/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webviewGenericCspSource } from '../../webview/common/webview.js';
import { mindmapToMindElixirData, VSWordMindElixirData } from '../common/mindmapElixir.js';
import { VSWordMindmapNode } from '../common/mindmapXml.js';
import { mindElixirScriptBase64, mindElixirStyleBase64 } from './mindmapElixirAssets.js';

export interface VSWordMindmapWebviewModel {
	readonly fileName: string;
	readonly root?: VSWordMindmapNode;
	readonly mindElixirData?: VSWordMindElixirData;
	readonly nodeCount: number;
	readonly sourceKind: 'mm';
	readonly editable: boolean;
	readonly selectedNodeId?: string;
}

export function getMindmapHtml(model: VSWordMindmapWebviewModel): string {
	const cspSource = webviewGenericCspSource;
	const htmlModel: VSWordMindmapWebviewModel = {
		...model,
		mindElixirData: model.root ? mindmapToMindElixirData(model.root) : undefined
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
	#map { position: absolute; inset: 0; padding-top: 52px; }
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
		<span class="hint" id="mode-hint">Mind Elixir · Tab=child · Enter=sibling · Delete=remove · Dbl-click/F2=edit · Right-click=link</span>
		<span id="status"></span>
		<button id="fit">Fit</button>
	</div>
	<div id="map" aria-label="VSWord Mindmap"></div>
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
	let saveSeq = 0;
	let selectedNodeId = model.selectedNodeId || null;
	let mind = null;

	function setStatus(text, className) {
		status.textContent = text || '';
		status.className = className || '';
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
	document.getElementById('mode-hint').textContent = editable ? 'Mind Elixir · Tab=child · Enter=sibling · Delete=remove · Dbl-click/F2=edit · Right-click=link' : 'Read-only · pan/zoom · Fit';

	if (!model.mindElixirData) {
		document.getElementById('empty').classList.add('visible');
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

	function handleOperation(operation) {
		if (!editable || !operation || !operation.name) { return; }
		const obj = operation.obj;
		switch (operation.name) {
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
	} catch (err) {
		reportError('init', err);
	}

	document.getElementById('fit').addEventListener('click', function () {
		try {
			if (mind && typeof mind.scaleFit === 'function') { mind.scaleFit(); }
			else if (mind && typeof mind.toCenter === 'function') { mind.toCenter(); }
		} catch (err) { reportError('fit', err); }
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

#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * VSWord React Flow spike local bundle builder.
 *
 * Dev-only. It intentionally installs dependencies into D:/GIT/VSWord/.tmp/reactflow-spike-builder
 * and writes generated assets to this spike's gitignored vendor directory.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const codeOssRoot = process.cwd();
const workspaceRoot = path.resolve(codeOssRoot, '..');
const spikeRoot = __dirname;
const builderDir = path.join(workspaceRoot, '.tmp', 'reactflow-spike-builder');
const srcDir = path.join(builderDir, 'src');
const vendorDir = path.join(spikeRoot, 'vendor');
const entryPath = path.join(srcDir, 'entry.jsx');
const bundlePath = path.join(vendorDir, 'index.js');
const thirdPartyPath = path.join(vendorDir, 'THIRD_PARTY_LICENSES.md');

function run(command, cwd = builderDir) {
	console.log(`[reactflow-spike] ${command}`);
	cp.execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command], {
		cwd,
		stdio: 'inherit',
	});
}

fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

fs.writeFileSync(entryPath, `import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  NodeResizer,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const vscode = acquireVsCodeApi();
const initialWebviewState = (() => {
  try {
    const state = vscode.getState?.() || {};
    return typeof state === 'string' ? JSON.parse(state) : state;
  } catch {
    return {};
  }
})();
const MIN_NODE_WIDTH = 220;
const MIN_NODE_HEIGHT = 118;
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_FILE_HEIGHT = 178;
const DEFAULT_FOLDER_HEIGHT = 126;

function coerceNodeSize(node) {
  const width = Math.max(Number(node.width) || DEFAULT_NODE_WIDTH, MIN_NODE_WIDTH);
  const fallbackHeight = node.type === 'folder' ? DEFAULT_FOLDER_HEIGHT : DEFAULT_FILE_HEIGHT;
  const height = Math.max(Number(node.height) || fallbackHeight, MIN_NODE_HEIGHT);
  return { width, height };
}

function toRfNodes(canvas, previewVisible) {
  return (canvas.nodes || []).map((node) => {
    const size = coerceNodeSize(node);
    return {
      id: node.id,
      type: node.type === 'folder' ? 'folderCard' : node.type === 'file' ? 'fileCard' : 'noteCard',
      position: { x: Number(node.x) || 0, y: Number(node.y) || 0 },
      data: { node, previewVisible },
      style: { width: size.width, height: size.height },
    };
  });
}

function syncPreviewFlag(nodes, previewVisible) {
  return nodes.map((node) => ({ ...node, data: { ...node.data, previewVisible } }));
}

function toRfEdges(canvas) {
  return (canvas.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.fromPort || 'right',
    targetHandle: edge.toPort || 'left',
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}

function persistResize(nodeId, width, height) {
  vscode.postMessage({ type: 'nodeResized', node: { id: nodeId, width, height } });
}

function encodeArrayBufferBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function filesToImportPayload(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  const payload = [];
  for (const file of files) {
    payload.push({ name: file.name || 'pasted-file', mime: file.type || '', dataBase64: encodeArrayBufferBase64(await file.arrayBuffer()) });
  }
  return payload;
}

function fileIconLabel(node) {
  return (node.typeLabel || node.extension || 'FILE').toString().slice(0, 4).toUpperCase();
}

function previewText(node) {
  return node.summary || (node.previewKind === 'fallback' ? 'Preview not available for this file type. Double-click to open.' : 'No preview content.');
}

function CardResizer({ node, selected }) {
  return <NodeResizer
    isVisible={selected}
    minWidth={MIN_NODE_WIDTH}
    minHeight={MIN_NODE_HEIGHT}
    lineClassName="vsword-resize-line"
    handleClassName="vsword-resize-handle"
    onResizeEnd={(_event, params) => persistResize(node.id, params.width, params.height)}
  />;
}

function CardHandles() {
  return <>
    <Handle id="top" type="target" position={Position.Top} />
    <Handle id="right" type="source" position={Position.Right} />
    <Handle id="bottom" type="source" position={Position.Bottom} />
    <Handle id="left" type="target" position={Position.Left} />
  </>;
}

function FileCard({ data, selected }) {
  const node = data.node;
  const previewVisible = data.previewVisible !== false;
  const iconClass = node.previewKind === 'image' ? 'image' : node.previewKind === 'fallback' ? 'fallback' : 'doc';
  return <div className={'vsword-card file ' + (node.previewKind || 'fallback')} title="Double-click to open file">
    <CardResizer node={node} selected={selected} />
    <CardHandles />
    <div className="head"><span className={'icon ' + iconClass}>{fileIconLabel(node)}</span><span className="title">{node.label || node.filePath}</span></div>
    <div className="path">{node.filePath}</div>
    {previewVisible ? <div className="preview-slot">
      {node.previewImageUri ? <img className="image-preview" src={node.previewImageUri} alt={node.label || node.filePath} /> : null}
      {node.previewKind === 'image' && !node.previewImageUri ? <div className="file-fallback">Image preview unavailable</div> : null}
      {node.previewKind !== 'image' ? <pre className={node.previewKind === 'fallback' ? 'summary fallback-text' : 'summary'}>{previewText(node)}</pre> : null}
    </div> : <div className="hint">Preview hidden</div>}
  </div>;
}

function FolderCard({ data, selected }) {
  const node = data.node;
  return <div className="vsword-card folder" title="Double-click to drill into folder">
    <CardResizer node={node} selected={selected} />
    <CardHandles />
    <div className="head"><span className="icon folder">DIR</span><span className="title">{node.label || node.folderPath}</span></div>
    <div className="path">{node.folderPath}</div>
    <div className="hint">Double-click to open sub-canvas</div>
  </div>;
}

function NoteCard({ data, selected }) {
  const node = data.node;
  const title = node.label || node.text || node.id;
  const previewVisible = data.previewVisible !== false;
  return <div className="vsword-card note">
    <CardResizer node={node} selected={selected} />
    <CardHandles />
    <div className="head"><span className="icon note">TXT</span><span className="title">{title}</span></div>
    {previewVisible && node.text ? <pre className="summary">{node.text}</pre> : <div className="hint">{previewVisible ? node.type : 'Preview hidden'}</div>}
  </div>;
}

const nodeTypes = { fileCard: FileCard, folderCard: FolderCard, noteCard: NoteCard };

function App() {
  const [folder, setFolder] = useState({ name: 'Loading…', uri: '' });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [stagedItems, setStagedItems] = useState([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [error, setError] = useState('');
  const [previewVisible, setPreviewVisible] = useState(initialWebviewState.previewVisible !== false);
  const [minimapVisible, setMinimapVisible] = useState(initialWebviewState.minimapVisible !== false);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [fitNonce, setFitNonce] = useState(0);
  const restoredViewportRef = useRef(false);
  const canvasViewportRef = useRef(null);
  const restoreStateRef = useRef({
    kind: initialWebviewState.kind || 'vsword.reactFlowCanvas',
    version: initialWebviewState.version || 1,
    folderUri: initialWebviewState.folderUri || '',
  });
  const previewVisibleRef = useRef(initialWebviewState.previewVisible !== false);

  React.useEffect(() => {
    previewVisibleRef.current = previewVisible;
    setNodes((nds) => syncPreviewFlag(nds, previewVisible));
  }, [previewVisible]);

  React.useEffect(() => {
    try {
      vscode.setState({ ...restoreStateRef.current, previewVisible, minimapVisible });
    } catch {
      // Ignore environments without VS Code state support.
    }
  }, [previewVisible, minimapVisible]);

  React.useEffect(() => {
    const onMessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'folderData') {
        setFolder({ name: msg.folderName || 'Folder', uri: msg.folderUri || '' });
        restoreStateRef.current = { ...restoreStateRef.current, folderUri: msg.folderUri || restoreStateRef.current.folderUri };
        try { vscode.setState({ ...restoreStateRef.current, previewVisible: previewVisibleRef.current, minimapVisible }); } catch {}
        canvasViewportRef.current = msg.canvas?.viewport || null;
        restoredViewportRef.current = false;
        setNodes(toRfNodes(msg.canvas || {}, previewVisibleRef.current));
        setEdges(toRfEdges(msg.canvas || {}));
        setStagedItems(Array.isArray(msg.stagedItems) ? msg.stagedItems : []);
        setFitNonce((n) => n + 1);
        setError('');
      } else if (msg.type === 'hostError') {
        setError(msg.message || 'Unknown host error');
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  React.useEffect(() => {
    if (!reactFlowInstance || nodes.length === 0 || restoredViewportRef.current) return;
    const handle = window.setTimeout(() => {
      const viewport = canvasViewportRef.current;
      const hasSavedViewport = viewport && (Number(viewport.x) !== 0 || Number(viewport.y) !== 0 || Number(viewport.zoom) !== 1);
      if (hasSavedViewport) {
        reactFlowInstance.setViewport({
          x: Number(viewport.x) || 0,
          y: Number(viewport.y) || 0,
          zoom: Number(viewport.zoom) || 1,
        }, { duration: 180 });
      } else {
        reactFlowInstance.fitView({ padding: 0.28, includeHiddenNodes: false, duration: 180 });
      }
      restoredViewportRef.current = true;
    }, 80);
    return () => window.clearTimeout(handle);
  }, [reactFlowInstance, fitNonce, nodes.length]);

  const toCanvasPoint = useCallback((event) => {
    if (reactFlowInstance?.screenToFlowPosition) {
      return reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    }
    return { x: 80, y: 80 };
  }, [reactFlowInstance]);

  const defaultInsertPoint = useCallback(() => {
    if (reactFlowInstance?.screenToFlowPosition) {
      return reactFlowInstance.screenToFlowPosition({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) });
    }
    return { x: 80, y: 80 };
  }, [reactFlowInstance]);

  React.useEffect(() => {
    const onPaste = async (event) => {
      const files = event.clipboardData?.files;
      const point = defaultInsertPoint();
      if (files && files.length > 0) {
        event.preventDefault();
        vscode.postMessage({ type: 'importFiles', files: await filesToImportPayload(files), x: point.x, y: point.y });
        return;
      }
      const text = event.clipboardData?.getData('text/plain') || '';
      if (text.trim()) {
        event.preventDefault();
        vscode.postMessage({ type: 'createTextNode', text, x: point.x, y: point.y });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [defaultInsertPoint]);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodesDelete = useCallback((deletedNodes) => {
    const ids = deletedNodes.map((node) => node.id).filter(Boolean);
    if (ids.length === 0) return;
    vscode.postMessage({ type: 'nodesDeleted', ids });
  }, []);

  const onEdgesDelete = useCallback((deletedEdges) => {
    const ids = deletedEdges.map((edge) => edge.id).filter(Boolean);
    if (ids.length === 0) return;
    vscode.postMessage({ type: 'edgesDeleted', ids });
  }, []);

  const onNodeDragStop = useCallback((_event, node) => {
    vscode.postMessage({ type: 'nodesMoved', nodes: [{ id: node.id, x: node.position.x, y: node.position.y }] });
  }, []);

  const onMoveEnd = useCallback((_event, viewport) => {
    vscode.postMessage({
      type: 'viewportChanged',
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      },
    });
  }, []);

  const onConnect = useCallback((connection) => {
    const edge = {
      id: 'edge_' + connection.source + '_' + connection.sourceHandle + '_' + connection.target + '_' + connection.targetHandle + '_' + Date.now(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || 'right',
      targetHandle: connection.targetHandle || 'left',
      markerEnd: { type: MarkerType.ArrowClosed },
    };
    setEdges((eds) => addEdge(edge, eds));
    vscode.postMessage({
      type: 'edgeCreated',
      edge: {
        id: edge.id,
        from: edge.source,
        to: edge.target,
        fromPort: edge.sourceHandle,
        toPort: edge.targetHandle,
      },
    });
  }, []);

  const onNodeDoubleClick = useCallback((_event, rfNode) => {
    const node = rfNode.data?.node;
    if (!node) return;
    if (node.type === 'file') {
      vscode.postMessage({ type: 'openFile', filePath: node.filePath });
    } else if (node.type === 'folder') {
      vscode.postMessage({ type: 'openSubCanvas', folderPath: node.folderPath });
    }
  }, []);

  const restoreStaged = useCallback((item) => {
    const point = defaultInsertPoint();
    vscode.postMessage({ type: 'restoreStagedItems', paths: [item.path], x: point.x, y: point.y });
  }, [defaultInsertPoint]);

  const restoreAllStaged = useCallback(() => {
    if (stagedItems.length === 0) return;
    const point = defaultInsertPoint();
    vscode.postMessage({ type: 'restoreStagedItems', paths: stagedItems.map((item) => item.path), x: point.x, y: point.y });
  }, [defaultInsertPoint, stagedItems]);

  const requestDeleteStaged = useCallback((item) => {
    setPendingDelete(item);
  }, []);

  const confirmDeleteStaged = useCallback(() => {
    if (!pendingDelete) return;
    vscode.postMessage({ type: 'deleteWorkspaceItems', paths: [pendingDelete.path] });
    setPendingDelete(null);
  }, [pendingDelete]);

  const onDragOver = useCallback((event) => {
    if (event.dataTransfer?.files?.length) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(async (event) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    event.preventDefault();
    const point = toCanvasPoint(event);
    vscode.postMessage({ type: 'importFiles', files: await filesToImportPayload(files), x: point.x, y: point.y });
  }, [toCanvasPoint]);

  const fitViewOptions = useMemo(() => ({ padding: 0.28 }), []);

  return <div className="canvas-shell" onDragOver={onDragOver} onDrop={onDrop}>
    <div className="canvas-header"><strong>React Flow Canvas</strong><span>{folder.name}</span><span>Drop/paste files · Delete sends to tray</span></div>
    <div className="canvas-toolbar">
      <button type="button" className={previewVisible ? 'active' : ''} onClick={() => setPreviewVisible(v => !v)}>{previewVisible ? 'Hide preview' : 'Show preview'}</button>
      <button type="button" className={trayOpen ? 'active' : ''} onClick={() => setTrayOpen(v => !v)}>Tray {stagedItems.length}</button>
    </div>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onMoveEnd={onMoveEnd}
      onInit={setReactFlowInstance}
      onNodeDoubleClick={onNodeDoubleClick}
      fitView
      fitViewOptions={fitViewOptions}
      deleteKeyCode={['Backspace', 'Delete']}
    >
      <Background gap={32} size={1} />
      <Controls />
      <Panel position="bottom-right" className="map-panel">
        <button type="button" className={minimapVisible ? 'map-toggle active' : 'map-toggle'} title={minimapVisible ? 'Hide map' : 'Show map'} onClick={() => setMinimapVisible(v => !v)}>⌖</button>
        {minimapVisible ? <div className="map-popover"><MiniMap pannable zoomable nodeStrokeWidth={3} /></div> : null}
      </Panel>
    </ReactFlow>
    {trayOpen ? <aside className="staged-tray">
      <div className="tray-head">
        <div><strong>Canvas Tray</strong><span>{stagedItems.length} file/folder not on canvas</span></div>
        <button type="button" onClick={() => setTrayOpen(false)}>×</button>
      </div>
      <div className="tray-actions">
        <button type="button" disabled={stagedItems.length === 0} onClick={restoreAllStaged}>Restore all</button>
      </div>
      <div className="tray-list">
        {stagedItems.length === 0 ? <div className="tray-empty">No hidden files. Delete a canvas card to place it here.</div> : stagedItems.map((item) => <div className="tray-item" key={item.path}>
          <div className="tray-meta"><span className={item.type === 'folder' ? 'tray-icon folder' : 'tray-icon file'}>{item.type === 'folder' ? 'DIR' : (item.extension || 'FILE').slice(0, 4).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.path}</small></div></div>
          <div className="tray-buttons"><button type="button" onClick={() => restoreStaged(item)}>Restore</button><button type="button" className="danger" onClick={() => requestDeleteStaged(item)}>Delete file</button></div>
        </div>)}
      </div>
    </aside> : null}
    {pendingDelete ? <div className="delete-confirm">
      <div className="delete-card"><strong>Really delete from disk?</strong><p>{pendingDelete.path}</p><div><button type="button" onClick={() => setPendingDelete(null)}>Cancel</button><button type="button" className="danger" onClick={confirmDeleteStaged}>Delete to system trash</button></div></div>
    </div> : null}
    {error ? <div className="spike-error">{error}</div> : null}
  </div>;
}

createRoot(document.getElementById('app')).render(<App />);
`);

if (!fs.existsSync(path.join(builderDir, 'package.json'))) {
	fs.writeFileSync(path.join(builderDir, 'package.json'), JSON.stringify({
		private: true,
		name: 'vsword-reactflow-spike-builder',
		version: '0.0.0',
		type: 'module',
	}, null, 2));
}

run('npm install react@18.3.1 react-dom@18.3.1 @xyflow/react@12.11.1 esbuild@0.27.0 --prefer-offline --no-audit --no-fund');
console.log('[reactflow-spike] esbuild bundle');
require(path.join(builderDir, 'node_modules', 'esbuild')).buildSync({
	entryPoints: [entryPath],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	jsx: 'automatic',
	outfile: bundlePath,
	loader: { '.css': 'css' },
	legalComments: 'linked',
	minify: true,
});

const licenseJson = cp.execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm ls --json --long --all'] : ['-lc', 'npm ls --json --long --all'], { cwd: builderDir, encoding: 'utf8' });
const tree = JSON.parse(licenseJson);
const seen = new Map();
function walk(name, node) {
	if (!node || !name) return;
	if (node.version && !seen.has(`${name}@${node.version}`)) {
		seen.set(`${name}@${node.version}`, { name, version: node.version, license: node.license || 'UNKNOWN', repository: node.repository?.url || node.repository || '' });
	}
	for (const [childName, child] of Object.entries(node.dependencies || {})) walk(childName, child);
}
walk(tree.name, tree);
const packages = [...seen.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
let out = '# React Flow Spike Third-Party License Snapshot\n\n';
out += 'Generated from the temporary builder lockfile under `.tmp/reactflow-spike-builder`. This file documents the dev-only spike bundle; it is not a production dependency approval.\n\n';
out += '## Notes\n\n';
out += '- Primary package: `@xyflow/react@12.11.1` (MIT).\n';
out += '- React/ReactDOM are MIT.\n';
out += '- Generated `vendor/index.js` and `vendor/index.css` are gitignored local artifacts.\n\n';
out += '## Packages\n\n';
for (const pkg of packages) out += `- ${pkg.name}@${pkg.version} — ${pkg.license}${pkg.repository ? ` — ${pkg.repository}` : ''}\n`;
fs.writeFileSync(thirdPartyPath, out);
console.log(`[reactflow-spike] wrote ${bundlePath}`);
console.log(`[reactflow-spike] wrote ${thirdPartyPath}`);

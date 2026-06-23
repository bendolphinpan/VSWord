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

fs.writeFileSync(entryPath, `import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const vscode = acquireVsCodeApi();

function toRfNodes(canvas) {
  return (canvas.nodes || []).map((node) => ({
    id: node.id,
    type: node.type === 'folder' ? 'folderCard' : node.type === 'file' ? 'fileCard' : 'noteCard',
    position: { x: Number(node.x) || 0, y: Number(node.y) || 0 },
    data: { node },
    style: { width: Math.max(Number(node.width) || 260, 260) },
  }));
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

function CardHandles() {
  return <>
    <Handle id="top" type="target" position={Position.Top} />
    <Handle id="right" type="source" position={Position.Right} />
    <Handle id="bottom" type="source" position={Position.Bottom} />
    <Handle id="left" type="target" position={Position.Left} />
  </>;
}

function FileCard({ data }) {
  const node = data.node;
  return <div className="vsword-card file" title="Double-click to open file">
    <CardHandles />
    <div className="head"><span className="icon doc">MD</span><span className="title">{node.label || node.filePath}</span></div>
    <div className="path">{node.filePath}</div>
    {node.summary ? <pre className="summary">{node.summary}</pre> : <div className="hint">Double-click to open file</div>}
  </div>;
}

function FolderCard({ data }) {
  const node = data.node;
  return <div className="vsword-card folder" title="Double-click to drill into folder">
    <CardHandles />
    <div className="head"><span className="icon folder">DIR</span><span className="title">{node.label || node.folderPath}</span></div>
    <div className="path">{node.folderPath}</div>
    <div className="hint">Double-click to open sub-canvas</div>
  </div>;
}

function NoteCard({ data }) {
  const node = data.node;
  const title = node.label || node.text || node.id;
  return <div className="vsword-card note">
    <CardHandles />
    <div className="head"><span className="icon">✦</span><span className="title">{title}</span></div>
    {node.text ? <pre className="summary">{node.text}</pre> : <div className="hint">{node.type}</div>}
  </div>;
}

const nodeTypes = { fileCard: FileCard, folderCard: FolderCard, noteCard: NoteCard };

function App() {
  const [folder, setFolder] = useState({ name: 'Loading…', uri: '' });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [error, setError] = useState('');

  React.useEffect(() => {
    const onMessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'folderData') {
        setFolder({ name: msg.folderName || 'Folder', uri: msg.folderUri || '' });
        setNodes(toRfNodes(msg.canvas || {}));
        setEdges(toRfEdges(msg.canvas || {}));
        setError('');
      } else if (msg.type === 'hostError') {
        setError(msg.message || 'Unknown host error');
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeDragStop = useCallback((_event, node) => {
    vscode.postMessage({ type: 'nodesMoved', nodes: [{ id: node.id, x: node.position.x, y: node.position.y }] });
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

  const fitViewOptions = useMemo(() => ({ padding: 0.2 }), []);

  return <div className="canvas-shell">
    <div className="canvas-header"><strong>React Flow Canvas</strong><span>{folder.name}</span><span>MIT spike · SVG untouched</span></div>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onNodeDoubleClick={onNodeDoubleClick}
      fitView
      fitViewOptions={fitViewOptions}
    >
      <Background gap={32} size={1} />
      <Controls />
      <MiniMap pannable zoomable nodeStrokeWidth={3} />
    </ReactFlow>
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

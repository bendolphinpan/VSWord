#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 * VSWord Block Editor bundle builder.
 *
 * Bundles BlockNote (React + Markdown round-trip) into a single JS/CSS pair
 * for the VSWord block editor webview. Uses esbuild for CSP-safe bundling
 * (no eval, no inline scripts).
 *
 * Run from repo root:
 *   node code-oss/src/vs/workbench/contrib/vsword/browser/blockeditor/build-blockeditor.cjs
 *
 * Output:
 *   vendor/index.js   (bundled BlockNote + React, no CSS)
 *   vendor/index.css  (BlockNote styles)
 *   vendor/THIRD_PARTY_LICENSES.md
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const spikeRoot = __dirname;
// blockeditor/ → browser/ → vsword/ → contrib/ → workbench/ → vs/ → src/ → code-oss/
const codeOssRoot = path.resolve(spikeRoot, '..', '..', '..', '..', '..', '..', '..');
const workspaceRoot = path.resolve(codeOssRoot, '..');  // D:\GIT\VSWord
const builderDir = path.join(workspaceRoot, '.tmp', 'blockeditor-builder');
const srcDir = path.join(builderDir, 'src');
const vendorDir = path.join(spikeRoot, 'vendor');
const entryPath = path.join(srcDir, 'entry.jsx');
const bundlePath = path.join(vendorDir, 'index.js');
const cssPath = path.join(vendorDir, 'index.css');
const thirdPartyPath = path.join(vendorDir, 'THIRD_PARTY_LICENSES.md');

function run(bin, args, cwd = builderDir) {
	console.log(`[blockeditor] ${bin} ${args.join(' ')}`);
	cp.execFileSync(bin, args, { cwd, stdio: 'inherit', shell: true });
}

fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

// --- entry.jsx: webview-side bootstrap ---
fs.writeFileSync(entryPath, `import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteViewRaw as BlockNoteView } from '@blocknote/react';
import { BlockNoteEditor, markdownToBlocks } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/react/style.css';

const vscode = acquireVsCodeApi();

function getTheme() {
  const bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim();
  if (!bg) return 'light';
  let r, g, b;
  if (bg.startsWith('#')) {
    const hex = bg.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    const m = bg.match(/\\\\d+/g);
    if (!m) return 'light';
    [r, g, b] = m.map(Number);
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? 'dark' : 'light';
}

function App() {
  const editorRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState('light');
  const saveTimerRef = useRef(null);
  const pendingContentRef = useRef(null);

  // Create editor once with a placeholder block
  if (!editorRef.current) {
    editorRef.current = BlockNoteEditor.create({
      initialContent: [{ type: 'paragraph', content: [] }],
    });
  }

  useEffect(() => {
    setTheme(getTheme());
    const handler = (e) => {
      const msg = e.data;
      if (msg.type === 'init') {
        const editor = editorRef.current;
        try {
          const blocks = markdownToBlocks(msg.content || '', editor.pmSchema);
          editor.replaceBlocks(editor.document, blocks);
        } catch (err) {
          console.error('[VSWord BlockEditor] markdownToBlocks failed:', err);
          // Fallback: insert raw text
          editor.insertBlocks(
            [{ type: 'paragraph', content: [{ type: 'text', text: msg.content || '' }] }],
            editor.document[0],
            'before'
          );
        }
        setReady(true);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleChange = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      try {
        const md = editor.blocksToMarkdownLossy();
        vscode.postMessage({ type: 'save', content: md });
      } catch (err) {
        console.error('[VSWord BlockEditor] blocksToMarkdownLossy failed:', err);
      }
    }, 800);
  }, []);

  if (!ready) {
    return React.createElement('div',
      { style: { padding: '24px', color: 'var(--vscode-descriptionForeground, #888)' } },
      'Loading Block Editor\\u2026');
  }

  return React.createElement(BlockNoteView, {
    editor: editorRef.current,
    theme: theme,
    onChange: handleChange,
    editable: true,
  });
}

const root = createRoot(document.getElementById('app'));
root.render(React.createElement(App));
`);

// --- package.json ---
if (!fs.existsSync(path.join(builderDir, 'package.json'))) {
	fs.writeFileSync(path.join(builderDir, 'package.json'), JSON.stringify({
		private: true,
		type: 'module',
		dependencies: {
			'@blocknote/core': '^0.51.0',
			'@blocknote/react': '^0.51.0',
			'react': '^18.3.1',
			'react-dom': '^18.3.1',
		},
		devDependencies: {
			'esbuild': '^0.25.0',
		},
	}, null, 2));
}

// --- install deps ---
if (!fs.existsSync(path.join(builderDir, 'node_modules', '@blocknote', 'core'))) {
	const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	run(npmBin, ['install', '--no-audit', '--no-fund']);
}

// --- bundle JS (exclude CSS, bundle separately) ---
const esbuildBin = path.join(builderDir, 'node_modules', '.bin', 'esbuild');
const esbuildBinCmd = process.platform === 'win32' ? esbuildBin + '.cmd' : esbuildBin;
run(esbuildBinCmd, [
	entryPath, '--bundle', '--format=esm', '--minify',
	'--outfile=' + bundlePath, '--jsx=automatic', '--external:*.css', '--conditions=style'
]);

// --- bundle CSS ---
const cssEntryPath = path.join(srcDir, 'css-entry.css');
fs.writeFileSync(cssEntryPath, `@import '@blocknote/core/fonts/inter.css';
@import '@blocknote/react/style.css';
`);
run(esbuildBinCmd, [
	cssEntryPath, '--bundle', '--outfile=' + cssPath, '--minify', '--conditions=style',
	'--loader:.woff=file', '--loader:.woff2=file'
]);

// --- Third party licenses ---
const licenses = `# Third Party Licenses

## BlockNote
MIT License - Copyright (c) 2023 TypeCell

## React
MIT License - Copyright (c) Meta Platforms, Inc.

## ProseMirror (via BlockNote)
MIT License - Copyright (c) 2015+ Marijn Haverbeke

All packages are bundled into index.js/index.css via esbuild.
`;
fs.writeFileSync(thirdPartyPath, licenses);

console.log('[blockeditor] Build complete:');
console.log(`  JS:  ${bundlePath} (${(fs.statSync(bundlePath).size / 1024).toFixed(0)} KB)`);
console.log(`  CSS: ${cssPath} (${(fs.statSync(cssPath).size / 1024).toFixed(0)} KB)`);

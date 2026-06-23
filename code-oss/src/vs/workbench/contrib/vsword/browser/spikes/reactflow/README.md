# VSWord T-4B React Flow Folder Canvas Spike

## Goal

Validate whether `@xyflow/react` (React Flow, MIT) can replace the hand-rolled SVG interaction layer for VSWord Folder-as-Canvas while preserving the self-owned VSWord semantic model.

## Safety boundaries

- Do not replace `Open as Canvas` / SVG MVP.
- Do not modify root `package.json` or `package-lock.json`.
- Install React Flow dependencies only in `.tmp/reactflow-spike-builder`.
- Generated `vendor/index.js` and `vendor/index.css` are local dev artifacts and gitignored.
- Keep `.vsword/canvas.json` as the source of truth.

## Command

```text
Open as React Flow Canvas
```

Available from the command palette and Explorer folder context menu.

## Verification

```bash
cd /d/GIT/VSWord/code-oss
node src/vs/workbench/contrib/vsword/browser/spikes/reactflow/build-reactflow-spike.cjs
npm run compile
```

Then launch Code OSS and right-click a folder:

```text
Open as React Flow Canvas
```

Expected:

- Direct child files/folders render as React Flow custom nodes.
- Dragging nodes persists x/y to `.vsword/canvas.json`.
- Connecting handles persists edges.
- Double-click file node opens the file.
- Double-click folder node opens a sub-folder React Flow canvas.

## Current verdict

PARTIAL / spike validated enough for side-by-side UX testing.

Evidence:

- `build-reactflow-spike.cjs` generates local `vendor/index.js` and `vendor/index.css` from temporary `.tmp/reactflow-spike-builder` dependencies.
- Root `package.json` / `package-lock.json` remain unchanged.
- `npm run compile` finished with 0 errors.
- Generated bundle artifacts are gitignored; committed files are source, styles, README, and license snapshot only.

Remaining manual check:

- Right-click a folder and click `Open as React Flow Canvas`.
- Confirm node drag, edge connect, file double-click, and folder drill-in feel better/worse than the SVG MVP.

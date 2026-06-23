# VSWord T-4B React Flow Folder Canvas Spike

## Goal

Validate whether `@xyflow/react` (React Flow, MIT) can replace the hand-rolled SVG interaction layer for VSWord Folder-as-Canvas while preserving the self-owned VSWord semantic canvas model.

## Status

Dev-only spike. The production SVG canvas remains available as `Open as Canvas`.

This spike registers a separate entry:

- `Open as React Flow Canvas`

## Why React Flow

- MIT license.
- Native `nodes[]` / `edges[]` model maps cleanly to VSWord `CanvasDocument`.
- Provides pan, zoom, selection, drag, handles, edges, controls, minimap, and node resize without rebuilding all interactions by hand.
- Keeps VSWord files/folders as first-class semantic nodes instead of embedding a full third-party app model.

## Dependency policy

- Do not edit root `package.json` / `package-lock.json` for this spike.
- `build-reactflow-spike.cjs` installs dependencies into `.tmp/reactflow-spike-builder`.
- Generated `vendor/index.js`, `vendor/index.css`, and legal sidecar files are gitignored local artifacts.
- `vendor/THIRD_PARTY_LICENSES.md` is committed as a snapshot for review.

## Implemented behavior

- Host reuses VSWord folder discovery and `.vsword/canvas.json` persistence.
- Webview receives `folderData`.
- Folder children render as React Flow cards.
- File nodes show Markdown/text summaries when preview is enabled; binary-like/unsupported files show a typed fallback instead of reading content.
- Image file nodes (`png/jpg/jpeg/gif/webp/svg`) show stable in-card thumbnails from local workspace resources when preview is enabled.
- Markdown nodes can show a local first-image thumbnail while still keeping the card size stable.
- Preview can be toggled without reloading folder data.
- Minimap opens from a bottom-right circular map button as an overlay popover.
- Folder data triggers a delayed `fitView({ padding: 0.28 })` after async host data arrives, preventing right-edge clipping from stale initial fit bounds.
- HTML includes a small critical light-theme loading style before the generated CSS loads to reduce white/dark/white startup flashes.
- Node drag persists `x/y`.
- Node edge resize persists `width/height`.
- Edge connection persists `CanvasEdge`.
- Selected nodes/edges can be removed with Delete/Backspace; deletion only removes canvas entries and never deletes files/folders from disk.
- Files/folders that exist in the folder but are not on the canvas appear in the Canvas Tray.
- Canvas Tray supports restoring one/all staged items back onto the canvas.
- Canvas Tray supports explicit disk deletion with a confirmation dialog; host uses filesystem trash when available.
- Dragging files onto the canvas writes them into the current folder and creates file nodes at the drop point.
- Pasting files/images writes them into the current folder (images into `assets/`) and creates file nodes; pasting plain text creates a text node.
- Webview tabs are persisted/restored by a workbench `IWebviewWorkbenchService.registerResolver()` contribution; folder URI is stored in `webview.state` and used to reattach HTML/message handling after reload.
- Viewport pan/zoom is persisted to `.vsword/canvas.json` and restored with `setViewport`; empty/default boards still use `fitView`.
- Preview/map toggles are merged into `webview.state` without overwriting the folder URI required for tab restore.
- Double-click file node opens the file.
- Double-click folder node opens a sub-folder React Flow canvas.

## Pretext note

`@chenglou/pretext` was checked as a future candidate for text measurement/layout:

- latest checked version: `0.0.8`
- license: MIT

It is not included in this spike yet. The current problem was layout shift caused by hover-height CSS, so the safer fix is a stable card box, fixed preview area, and explicit node resize. Pretext is more relevant later for automatic text measurement, masonry layout, or non-DOM typographic previews.

## Current verdict

PARTIAL / spike validated enough for side-by-side UX testing.

Evidence:

- `build-reactflow-spike.cjs` generates local `vendor/index.js` and `vendor/index.css` from temporary `.tmp/reactflow-spike-builder` dependencies.
- Root `package.json` / `package-lock.json` remain unchanged.
- Code OSS `npm run compile` completes with 0 errors.
- Generated bundle artifacts are gitignored; committed files are source, styles, README, and license snapshot only.
- GUI smoke confirms Code OSS starts with a clean user-data directory; manual click verification is still required for UI details.

Remaining manual check:

- Right-click a folder and click `Open as React Flow Canvas`.
- Toggle preview and minimap.
- Resize file/folder cards from selected-node edges.
- Confirm node drag, edge connect, file double-click, and folder drill-in feel better/worse than the SVG MVP.

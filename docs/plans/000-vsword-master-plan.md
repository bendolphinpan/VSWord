# VSWord Master Plan

> Role split: Hermes main agent acts as project planner and quality reviewer. Developer subagents execute technical research and implementation tasks.  
> Current decision: VSWord is a Code OSS based, extension-compatible, local-first writing and visual knowledge workspace.  
> Non-goal: real-time collaboration, cloud team workspace, default Copilot integration.

## 1. Product Definition

VSWord is a writer-focused Code OSS distribution that keeps the VS Code extension ecosystem while changing the default experience from programmer IDE to personal writing, knowledge management, mind mapping, and canvas-based file organization.

Formula:

```text
VSWord = Code OSS base
       + VS Code extension compatibility
       - Copilot by default
       - programmer-first default UI noise
       + Markdown / Notion-like document editing
       + .mm / XMind-like mind mapping
       + folder-as-canvas / Miro-like organization
       + local transparent files
       + single-user personal knowledge workflow
```

## 2. Hard Requirements

### P0 Product Requirements

1. Keep VS Code extension host and extension APIs compatible as much as possible.
2. Support installing, disabling, uninstalling extensions.
3. Support local VSIX installation.
4. Prefer Open VSX or equivalent non-Microsoft marketplace strategy unless licensing is reviewed.
5. Remove or disable built-in Copilot entry points from default product.
6. Keep normal local file/folder workflow.
7. Support Markdown read/write without data loss.
8. Add writer-friendly default workbench layout.
9. Add folder Canvas concept.
10. Add `.mm` mind map read/write support.
11. Store VSWord-specific metadata under `.vsword/`, not inside opaque databases only.
12. Do not implement real-time collaboration.

### P0 Technical Requirements

1. First prove Code OSS can build/run on the target Windows/WSL development setup.
2. First prove extension host still works after product changes.
3. Avoid large invasive edits to VS Code core.
4. Prefer new `src/vs/workbench/contrib/vsword/` modules where possible.
5. Preserve upstream sync ability.
6. Add explicit compatibility tests/checklists for representative extensions.

## 3. Architecture Principles

### Keep, Do Not Break

- Extension Host
- Commands
- Keybindings
- Settings
- Themes
- Webviews
- Custom Editors
- FileService
- Search
- Workspace storage
- VSIX install path

### Hide or Reframe by Default

- Debug
- Terminal
- source control prominence
- code-oriented welcome content
- developer-heavy activity bar entries

### Remove by Default

- Built-in Copilot surfaces
- Copilot welcome recommendations
- Copilot commands/status items if bundled

AI extensions are not banned; they are simply not built into the default product.

## 4. Planned Module Layout

Preferred new source area after Code OSS is introduced:

```text
src/vs/workbench/contrib/vsword/
├── common/
│   ├── vswordTypes.ts
│   ├── documentModel.ts
│   ├── blockModel.ts
│   ├── canvasModel.ts
│   ├── mindmapModel.ts
│   ├── metadataModel.ts
│   └── extensionApi.ts
├── browser/
│   ├── welcome/
│   ├── writingHome/
│   ├── markdown/
│   ├── blockEditor/
│   ├── canvas/
│   ├── mindmap/
│   ├── database/
│   ├── preview/
│   └── settings/
├── services/
│   ├── vswordDocumentService.ts
│   ├── vswordCanvasService.ts
│   ├── vswordMindmapService.ts
│   ├── vswordMetadataService.ts
│   ├── vswordIndexService.ts
│   └── vswordExtensionService.ts
└── test/
```

## 5. Workspace Data Layout

```text
project-root/
├── docs/
├── maps/
├── assets/
├── references/
└── .vsword/
    ├── workspace.json
    ├── canvas/
    ├── metadata/
    ├── databases/
    ├── history/
    ├── cache/
    └── extensions/
```

Rules:

1. User content remains normal files.
2. `.vsword/` stores layouts, indexes, caches, and metadata.
3. Markdown files must remain useful in other editors.
4. `.mm` files must remain compatible with FreeMind-style tools where feasible.

## 6. Phase Roadmap

### Phase 0 — Code OSS Baseline and Extension Compatibility

Goal: prove the base is viable before product features.

Deliverables:

- Code OSS source present in repository or documented source acquisition path.
- Build/run instructions for Windows/WSL setup.
- Product rename investigation.
- Copilot removal/disable investigation.
- Extension host compatibility verified with simple extension/VSIX/theme.
- Marketplace strategy documented.
- Initial risk register.

### Phase 1 — Writer Workbench Shell

Goal: make default UI writer-oriented while keeping extension functionality.

Deliverables:

- VSWord welcome/home concept.
- Activity bar/sidebar defaults.
- writing project templates.
- extension entry retained.
- programmer panels hidden by default, not destroyed.

### Phase 2 — Markdown Core

Goal: reliable Markdown writing.

Deliverables:

- Markdown edit/preview/read mode plan.
- frontmatter handling.
- word count.
- image paste/local asset flow.
- markdown extension compatibility checks.

### Phase 3 — Block Editor MVP

Goal: Notion-like editing over Markdown.

Deliverables:

- block model.
- Markdown AST round-trip strategy.
- initial block types.
- `/` menu.
- unknown syntax preservation policy.

### Phase 4 — Folder Canvas MVP

Goal: every folder can become a canvas.

Deliverables:

- canvas document schema.
- file cards.
- previews.
- pins/text/frame/stickers/edges.
- layout persistence.

### Phase 5 — `.mm` Mind Map MVP

Goal: read/write `.mm` and edit basic mind maps.

Deliverables:

- `.mm` parser/writer.
- mind map model.
- basic layout.
- node editing.
- Markdown outline import/export.

## 7. Quality Gates

No implementation task is accepted unless it passes these gates.

### Gate A — Spec Compliance

- Does it implement exactly the requested scope?
- Are extension compatibility and non-collaboration constraints respected?
- Are file paths and storage rules followed?
- Is Copilot not reintroduced?

### Gate B — Code Quality

- Minimal invasive changes to Code OSS core.
- Clear naming and module boundaries.
- No data-loss behavior.
- Errors are handled or documented.
- Tests/checklists included where practical.

### Gate C — Integration Safety

- Existing VS Code extension mechanism still works.
- Existing file workflows still work.
- Build/test commands documented.
- No hidden dependency on proprietary services.

## 8. Current Repository State

As of project start, `/mnt/d/git/VSWord` exists but is not yet a git repository and contains no source files. The first action is planning and technical research, not coding against nonexistent source.

## 9. Immediate Next Steps

1. Developer agent A: research Code OSS fork/build/extension-marketplace/Copilot removal path.
2. Developer agent B: research module architecture for document, canvas, and mindmap inside Code OSS.
3. Reviewer: compare outputs, create Phase 0 implementation plan.
4. User decision: initialize repository with Code OSS source or keep planning docs only until manual source acquisition.

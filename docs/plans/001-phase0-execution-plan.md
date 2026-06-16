# VSWord Phase 0 Execution Plan

> **For Hermes:** Main agent acts as project manager and reviewer. Developer agents execute individual tasks. Every task requires evidence and review before moving on.

**Goal:** Establish a reproducible Code OSS baseline for VSWord, prove extension compatibility, remove default Copilot surfaces, and retire the highest-risk architecture assumptions before Phase 1.

**Architecture:** VSWord will remain a Code OSS based distribution with VS Code extension compatibility preserved. Product customization should be concentrated in product configuration and new `src/vs/workbench/contrib/vsword/` modules. Markdown, Canvas, and `.mm` mind map features must not proceed to write-capable implementation until data-preservation spikes pass.

**Current Repository State:** `/mnt/d/git/VSWord` currently contains planning/research documents only. It is not a git repository and does not contain Code OSS source.

---

## 0. Phase 0 Scope

### In Scope

1. Decide and document source acquisition strategy.
2. Clone/fork selected Code OSS baseline after user approval.
3. Record exact upstream tag/commit.
4. Build and run unmodified baseline.
5. Verify extension system preservation.
6. Verify Open VSX / VSIX extension workflows.
7. Prove minimal product branding/data-directory isolation.
8. Prove default Copilot removal without breaking user-installed AI extensions.
9. Run high-risk spikes for custom editor/webview lifecycle.
10. Run high-risk spikes for Markdown round-trip preservation.
11. Run high-risk spikes for `.mm` XML preservation.
12. Review third-party dependencies and licenses.
13. Produce Phase 1 Go/No-Go report.

### Out of Scope

1. No realtime collaboration.
2. No cloud account system.
3. No CRDT/OT.
4. No shared comments or presence.
5. No production block editor implementation.
6. No production Canvas implementation.
7. No production `.mm` editor implementation.
8. No private marketplace integration.
9. No Microsoft Marketplace default integration before legal review.
10. No default Copilot or built-in AI assistant.

---

## 1. Hard Quality Gates

### Gate A — Repository Baseline Gate

Phase 0 cannot proceed to product modification until:

- [ ] Code OSS source is present in an agreed path.
- [ ] Exact upstream tag/commit is recorded.
- [ ] Unmodified baseline install/build/start is verified.
- [ ] Build logs are saved.
- [ ] Baseline failure list is empty or accepted by reviewer.

### Gate B — Extension Compatibility Gate

No UI/product refactor is accepted unless these still work:

- [ ] Extensions View opens.
- [ ] Extension search works against selected gallery.
- [ ] Extension install works.
- [ ] Extension disable/enable works.
- [ ] Extension uninstall works.
- [ ] Local VSIX install works.
- [ ] Theme extension works.
- [ ] Markdown extension works.
- [ ] Extension command appears and runs.
- [ ] Extension configuration appears.
- [ ] Webview extension works.
- [ ] Custom editor extension works, if available.

Negative requirements:

- [ ] Do not remove Extension Host.
- [ ] Do not delete Extensions View.
- [ ] Do not disable VSIX installation.
- [ ] Do not overwrite user keybindings.
- [ ] Do not remove developer features from the system; only hide/reframe defaults.
- [ ] Do not hard-code Microsoft Marketplace URLs as default.
- [ ] Do not globally ban AI/chat extensions.

### Gate C — Copilot Removal Gate

Default VSWord must pass:

- [ ] No bundled Copilot extension.
- [ ] No default Copilot recommendation.
- [ ] No `defaultChatAgent` pointing to Copilot.
- [ ] No welcome/getting-started Copilot prompt.
- [ ] No Copilot status bar/menu entry by default.
- [ ] First launch does not call Copilot service endpoints.
- [ ] User can still install ordinary extensions, including AI-related extensions, through normal extension flow.

### Gate D — Webview / Custom Editor Safety Gate

Before using webviews for block editor, Canvas, or mind map:

- [ ] Minimal custom editor opens.
- [ ] Dirty state works.
- [ ] Save works.
- [ ] Save As works.
- [ ] Revert works.
- [ ] Backup/reload works.
- [ ] Crash/restart recovery is understood.
- [ ] CSP blocks arbitrary remote scripts.
- [ ] Local resources use `asWebviewUri`.
- [ ] Webview cannot directly write files.
- [ ] All file writes go through workbench service/FileService/TextFileService.
- [ ] Workspace Trust behavior is documented.

### Gate E — Markdown Data Preservation Gate

No write-capable block editor work may begin until:

- [ ] Markdown fixture set exists.
- [ ] Parse → serialize with no user change is byte-for-byte identical, or differences are documented in a strict whitelist.
- [ ] Single block edit produces localized diff.
- [ ] Frontmatter unknown fields are preserved.
- [ ] HTML blocks are preserved.
- [ ] Unknown directives are preserved.
- [ ] Code fences are preserved.
- [ ] CJK/English mixed text is preserved.
- [ ] Image relative paths are preserved.
- [ ] Save failure cannot corrupt original file.
- [ ] External file modification conflict blocks blind overwrite.

### Gate F — `.mm` XML Preservation Gate

No write-capable `.mm` mind map editor work may begin until:

- [ ] `.mm` fixture set exists.
- [ ] Parse → serialize preserves known nodes.
- [ ] Unknown attributes are preserved.
- [ ] Unknown child elements are preserved.
- [ ] Node order is preserved.
- [ ] Rich content is preserved or safely marked raw.
- [ ] Icons/links/folded state survive.
- [ ] Large maps do not freeze basic parsing.
- [ ] Save failure cannot corrupt original file.

---

## 2. Phase 0 Task Order

### Task 0.1 — Confirm Repository Strategy

**Owner:** Planner + User decision  
**Objective:** Decide whether `/mnt/d/git/VSWord` becomes the Code OSS source checkout or remains a lightweight planning repository.

**Options:**

1. **Use current directory as source repo**
   - Pros: simple path.
   - Cons: Code OSS clone may overwrite/conflict with current docs unless handled carefully.

2. **Keep current directory as planning repo and clone source elsewhere**
   - Suggested source path for WSL build: `~/git/VSWord-code-oss`.
   - Suggested source path for Windows native build: `D:\git\VSWord-code-oss`.
   - Pros: planning docs stay clean; source build can use better filesystem.
   - Cons: two directories to track.

**Acceptance:**

- [ ] Decision recorded in `docs/decisions/0001-repository-strategy.md`.
- [ ] Source path chosen.
- [ ] Build target chosen: WSL selfhost, Windows native, or both.

---

### Task 0.2 — Select Upstream Baseline

**Owner:** Developer agent  
**Objective:** Choose exact Code OSS upstream tag/commit.

**Steps:**

1. Inspect latest VS Code stable release tag.
2. Record Node version from `.nvmrc` for that tag.
3. Record official build instructions URL.
4. Record known risks.

**Deliverable:**

- `docs/phase0/baseline-selection.md`

**Acceptance:**

- [ ] Upstream URL recorded.
- [ ] Tag/commit recorded.
- [ ] Node/npm requirements recorded.
- [ ] Build target assumptions recorded.

---

### Task 0.3 — Acquire Source

**Owner:** Developer agent, after user approval  
**Objective:** Clone or fork Code OSS in chosen source path.

**Rules:**

- Do not clone the large repository without explicit user approval.
- If building in WSL, prefer WSL ext4 path over `/mnt/d` for performance.
- If preparing Windows installer, use Windows native environment.

**Deliverable:**

- Source checkout at chosen path.
- `docs/phase0/source-checkout-report.md`

**Acceptance:**

- [ ] `git remote -v` recorded.
- [ ] `git rev-parse HEAD` recorded.
- [ ] branch/tag recorded.
- [ ] working tree clean before modifications.

---

### Task 0.4 — Build and Run Unmodified Baseline

**Owner:** Developer agent  
**Objective:** Prove upstream baseline works before VSWord changes.

**Likely Commands:**

```bash
npm install
npm run watch
./scripts/code.sh --version     # WSL/Linux selfhost
```

or on Windows:

```bat
npm install
npm run watch
.\scripts\code.bat
.\scripts\code-cli.bat --version
```

**Deliverable:**

- `docs/phase0/baseline-build-report.md`
- build logs under `docs/phase0/logs/`

**Acceptance:**

- [ ] install completed or failure documented.
- [ ] watch/compile completed or failure documented.
- [ ] app starts or blocker documented.
- [ ] CLI version works or blocker documented.

---

### Task 0.5 — Minimal Product Identity PoC

**Owner:** Developer agent  
**Objective:** Make the smallest safe product-identity changes.

**Likely Areas:**

- `product.json`
- product icons/resources, only if necessary.
- data folder name.

**Deliverable:**

- Patch branch or commit.
- `docs/phase0/product-identity-report.md`

**Acceptance:**

- [ ] App name shows VSWord or controlled test name.
- [ ] Data folder isolated from VS Code/Code OSS.
- [ ] User settings/extensions location understood.
- [ ] Extension system still passes Gate B.

---

### Task 0.6 — Extension Gallery and VSIX Baseline

**Owner:** Developer agent  
**Objective:** Prove extension ecosystem works.

**Test Extensions:**

- Theme extension.
- Markdown extension.
- Simple command/configuration extension.
- Webview extension.
- Custom editor extension, if practical.

**Deliverable:**

- `docs/phase0/extension-compatibility-report.md`
- smoke checklist results.

**Acceptance:**

- [ ] Gate B fully passes or exceptions approved.
- [ ] Open VSX endpoints documented.
- [ ] VSIX install path documented.
- [ ] Extension failures listed with root cause.

---

### Task 0.7 — Copilot Default Removal PoC

**Owner:** Developer agent  
**Objective:** Remove default Copilot surfaces without damaging extension ecosystem.

**Search Terms:**

```text
copilot
Copilot
defaultChatAgent
extensionAllowedProposedApi
trustedExtensionAuthAccess
recommendations
chat
welcome
gettingStarted
```

**Deliverable:**

- `docs/phase0/copilot-removal-report.md`
- patch branch or commit.

**Acceptance:**

- [ ] Gate C fully passes.
- [ ] User-installed extensions still work.
- [ ] No global ban on AI extensions.

---

### Task 0.8 — Custom Editor / Webview Lifecycle Spike

**Owner:** Developer agent  
**Objective:** Prove custom editor/webview can safely back VSWord block editor, Canvas, and mind map.

**Deliverable:**

- Minimal spike code or extension.
- `docs/phase0/custom-editor-webview-spike.md`

**Acceptance:**

- [ ] Gate D fully passes or exceptions documented.

---

### Task 0.9 — Markdown Round-Trip Spike

**Owner:** Developer agent  
**Objective:** Prove Markdown can be parsed/serialized safely before block editor writes files.

**Fixtures:**

- frontmatter with unknown fields.
- headings/lists/tasks.
- table.
- HTML block.
- code fence.
- unknown directive.
- CJK/English mixed text.
- images with relative paths.

**Deliverable:**

- `docs/phase0/markdown-roundtrip-spike.md`
- fixture files.
- diff results.

**Acceptance:**

- [ ] Gate E fully passes or Phase 1 block editor must remain read-only/prototype-only.

---

### Task 0.10 — `.mm` XML Preservation Spike

**Owner:** Developer agent  
**Objective:** Prove `.mm` files can be parsed/serialized safely.

**Fixtures:**

- simple FreeMind map.
- icons.
- links.
- folded nodes.
- richcontent.
- unknown attributes.
- unknown children.
- large map.

**Deliverable:**

- `docs/phase0/mm-preservation-spike.md`
- fixture files.
- diff results.

**Acceptance:**

- [ ] Gate F fully passes or Phase 1 `.mm` editor must remain read-only/prototype-only.

---

### Task 0.11 — Dependency and License Review

**Owner:** Developer agent  
**Objective:** Review candidate libraries before adoption.

**Candidates:**

- TipTap
- ProseMirror
- Lexical
- React Flow
- tldraw
- Konva
- PixiJS
- fast-xml-parser or equivalent
- unified/remark/rehype ecosystem

**Deliverable:**

- `docs/phase0/dependency-license-review.md`

**Acceptance:**

- [ ] License recorded.
- [ ] Maintenance status recorded.
- [ ] Bundle/webview implications recorded.
- [ ] CSP compatibility risks recorded.
- [ ] Chinese IME risks recorded for editor libraries.

---

### Task 0.12 — Phase 0 Exit Review

**Owner:** Planner + reviewer agents  
**Objective:** Decide whether Phase 1 may begin.

**Deliverable:**

- `docs/phase0/phase0-exit-review.md`

**Exit Criteria:**

- [ ] Gate A passed.
- [ ] Gate B passed.
- [ ] Gate C passed.
- [ ] Gate D passed or architecture adjusted.
- [ ] Gate E passed or block editor write-back deferred.
- [ ] Gate F passed or `.mm` write-back deferred.
- [ ] Dependency/license review complete.
- [ ] Phase 1 plan updated based on actual evidence.

---

## 3. Review Workflow

Each implementation task follows this sequence:

1. Developer agent executes task.
2. Spec reviewer checks against task requirements.
3. Quality reviewer checks risks, data safety, extension compatibility, and maintainability.
4. Planner accepts or requests fixes.
5. Task marked complete only after both reviews pass.

No task may skip review.

---

## 4. Immediate Decision Required

Before any Code OSS source operation, the user must choose:

1. Use `/mnt/d/git/VSWord` as the eventual source repository, or
2. Keep `/mnt/d/git/VSWord` as planning/docs and clone source to a separate path.

Recommended choice:

```text
Keep /mnt/d/git/VSWord as planning/docs for now.
Clone Code OSS source separately:
- WSL build: ~/git/VSWord-code-oss
- Windows native build: D:\git\VSWord-code-oss
```

Reason: Code OSS is large; WSL builds perform better on ext4; planning docs remain clean and easy to review.

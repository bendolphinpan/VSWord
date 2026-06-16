# Decision 0001: Repository Strategy

Date: 2026-06-15
Status: Approved and executed for an in-workspace source checkout

## Context

The current workspace `/mnt/d/git/VSWord` exists, but it is not a git repository and does not contain Code OSS source. It currently stores VSWord planning and research documents.

Code OSS is a large repository. The build location matters:

- WSL ext4 paths usually perform better for Linux/WSL self-hosting.
- `/mnt/d` Windows-mounted paths may have slower I/O and file watcher issues under WSL.
- Windows installer builds should eventually run in a Windows native environment.

## Decision

Executed strategy:

```text
User-approved executed strategy:
Keep /mnt/d/git/VSWord as the main VSWord workspace and clone Code OSS source below it:
- Source checkout path: /mnt/d/git/VSWord/code-oss
- Upstream: https://github.com/microsoft/vscode.git
- Tag: 1.124.2
- HEAD: 6928394f91b684055b873eecb8bc281365131f1c
```

Previous recommendation was to keep source outside the planning workspace for WSL performance, but the user explicitly approved using this path.

## Rationale

1. User explicitly approved keeping the source under the existing VSWord workspace path.
2. Keeps all VSWord assets under one top-level project directory.
3. Makes the source checkout easy to find from Windows at `D:\git\VSWord\code-oss`.
4. Trade-off accepted: WSL builds under `/mnt/d` may be slower than WSL ext4 and file watching may be less reliable.

## Alternatives Considered

### Alternative A: Clone Code OSS directly into `/mnt/d/git/VSWord`

Pros:
- One directory only.

Cons:
- Current planning docs would be mixed into source tree.
- WSL build performance may be worse on `/mnt/d`.
- Harder to distinguish product planning from upstream source changes.

### Alternative B: Clone to Windows `D:\git\VSWord-code-oss`

Pros:
- Better for eventual Windows installer/package work.

Cons:
- Requires Windows native Node/Python/Visual Studio Build Tools setup.
- More user-side environment setup.

### Alternative C: Do not clone source yet

Pros:
- Safe while planning is still evolving.

Cons:
- Cannot verify actual Code OSS build/extension/Copilot behavior.

## Operational Rule

The source checkout has been created. Future developer agents should treat `/mnt/d/git/VSWord/code-oss` as the upstream Code OSS baseline checkout until this decision is superseded.

No VSWord product modifications should be made until the unmodified baseline build/run gate passes.

## Next Step

Proceed to Phase 0 Task 0.4: build and run the unmodified baseline, after activating the Node version requested by `.nvmrc`.

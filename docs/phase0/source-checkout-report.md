# VSWord Phase 0 Source Checkout Report

Date: 2026-06-15

## Summary

Code OSS source was acquired under the user-approved VSWord workspace path.

## Approved Source Path

```text
/mnt/d/git/VSWord/code-oss
```

## Upstream Baseline

```text
Repository: https://github.com/microsoft/vscode.git
Release tag: 1.124.2
Release published: 2026-06-12T05:06:56Z
Release URL: https://github.com/microsoft/vscode/releases/tag/1.124.2
HEAD commit: 6928394f91b684055b873eecb8bc281365131f1c
Clone mode: shallow clone, depth 1, tag checkout
```

## Local Environment Snapshot

```text
WSL git: 2.53.0
Current Node on PATH: v22.22.3
Current npm on PATH: 10.9.8
Python: 3.11.15
Code OSS .nvmrc: 24.15.0
Disk free on /mnt/d at checkout time: about 112G
Checkout size after clone: about 283M
```

## Verification Commands Run

```bash
git clone --branch 1.124.2 --depth 1 https://github.com/microsoft/vscode.git code-oss
cd /mnt/d/git/VSWord/code-oss
git rev-parse HEAD
git describe --tags --exact-match
git remote -v
git status --porcelain
cat .nvmrc
```

## Verification Results

```text
HEAD: 6928394f91b684055b873eecb8bc281365131f1c
Exact tag: 1.124.2
Remote: https://github.com/microsoft/vscode.git
Working tree changes: 0
.nvmrc: 24.15.0
```

## Gate A Status

- [x] Code OSS source is present in an agreed path.
- [x] Exact upstream tag/commit is recorded.
- [ ] Unmodified baseline install/build/start is verified.
- [ ] Build logs are saved.
- [ ] Baseline failure list is empty or accepted by reviewer.

## Notes and Risks

1. The approved path is under `/mnt/d/git/VSWord`, which is a Windows-mounted filesystem. This is acceptable because the user explicitly approved this path, but WSL builds may be slower than on WSL ext4 and file watching may be less reliable.
2. The currently active Node version is v22.22.3, while the selected Code OSS tag requests Node 24.15.0 via `.nvmrc`. Before `npm install`, install or activate Node 24.15.0.
3. No product modifications have been made yet. The checkout is clean and remains an unmodified upstream baseline.

## Recommended Next Step

Proceed to Phase 0 Task 0.4: build and run the unmodified baseline.

Before running the build:

1. Activate Node 24.15.0 according to `.nvmrc`.
2. Run dependency installation and save logs:

```bash
cd /mnt/d/git/VSWord/code-oss
npm install 2>&1 | tee ../docs/phase0/logs/npm-install.log
```

3. Then run compile/watch and launch verification, saving logs under `docs/phase0/logs/`.

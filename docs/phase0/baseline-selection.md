# VSWord Phase 0 Task 0.2 — Code OSS Upstream Baseline 选择

> 工作区：`/mnt/d/git/VSWord`  
> 任务：选择 Code OSS upstream baseline/tag  
> 约束：本任务仅通过 GitHub API / raw content 做轻量查询；**未 clone `microsoft/vscode` 大仓库**，未运行大型构建。  
> 生成日期：2026-06-15

## 1. 结论

建议 VSWord Phase 0 以 **microsoft/vscode stable tag `1.124.2`** 作为 Code OSS 上游基线，而不是跟随 `main`。

原因：

1. `1.124.2` 是 GitHub Releases 当前最新稳定发布版本，适合作为 fork / 产品化改造的可复现起点。
2. stable tag 比 `main` 更适合 Phase 0：依赖版本、Electron 版本、构建脚本与发行状态更稳定，便于记录和复核。
3. 该 tag 可直接定位到 commit，后续 clone 后可以精确 checkout 并建立 VSWord 分支。

## 2. Upstream baseline 记录

| 字段 | 值 |
|---|---|
| Upstream repository | `https://github.com/microsoft/vscode.git` |
| GitHub project | <https://github.com/microsoft/vscode> |
| 推荐 baseline tag | `1.124.2` |
| Release 页面 | <https://github.com/microsoft/vscode/releases/tag/1.124.2> |
| Release 名称 / 版本 | `1.124.2` |
| Release 发布时间 | `2026-06-12T05:06:56Z` |
| Tag ref | `refs/tags/1.124.2` |
| Tag 指向对象类型 | `commit` |
| Tag / commit SHA | `6928394f91b684055b873eecb8bc281365131f1c` |
| Commit 页面 | <https://github.com/microsoft/vscode/commit/6928394f91b684055b873eecb8bc281365131f1c> |
| Commit 时间 | `2026-06-12T00:12:36Z` |
| Commit message | `bump version to 1.124.2 (#321047)` |

轻量查询证据：

```bash
# 查询当前 GitHub latest release
curl -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/microsoft/vscode/releases/latest

# 查询 tag ref 指向的 commit
curl -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/microsoft/vscode/git/ref/tags/1.124.2

# 查询 commit 元数据
curl -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/microsoft/vscode/commits/6928394f91b684055b873eecb8bc281365131f1c
```

## 3. Node / npm / Electron 要求

### 3.1 Node 版本

从 `1.124.2` tag 的 `.nvmrc` 轻量读取结果：

```text
24.15.0
```

因此 Phase 0 baseline 构建应优先使用：

| 依赖 | 建议 / 已知值 | 依据 |
|---|---|---|
| Node.js | `24.15.0` | `https://github.com/microsoft/vscode/blob/1.124.2/.nvmrc` |
| npm | 使用 Node `24.15.0` 自带 npm；具体版本 clone 后以 `npm --version` 复核 | `package.json` 未声明独立 npm 版本；上游构建命令使用 `npm install` |
| package lock | `package-lock.json` lockfileVersion `3` | tag 内容轻量读取 |
| Electron headers target | `42.3.0` | tag 的 `.npmrc` 中 `target="42.3.0"`、`runtime="electron"` |
| 包管理器 | `npm` | 上游文档与脚本使用 `npm install` / `npm run watch`；不要自行切换 yarn |

`.npmrc` 在该 tag 的关键值：

```ini
disturl="https://electronjs.org/headers"
target="42.3.0"
runtime="electron"
build_from_source="true"
legacy-peer-deps="true"
timeout=180000
```

> 注意：`package.json` 在轻量查询中未发现顶层 `engines` / `packageManager` 字段可用于锁定 npm 版本。因此 npm 精确版本必须在 clone 后用本机 Node `24.15.0` 环境复核。

轻量复核命令：

```bash
curl -L https://raw.githubusercontent.com/microsoft/vscode/1.124.2/.nvmrc
curl -L https://raw.githubusercontent.com/microsoft/vscode/1.124.2/.npmrc
curl -L https://raw.githubusercontent.com/microsoft/vscode/1.124.2/package.json
```

## 4. 官方构建文档链接

Phase 0 后续 build / run 应以 Microsoft VS Code 官方贡献文档为准：

- How to Contribute：<https://github.com/microsoft/vscode/wiki/How-to-Contribute>
- Prerequisites：<https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites>
- Build and Run From Source：<https://github.com/microsoft/vscode/wiki/How-to-Contribute#build-and-run-from-source>
- Windows Subsystem for Linux：<https://github.com/microsoft/vscode/wiki/How-to-Contribute#Windows-Subsystem-for-Linux>

## 5. WSL build 与 Windows native build 差异

### 5.1 WSL / Linux selfhost

适用目标：

- 在 WSL2 内验证 TypeScript 编译、基础运行、扩展系统、产品配置改造。
- 运行的是 Linux 版 Code OSS selfhost，而不是 Windows 原生桌面发行物。

建议：

- 若选择 WSL build，正式 source checkout 建议放在 WSL ext4 文件系统，例如 `~/git/VSWord-code-oss`，避免 `/mnt/d` 上的大仓库 I/O、权限和文件监听性能问题。
- 当前 `/mnt/d/git/VSWord` 可继续作为轻量规划/文档工作区。
- Windows 11 + WSLg 通常可运行 GUI；旧环境可能需要 X Server / DISPLAY 配置。

常见依赖方向：

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential g++ pkg-config make \
  python3 python-is-python3 \
  libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev \
  libxss1 libasound2 libgtk-3-0 libgdk-pixbuf2.0-0 \
  libnss3 libxtst6 libxi6 libxdamage1 libxcursor1 \
  libxcomposite1 libx11-xcb1 libgbm1
```

后续典型命令：

```bash
nvm install 24.15.0
nvm use 24.15.0
npm install
npm run watch
./scripts/code.sh
./scripts/code-cli.sh --version
```

### 5.2 Windows native build

适用目标：

- 构建/调试 Windows 原生桌面应用。
- 为未来 Windows installer / packaging 做准备。

需要重点准备：

- Windows 10/11。
- Node.js `24.15.0`，通过 `fnm`、`nvm-windows` 或手动安装均可。
- Python 3，且 `python` 命令可用。
- Visual Studio 2022 Build Tools：Desktop Development with C++、MSVC v143、Windows SDK 等 native module 构建依赖。
- 可按需设置：`npm config set msvs_version 2022`。

后续典型命令：

```bat
node --version
npm --version
npm config set msvs_version 2022
npm install
npm run watch
.\scripts\code.bat
.\scripts\code-cli.bat --version
```

### 5.3 差异总结

| 项目 | WSL build | Windows native build |
|---|---|---|
| 运行产物 | Linux selfhost Code OSS | Windows native Code OSS |
| 推荐源码位置 | WSL ext4：`~/git/VSWord-code-oss` | Windows 文件系统：如 `D:\git\VSWord-code-oss` |
| GUI | 依赖 WSLg / X Server | 原生 Windows GUI |
| native toolchain | Linux build-essential / dev libs | Visual Studio Build Tools / Windows SDK |
| 适合用途 | 快速验证、Linux selfhost、源码改造 | Windows 桌面调试、未来打包/安装器 |
| 风险 | `/mnt/d` 文件监听和 I/O 可能慢；GUI 环境差异 | VS Build Tools 组件缺失、node-gyp 配置问题 |

## 6. 后续 clone 后必须复核的命令

> 以下命令仅供 Task 0.3 / 0.4 使用。本任务未执行 clone。

### 6.1 获取 source 后的基线身份复核

```bash
# 推荐：不要在当前文档工作区直接混入大仓库，除非 Task 0.1 已明确决定。
# WSL build 建议路径：~/git/VSWord-code-oss
# Windows native build 建议路径：D:\git\VSWord-code-oss

git clone https://github.com/microsoft/vscode.git VSWord-code-oss
cd VSWord-code-oss
git checkout 1.124.2

git remote -v
git status --short
git rev-parse HEAD
git describe --tags --exact-match HEAD
```

期望：

```text
git rev-parse HEAD => 6928394f91b684055b873eecb8bc281365131f1c
git describe --tags --exact-match HEAD => 1.124.2
```

### 6.2 Node / npm / package 信息复核

```bash
cat .nvmrc
node --version
npm --version
node -p "require('./package.json').version"
node -p "require('./package-lock.json').lockfileVersion"
npm config get target
npm config get runtime
```

期望重点：

```text
.nvmrc => 24.15.0
package.json version => 1.124.2
package-lock.json lockfileVersion => 3
```

### 6.3 unmodified baseline build / run 复核

WSL / Linux selfhost：

```bash
npm install
npm run watch
./scripts/code.sh --version
./scripts/code-cli.sh --version
```

Windows native：

```bat
npm install
npm run watch
.\scripts\code.bat
.\scripts\code-cli.bat --version
```

建议保存输出到后续报告：

```text
docs/phase0/baseline-build-report.md
docs/phase0/logs/
```

## 7. 已知风险与注意事项

1. **Release 最新性会变化**：本文记录的是 2026-06-15 查询时 GitHub latest release 的状态。后续若进入长期开发，不应自动追最新；每次升级上游都应单独建立 upgrade 任务。
2. **Node 版本较新**：`1.124.2` 要求 `.nvmrc = 24.15.0`，本机 nvm / fnm / nvm-windows 可能需要更新才能安装该版本。
3. **npm 精确版本未由仓库显式锁定**：clone 后需记录 `npm --version`，并把构建日志归档。
4. **WSL 不等于 Windows 发行构建**：WSL 适合 Linux selfhost 验证；Windows installer / native behavior 必须在 Windows 原生环境复核。
5. **大仓库性能**：如果在 WSL 中使用 `/mnt/d` 构建，可能遇到文件监听、权限和 I/O 性能问题；建议大仓库放 WSL ext4 或直接走 Windows native。
6. **产品化改造不得提前混入 baseline**：Task 0.4 之前应先构建/运行 unmodified upstream baseline，再进行 `product.json`、Open VSX、品牌、Copilot 默认移除等修改。

## 8. 建议的 Phase 0 后续动作

1. Task 0.3 前由用户确认 source checkout 路径：
   - WSL：`~/git/VSWord-code-oss`
   - Windows native：`D:\git\VSWord-code-oss`
2. clone 后立即 checkout `1.124.2` 并复核 `HEAD = 6928394f91b684055b873eecb8bc281365131f1c`。
3. 在未修改源码前完成一次 baseline install / watch / launch，并把日志写入 `docs/phase0/logs/`。
4. baseline 通过后再创建 VSWord 产品化分支，例如：

```bash
git checkout -b vsword/phase0-baseline 1.124.2
```

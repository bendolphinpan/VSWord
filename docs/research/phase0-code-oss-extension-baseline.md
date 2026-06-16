# Phase 0 技术预研：Code OSS 基线、扩展生态与 Copilot 移除策略

> 项目：VSWord  
> 工作区：`/mnt/d/git/VSWord`  
> 范围：仅技术预研，不 clone 大仓库、不运行耗时构建、不修改 Code OSS 源码。  
> 目标：基于 Code OSS/VS Code 开源底座做 VSWord，保留 VS Code 扩展生态，默认去掉 Copilot，不做协作。

## 0. 结论摘要

1. **底座建议直接 fork `microsoft/vscode`，而不是从二次发行版开 fork。** 这样最接近上游，扩展 API、Extension Host、Webview、Custom Editor、VSIX 安装链路都能最大程度保持兼容。
2. **VSWord 的改造应优先收敛在 product/configuration 与新增 contrib 模块，避免大规模改 core。** Phase 0 重点验证：能构建、能运行、能安装 VSIX、能从 Open VSX 搜索/安装扩展、主题/命令/Webview/Custom Editor 兼容。
3. **默认扩展源建议使用 Open VSX，不接入 Microsoft Visual Studio Marketplace。** Microsoft Marketplace 条款通常限制 Marketplace Offerings 用于 Visual Studio Products and Services；非微软发行版直接使用存在授权风险。
4. **Copilot 策略：默认不内置、不推荐、不配置默认 Chat Agent、不展示欢迎/入口；但不封杀用户自装 AI 扩展。** 重点是移除产品级默认集成与推荐，而不是禁用 Extension Host 或 AI 类扩展能力。
5. **WSL 可用于 Linux 自托管开发，但不等同于构建 Windows 桌面发行包。** 上游文档明确指出 Windows 原生 build/debug 与 WSL selfhost 是两套路径；如要 Windows 安装包，应在 Windows 原生环境准备 VS Build Tools。

---

## 1. Code OSS 获取与 fork 策略

### 1.1 推荐 clone 源

推荐源：

```bash
git clone https://github.com/microsoft/vscode.git VSWord
```

更适合正式项目的方式：

1. 在 GitHub/GitLab 建立 `VSWord` 组织仓库。
2. 以 `microsoft/vscode` 为 upstream fork 或导入源。
3. 本地 remotes 建议：

```bash
git remote add origin <VSWord fork url>
git remote add upstream https://github.com/microsoft/vscode.git
```

不建议直接以 VSCodium 等二次发行版作为代码底座，原因：

- 其补丁目标偏“去微软服务/发行构建”，不一定符合 VSWord 的产品方向。
- 额外补丁会增加上游同步复杂度。
- VSWord 要做写作/知识工作台，应保留尽可能原生的扩展兼容性，再按需吸收 VSCodium 在 Open VSX、telemetry、product.json 上的经验。

### 1.2 分支策略

建议采用“上游跟踪 + 产品补丁分层”的分支模型：

```text
upstream/main             # microsoft/vscode 原始上游，只跟踪不改
vsword/upstream-sync      # 周期性同步/冲突解决分支
vsword/product-baseline   # product.json、品牌、扩展源、默认设置等最小产品化改造
vsword/phase0             # Phase 0 验证分支
vsword/main               # VSWord 主干，合并已验证功能
feature/*                 # 后续具体功能，例如 writer shell、markdown block editor
```

更稳妥的发布节奏：

- Phase 0 可先跟 `main`，快速验证当前构建链路。
- 进入产品开发后，建议基于 VS Code 月度 stable tag 或 release branch 做基线，例如 `1.xx.x` tag，而不是长期追逐 `main`。
- 每次升级上游时建立独立同步 PR，要求扩展兼容回归通过后再合入。

### 1.3 上游同步策略

推荐流程：

```bash
git fetch upstream
git checkout vsword/upstream-sync
git merge upstream/main      # 或 rebase 到选定 tag/release branch
git checkout vsword/main
git merge vsword/upstream-sync
```

同步原则：

- **优先 merge，不建议长期 rebase 产品主干。** Code OSS 历史大、冲突多，保留合并记录便于追踪。
- VSWord 自有改动尽量集中在：
  - `product.json`
  - `resources/*` 品牌资源
  - `build/*` 发行配置
  - `src/vs/workbench/contrib/vsword/*` 新模块
  - 少量 workbench contribution 注册点
- 每次上游同步后必须跑 Phase 0 扩展兼容清单。

---

## 2. Windows / WSL 开发环境构建注意事项

### 2.1 上游当前关键依赖

根据 VS Code 上游贡献文档与当前 `package.json`：

- Git
- Node.js：当前上游要求 **Node 22.x**，以仓库 `.nvmrc` 为准。
- npm：上游文档当前使用 `npm install`、`npm run watch`；历史版本曾使用 yarn，VSWord 不应额外引入 yarn，除非选定的上游 tag 明确要求。
- Python：node-gyp 需要，确保 `python` 可用，建议安装 `setuptools`。
- C/C++ toolchain：native module 编译需要。
- Electron：由上游构建脚本下载/管理，不建议手动替换。

### 2.2 Windows 原生构建

用于构建/调试 Windows 桌面版、未来打包 installer。

必要项：

- Windows 10/11 x64 或 ARM64。
- Node 版本管理：`fnm`、`nvm-windows` 或手动安装，版本以 `.nvmrc` 为准。
- Python 3，且命令行可执行 `python`。
- Visual Studio 2022 Build Tools，至少包含：
  - Desktop Development with C++
  - MSVC v143
  - Windows SDK（上游示例为 Windows 11 SDK 22621；ARM 场景需按上游说明选 SDK）
  - ATL/MFC/Spectre 相关组件（部分 native module/构建任务可能依赖）
- 可配置：

```bash
npm config set msvs_version 2022
```

基础命令：

```bat
npm install
npm run watch
.\scripts\code.bat
.\scripts\code-cli.bat --version
```

注意：

- 路径不要包含空格。
- Windows 用户 profile 路径最好为 ASCII，避免 node-gyp 问题。
- 如果 Electron app invalid，通常是未完成 `npm run watch` 初次编译。

### 2.3 WSL / WSL2 构建与自托管

WSL 适合 Linux 自托管开发，尤其 TypeScript 编译、快速验证。上游说明的关键点：**在 WSL 中从源码运行的是 Linux 版本 Code OSS，不是 Windows 原生版本**。Windows 发行包仍应走 Windows 原生环境。

WSL 依赖示例（Debian/Ubuntu）：

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

运行路径：

```bash
npm install
npm run watch
./scripts/code.sh
./scripts/code-cli.sh --version
```

WSLg/GUI：

- Windows 11 WSLg 通常可直接弹出 Linux GUI。
- 老环境需要 X Server（如 VcXsrv）并设置 `DISPLAY`。

重要建议：

- 若在 WSL 中构建，**尽量把源码放在 WSL ext4 文件系统**（如 `~/git/VSWord`），避免 `/mnt/d` 上的 I/O 性能、权限、文件监听问题。
- 当前规划工作区在 `/mnt/d/git/VSWord` 没问题；正式 clone 大仓库时，如坚持 WSL build，建议另建 WSL 内部 clone 或使用 Windows 原生构建。

### 2.4 yarn 说明

用户需求中提到 yarn，但当前 VS Code 上游主线已以 npm 脚本为准。建议：

- Phase 0 以选定上游版本文档为准。
- 若 `.yarnrc` / `yarn.lock` 存在且上游 tag 要求 yarn，再使用 yarn。
- 不要在 VSWord 中自行切换包管理器，避免 lockfile 与构建脚本漂移。

---

## 3. `product.json` / Product Configuration 改造思路

`product.json` 是 Code OSS 发行版产品化的核心入口。Phase 0 应优先通过 product configuration 完成品牌、数据目录、扩展源、内置扩展和默认 AI 行为控制。

### 3.1 品牌替换字段

建议字段示例：

```jsonc
{
  "nameShort": "VSWord",
  "nameLong": "VSWord",
  "applicationName": "vsword",
  "dataFolderName": ".vsword",
  "sharedDataFolderName": ".vsword-shared",
  "win32MutexName": "vsword",
  "win32DirName": "VSWord",
  "win32NameVersion": "VSWord",
  "win32RegValueName": "VSWord",
  "win32AppUserModelId": "VSWord.VSWord",
  "win32ShellNameShort": "VSWord",
  "darwinBundleIdentifier": "com.vsword.app",
  "linuxIconName": "vsword",
  "urlProtocol": "vsword",
  "serverApplicationName": "vsword-server",
  "serverDataFolderName": ".vsword-server"
}
```

注意：

- Windows AppId、UserAppId、Context Menu CLSID 等 GUID 应生成 VSWord 自有值，避免与 Code OSS/VS Code/VSCodium 冲突。
- `dataFolderName` 改为 `.vsword` 后，用户扩展、设置、缓存会隔离于 VS Code/Code OSS，便于验证不污染现有用户环境。
- 图标、资源、安装器文案需在后续 build/resources 层同步替换。

### 3.2 扩展源配置：Open VSX

Code OSS 默认不应使用 Microsoft Marketplace。建议在 `product.json` 增加 Open VSX gallery：

```jsonc
{
  "extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item",
    "latestUrlTemplate": "https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest",
    "controlUrl": "https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json"
  }
}
```

可选补充：

- 企业/离线场景可允许用户通过环境变量或用户级 product override 指向私有 Open VSX/code-marketplace。
- 不建议把 Marketplace URL 写入默认配置。

### 3.3 内置扩展控制思路

上游 `product.json` 中存在 `builtInExtensions`，并且仓库 `extensions/*` 下有大量默认扩展。VSWord 应区分三类：

| 类别 | 策略 | 示例 |
|---|---|---|
| 必留 | 保留，保障基础编辑/写作体验和扩展兼容 | markdown-language-features、json、css/html 基础语言、theme、emmet 等 |
| 可降噪 | 默认隐藏入口或弱化，但不删除核心能力 | git、debug、terminal 相关视图/欢迎内容 |
| 默认移除/不构建 | 不内置、不推荐、不作为默认 Agent | copilot-chat / Copilot 相关 |

Phase 0 不建议一次性删除大量内置扩展。先保守保留，重点只处理 Copilot 和 marketplace。后续再做 writer-first 默认 UI 降噪。

### 3.4 产品级默认设置

可考虑通过默认 settings 或 configuration defaults 做如下默认项（需以后验证具体位置）：

```jsonc
{
  "extensions.autoCheckUpdates": true,
  "extensions.autoUpdate": false,
  "telemetry.telemetryLevel": "off",
  "chat.disableAIFeatures": true
}
```

其中 `chat.disableAIFeatures` 只应作为“默认不展示 AI/Copilot 产品入口”的手段之一；若目标是允许用户自装 AI 扩展，应确认该设置是否会广泛禁用全部 AI 扩展能力。更稳妥策略是：不配置 `defaultChatAgent`、不内置 Copilot、不推荐 Copilot，而不是全局封死 AI API。

---

## 4. 扩展系统保留方案

### 4.1 必须保留的核心链路

VSWord P0 必须保持以下 VS Code 扩展机制：

- Extension Host 进程与扩展激活事件。
- 扩展 API：`vscode` npm API 兼容。
- 命令注册与 `Command Palette`。
- 设置贡献点与 `settings.json`。
- Keybindings。
- Themes / icon themes。
- Webview / WebviewView。
- Custom Editor。
- Notebook Renderer（可保留，后续是否弱化入口另议）。
- Language Server / Debug Adapter 基础能力。
- VSIX 安装、禁用、卸载、启用、版本管理。

架构原则：**VSWord 新功能应作为 workbench contribution 或内置扩展/普通扩展进入，不应改动 Extension Host 协议。**

### 4.2 VSIX 安装

需要保留命令/CLI：

```bash
code --install-extension path/to/extension.vsix
code --list-extensions --show-versions
code --uninstall-extension publisher.name
```

VSWord 未来 CLI 应对应：

```bash
vsword --install-extension path/to/extension.vsix
vsword --list-extensions --show-versions
```

验证点：

- 本地 VSIX 能安装到 VSWord 自有用户扩展目录。
- 安装后 reload 能激活。
- 禁用/卸载不会影响 VS Code 的扩展目录。

### 4.3 Open VSX 集成

Open VSX 是 vendor-neutral、开源的 VS Code 扩展 registry，公共实例为 `open-vsx.org`。它提供兼容 VS Code marketplace API 的适配端点，适合 VSWord 默认使用。

Phase 0 需要验证：

- Extensions View 中能搜索 Open VSX 扩展。
- 能安装主题扩展、Markdown 扩展、Webview 扩展。
- 扩展详情页、版本、依赖、更新提示正常。
- Open VSX 缺失扩展时，文档提示用户使用：
  - 扩展作者发布到 Open VSX；
  - 从源码 release 获取合法 VSIX；
  - 企业自建 Open VSX。

### 4.4 用户扩展目录与数据隔离

品牌改造后，应确认用户数据目录：

| 平台 | 预期数据/扩展隔离 |
|---|---|
| Windows | `%APPDATA%\VSWord` 或 product name 对应目录 |
| Linux | `~/.config/VSWord` 或 `$XDG_CONFIG_HOME/VSWord` |
| macOS | `~/Library/Application Support/VSWord` |

用户扩展目录通常由 application name / data folder 影响，需在 Phase 0 用 `--list-extensions`、文件系统检查验证。

### 4.5 代表性扩展兼容矩阵

Phase 0 建议选择小而全的扩展验证组合：

| 类型 | 建议验证对象 | 验证点 |
|---|---|---|
| 主题 | 任一 Open VSX 主题 | 安装、切换、持久化 |
| Markdown | Markdown All in One 或等价 Open VSX 扩展 | 命令、快捷键、语言贡献 |
| Webview | Excalidraw/Draw.io 类可用替代或自制最小 VSIX | Webview 加载、资源 CSP、消息通信 |
| Custom Editor | 自制最小 Custom Editor VSIX 或公开扩展 | `customEditors` contribution、打开自定义文件 |
| 命令/设置 | 自制 Hello World VSIX | activation、command、configuration |
| 语言服务 | YAML/TOML/Spell checker 等 | LSP/diagnostics 基础链路 |

注意：某些 Microsoft proprietary 扩展可能因许可证或内部产品校验无法工作，这不应被视为 VSWord Extension Host 失败。

---

## 5. Microsoft Marketplace 授权风险与替代方案

### 5.1 风险

Microsoft Visual Studio Marketplace 条款中存在“Marketplace Offerings intended for use only with Visual Studio Products and Services”之类限制。对非 Microsoft 产品（如 VSWord）而言：

- 默认接入 Marketplace API 可能违反服务条款。
- 自动下载/再分发 Marketplace VSIX 可能涉及许可证风险。
- 部分 Microsoft 扩展（C/C++、Python、Remote、Live Share 等）有额外产品限制或 proprietary 组件。
- 即使技术上可运行，也不代表法律上可默认提供。

### 5.2 替代方案

推荐顺序：

1. **默认 Open VSX 公共实例。**
2. **支持本地 VSIX 安装。** 由用户自行从合法来源获得 VSIX，例如扩展作者 GitHub Releases。
3. **鼓励扩展作者发布 Open VSX。**
4. **企业可自建 Open VSX 或 code-marketplace。**
5. **文档明确不支持默认 Microsoft Marketplace。** 如需企业内使用，应由企业法务评估并自行配置。

### 5.3 文档策略

VSWord 官网/README 应明确：

- VSWord 兼容 VS Code extension API，但默认 marketplace 是 Open VSX。
- 不保证所有 Visual Studio Marketplace 扩展可用。
- Microsoft proprietary 扩展可能受许可证限制。
- 用户可安装合法获取的 VSIX。

---

## 6. Copilot 移除 / 禁用策略

### 6.1 目标边界

目标：

- 默认不内置 Copilot。
- 默认不推荐 Copilot。
- 默认不显示 Copilot/Chat 入口。
- 默认不配置 GitHub Copilot 为 chat/default agent。
- 不向 Microsoft/GitHub Copilot 服务发起默认请求。

非目标：

- 不破坏 Extension Host。
- 不禁止用户安装其它 AI 扩展。
- 不为了移除 Copilot 大改 chat/AI core。

### 6.2 上游现状观察

当前上游 `package.json` 存在：

```jsonc
"compile": "npm-run-all2 -lp compile-client compile-copilot",
"watch": "npm-run-all2 -lp watch-client watch-extensions watch-copilot",
"compile-copilot": "npm --prefix extensions/copilot run compile"
```

且 `extensions/copilot/package.json` 显示内置扩展名为 `copilot-chat`，publisher 为 `GitHub`，包含大量 chat/AI proposed API。

当前上游 `product.json` 存在类似：

```jsonc
"defaultChatAgent": {
  "extensionId": "GitHub.copilot",
  "chatExtensionId": "GitHub.copilot-chat",
  ...
}
```

这说明仅删除 UI 入口不够，至少需要处理：构建脚本、内置扩展、product 默认 agent、推荐入口/欢迎内容。

### 6.3 推荐策略：分层移除

#### A. 构建/内置层

- 不把 `extensions/copilot` 打进 VSWord 默认发行版。
- 调整构建脚本，避免默认 `compile-copilot` / `watch-copilot` 成为必需步骤。
- 若上游要求某些 chat 类型声明存在，只保留平台能力，不绑定 Copilot 扩展。

#### B. Product 层

- 从 `product.json` 移除或不设置 `defaultChatAgent`。
- 移除 `trustedExtensionAuthAccess` 中为 Copilot 预授权的条目（若存在）。
- 不配置 Copilot 文档/隐私/订阅 URL。
- 不把 Copilot 加入 `builtInExtensions`、`extensionAllowedProposedApi` 默认白名单。

#### C. 推荐/欢迎层

- 搜索并移除默认推荐：`copilot`、`github.copilot`、`github.copilot-chat`。
- 不在 Welcome、Getting Started、Chat View 中展示 Copilot 引导。
- 如保留 Chat/AI UI，默认应为隐藏或空状态，不指向 Copilot。

#### D. 用户自装兼容层

- 不通过硬编码 blacklist 阻止 `GitHub.copilot` 或其它 AI 扩展安装。
- 不禁用 VS Code extension API 中通用的 Webview、Authentication、Language Model 相关机制，除非涉及 proprietary default integration。
- 若用户主动安装 Copilot，是否可用取决于 Copilot 自身许可证、产品校验和服务条款；VSWord 不默认承诺支持。

### 6.4 验证标准

- 新用户首次启动：无 Copilot 登录、无 Copilot 推荐、无 Copilot 状态栏入口、无默认 chat agent 指向 Copilot。
- `--list-extensions`：不出现 `GitHub.copilot` / `GitHub.copilot-chat` / 内置 `copilot-chat`。
- 网络观察：首次启动不访问 Copilot/GitHub Copilot 相关服务。
- Open VSX/VSIX：用户仍可安装非 Copilot AI 扩展，并能激活普通命令/Webview。

---

## 7. Phase 0 可执行任务清单

| # | 任务 | 目标 | 文件/区域 | 验证方式 |
|---|---|---|---|---|
| 0.1 | 建立上游 fork | 获取可同步的 Code OSS 基线 | Git remote/branch | `git remote -v` 包含 `origin` 与 `upstream`；`git log` 可追踪 upstream tag |
| 0.2 | 固定基线版本 | 避免追逐不稳定 main | Git tag/branch、`package.json`、`.nvmrc` | 记录选定 commit/tag；`node -v` 匹配 `.nvmrc` |
| 0.3 | Windows 原生依赖检查 | 确认可构建 Windows 桌面版 | Node、Python、VS Build Tools | `node -v`、`python --version`、`npm config get msvs_version`、`cl` 可用 |
| 0.4 | WSL selfhost 依赖检查 | 确认 Linux 自托管路径 | apt packages、WSLg/X11 | `node -v`、`python --version`、`pkg-config`；可启动 GUI |
| 0.5 | 首次依赖安装 | 拉取 npm/Electron/native deps | repo root、`node_modules` | `npm install` 成功，无 node-gyp 致命错误 |
| 0.6 | 初次编译运行 | 证明 Code OSS baseline 能跑 | `scripts/code.*`、`out/` | `npm run watch` 出现 `Finished compilation`；`scripts/code` 可打开 |
| 0.7 | 品牌最小替换 PoC | 验证 VSWord 数据目录/应用名隔离 | `product.json`、resources | 标题/关于页显示 VSWord；用户数据目录不污染 VS Code |
| 0.8 | Open VSX 配置 | 默认扩展源合法可用 | `product.json.extensionsGallery` | Extensions View 可搜索 Open VSX；安装主题成功 |
| 0.9 | VSIX 安装验证 | 保留本地安装能力 | CLI、Extension Management Service | `vsword/code --install-extension test.vsix` 成功；`--list-extensions` 可见 |
| 0.10 | Extension Host smoke test | 验证扩展激活链路 | Extension Host、DevTools logs | Hello World 扩展命令可执行；Extension Host 无 fatal error |
| 0.11 | 主题兼容 | 验证 theme contribution | Open VSX theme | 主题可切换、重启后保持 |
| 0.12 | 设置/命令兼容 | 验证 contributes.configuration/commands | 自制或公开扩展 | 设置项出现；命令面板可执行 |
| 0.13 | Webview 兼容 | 验证 Webview CSP/资源加载 | Webview Service | Webview 打开、资源加载、postMessage 正常 |
| 0.14 | Custom Editor 兼容 | 验证自定义编辑器 | Custom Editor contribution | 指定扩展名文件以 custom editor 打开并保存 |
| 0.15 | Markdown 内置能力 | 保留写作基础 | `extensions/markdown-language-features` | `.md` 高亮、预览、命令可用 |
| 0.16 | Copilot 不内置 | 默认无 Copilot extension | `extensions/copilot`、build scripts、product config | `--list-extensions` 无 Copilot；构建不依赖 `compile-copilot` |
| 0.17 | Copilot 不推荐/无入口 | 首次体验无 Copilot | Welcome、Getting Started、Chat product config | 新 profile 启动无 Copilot 推荐/登录/状态栏入口 |
| 0.18 | AI 扩展不被封杀 | 不破坏用户自装 AI 扩展能力 | Extension Host、Marketplace/VSIX | 安装非 Copilot AI/Chat 类扩展后能激活基础命令 |
| 0.19 | Marketplace 风险文档 | 明确默认不接 Microsoft Marketplace | README/docs | 文档写明 Open VSX、VSIX、许可证限制 |
| 0.20 | 回归清单固化 | 后续上游同步可重复验证 | `docs/qa/*` 或 CI smoke | 每次 upstream sync 都可执行同一 checklist |

---

## 8. 风险清单

| 风险 | 等级 | 描述 | 缓解 |
|---|---:|---|---|
| 上游构建链路频繁变化 | 高 | VS Code main 依赖、Node、Electron、脚本经常变 | 锁定 stable tag；升级单独 PR；记录 `.nvmrc` |
| WSL 与 Windows 构建混淆 | 高 | WSL 跑的是 Linux GUI，不能直接代表 Windows installer | Phase 0 分开验证 WSL selfhost 与 Windows native |
| Microsoft Marketplace 授权 | 高 | 非 Microsoft 产品默认接入 Marketplace 有 ToS 风险 | 默认 Open VSX；文档提示；支持合法 VSIX |
| Copilot 与上游深度集成加深 | 高 | 近版本 `compile-copilot`、`defaultChatAgent` 已进入默认脚本/产品配置 | 分层移除；每次 sync 搜索 `copilot`/`defaultChatAgent` |
| 扩展兼容性被 UI 降噪破坏 | 中高 | 隐藏 Debug/Terminal/SCM 可能误伤扩展贡献点 | Phase 1 只隐藏默认入口，不删除服务/API；Phase 0 先建兼容基线 |
| Open VSX 扩展缺失 | 中 | 部分热门扩展只在 Marketplace | 支持 VSIX；维护推荐替代扩展；引导作者发布 Open VSX |
| Proprietary 扩展不兼容 | 中 | Microsoft Python/C++/Remote 等可能限制产品 | 文档声明；推荐开源替代，如 clangd、BasedPyright、Open Remote |
| 用户数据目录冲突 | 中 | 未改全 product 字段可能污染 Code OSS/VS Code 目录 | 全量品牌字段检查；新 profile 验证目录 |
| Webview 资源域名/安全策略 | 中 | `webviewContentExternalBaseUrlTemplate`、CSP 可能影响 Webview | 保守沿用上游机制；验证 Webview extension |
| 上游 proposed API 白名单 | 中 | 某些扩展依赖 proposed API 或产品白名单 | 不默认扩大白名单；只对 VSWord 自有/必要扩展评估 |
| 大仓库在 `/mnt/d` 性能差 | 中 | WSL 下 Windows 挂载盘文件监听/IO 慢 | WSL build 使用 ext4 clone；Windows build 使用 Windows 原生工具 |
| 过早删除内置扩展 | 中 | 可能影响 Markdown、主题、语言、Notebook 等基础能力 | Phase 0 只移除 Copilot；其它先保留再评估 |

---

## 9. 质量门禁

### Gate 0：构建与启动

- 选定基线 commit/tag 记录清楚。
- `npm install` 成功。
- `npm run watch` 初次编译成功。
- 开发版可启动，关于页/标题可区分 VSWord/Code OSS。

### Gate 1：扩展系统

- Extension Host 无 fatal error。
- 本地 VSIX 安装/禁用/卸载正常。
- Open VSX 搜索/安装至少 3 类扩展成功。
- 主题、命令、设置、Webview、Custom Editor 通过 smoke test。
- 用户扩展目录与 VS Code 隔离。

### Gate 2：Copilot 默认移除

- 默认内置扩展列表无 Copilot。
- 构建脚本不依赖 Copilot 编译。
- `product.json` 无 `defaultChatAgent` 指向 GitHub Copilot。
- 首次启动无 Copilot 推荐、登录、状态栏入口。
- 普通 AI 扩展/用户自装扩展不被全局禁止。

### Gate 3：法律与服务依赖

- 默认不配置 Microsoft Marketplace。
- 默认 extension gallery 为 Open VSX 或空；若为空必须支持本地 VSIX。
- 文档声明 Microsoft Marketplace/Proprietary extension 风险。
- 首次启动不访问 Copilot 服务。

### Gate 4：上游可同步性

- VSWord 改动集中、可审查。
- 每次 upstream sync 有扩展兼容回归记录。
- 不在 core 中硬编码 VSWord 功能，优先新增 `src/vs/workbench/contrib/vsword/`。

---

## 10. 推荐 Phase 0 实施顺序

1. 用户决定：是否立即初始化 Code OSS 源码，或继续文档阶段。
2. 选择上游基线：stable tag 优先，记录 commit。
3. Windows 原生与 WSL selfhost 二选一先跑通；不要同时排查两套环境。
4. 原样 Code OSS 构建启动成功后，再做 `product.json` 最小品牌替换。
5. 加 Open VSX gallery，验证扩展搜索与安装。
6. 验证 VSIX、本地测试扩展、主题、Webview、Custom Editor。
7. 做 Copilot 默认移除 PoC，验证无入口且 Extension Host 未受影响。
8. 固化 checklist 与风险文档，作为后续 Phase 1 的准入条件。

---

## 11. 参考资料

- VS Code 源码仓库：<https://github.com/microsoft/vscode>
- VS Code How to Contribute / Build and Run：<https://github.com/microsoft/vscode/wiki/How-to-Contribute>
- VS Code Selfhosting on Windows/WSL：<https://github.com/microsoft/vscode/wiki/Selfhosting-on-Windows-WSL>
- Open VSX：<https://open-vsx.org/> / <https://github.com/eclipse-openvsx/openvsx>
- VSCodium Open VSX/product.json 经验：<https://github.com/VSCodium/vscodium>
- Visual Studio Marketplace Terms：<https://aka.ms/vsmarketplace-ToU>

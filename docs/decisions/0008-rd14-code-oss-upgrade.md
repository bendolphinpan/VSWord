# Decision 0008: Code-OSS 上游升级（RD-14）

> 日期：2026-09-09  
> 状态：**已实盘对账，禁止在主机 1.124.2 上单独跳内置扩展 / Electron / package.json**  
> 相关：`0001-repository-strategy.md`（基线 tag 1.124.2）· `004-remediation-and-debt-plan.md` RD-14

## 1. 现状（仓库 `dev` @ `3882edb3`）

| 项 | 值 |
|------|-----|
| VSWord 上游基线 | Code-OSS / VS Code **1.124.2**（2026-06-12，HEAD `6928394f` 见 0001） |
| microsoft/vscode 最新稳定 | **1.136.2**（2026-09-04，tag `88e44fa`） |
| microsoft/vscode `main` | **1.138.0-dev**（禁止跟 main） |
| 落差 | **12 个 minor**（约 12 周） |
| Electron | 1.124.2 = **42.2.0 / 42.3.0** → 1.136.2 = **42.10.0**（同主线 42，Chromium 148 一系） |
| Node | 24.15.0 → 24.18.1 |
| 仓库形态 | `code-oss/` **整树 vendoring**到 VSWord 单仓库，**不是** submodule |

### 1.1 「资源」钉点对照（product.json）

| 资源 | VSWord 1.124.2 | 上游 1.136.2 | 结论 |
|--------|----------------|-----------------|------|
| `ms-vscode.js-debug-companion` | 1.1.3 | 1.1.3 | 已最新 |
| `ms-vscode.js-debug` | 1.117.0 | 1.117.0 | 已最新 |
| `ms-vscode.vscode-js-profile-table` | **1.0.10** | **1.0.11** | 仅此项落后；**禁止单独升级**（主机 API 未跟） |
| webview CDN hash | `ef65ac1ba57f57f2a3961bfe94aa20481caca4c6` | 同 | 已同步 |
| `extensionsGallery` | Open VSX（VSWord 自研） | 上游无（商用 Marketplace 混入） | **必须保留** |
| `disabledBuiltInExtensions` | `[GitHub.copilot-chat]` | 上游改为 auto-update 开启 Copilot Chat | **必须保留禁用** |
| `defaultChatAgent` | 无（产品非目标） | 上游完整 Copilot agent 块 | **不合入** |
| `linkProtectionTrustedDomains` | `open-vsx.org` | 无 | **必须保留** |

结论：可以用 GitHub API 改的「资源 JSON」几乎已与 1.136.2 同步。真正落后的是 **整树源码 + Electron 42.2→42.10 + 12 周工作台变更**，不能只跳 `product.json`。

## 2. 为什么要升（不是为了跟版本号）

1.136.2（2026-09-08 公告）修了多条影响 VSWord 的安全问题，受影响版本均为 `< 1.136.2`：

| Advisory | 等级 | 与 VSWord 关系 |
|----------|------|----------------|
| **GHSA-x5qc-gqm7-93qp** webview `localResourceRoots` 路径约束绕过 | Moderate | Milkdown / Canvas / HTML Preview 都是 webview + `localResourceRoots` |
| GHSA-vww8-mqc2-4x8v Chat 远程图自动拉取 | Moderate | VSWord 默认关 Copilot，影响低 |
| 其他 Agent / Workspace Trust / RCE 系 | High–Critical | 若以后打开远程 Agent 才主要相关 |

**不能**把 1.136.2 的单个 commit（如 `461bd99` 正则化 webview 路径）挑回 1.124.2：webview 资源协议在 12 周内已变过几轮。

## 3. 兼容面（升级时必须保留 / 重做）

### 3.1 VSWord 自研（直接搬）

- `code-oss/src/vs/workbench/contrib/vsword/**`（Milkdown / Canvas / Mindmap / HTML Preview）
- `code-oss/src/vs/workbench/workbench.common.main.ts` 中的
  `import './contrib/vsword/browser/vsword.contribution.js'`
- `code-oss/product.json` 的 Open VSX + 禁 Copilot + trusted domain（**不要用上游原文覆盖**）
- `docs/**`、根 `AGENTS.md`、`test/**`

### 3.2 已知 workbench 小补丁（冲突高风险）

| 补丁 | 证据 | 升级时 |
|------|------|--------|
| 整窗启动默认浅色，消除白/黑/白闪烁 | commit `ae139d1`：ThemeService 冷启动不再硬编码 DARK；默认主题 Light 2026 | 必须 rebase 重做；上游 1.13x 仍可能默认暗色 |
| Milkdown Serializer / WorkingCopy / IME gate | 多个 RD-1/RD-2 commit | 自研目录内，冲突主要在 host API 签名 |

### 3.3 预计 API / 构建断点（1.124 → 1.136）

下表是从两份 `package.json` 对出的硬差异，过渡时要逐项验证 VSWord contrib 编译：

- TypeScript：`typescript@next` / `tsgo` → `@typescript/typescript6` + `@typescript/native`
- `valid-layers-check` 改走 `layersTypeCheck.ts`
- 新依赖：`@vscode/fs-copyfile`、`@vscode/os-proxy-resolver`、`zod` 3 → 4、eslint 9 → 10
- Electron **42.2.0 → 42.10.0**（native module 需重编）
- Copilot 内置扩展体积显著增大；VSWord 继续 `disabledBuiltInExtensions`

## 4. 执行策略（拍板）

**目标 tag：`1.136.2`（稳定 + 安全热修），不跟 `main`。**

必须在本机仓库（`D:\GIT\VSWord`）用 git 做，**禁止**用文件 API 整树覆盖 `code-oss/`：

```text
1. git remote add vscode https://github.com/microsoft/vscode.git   # 若尚未加
2. git fetch vscode tag 1.136.2 --depth=1                         # 或全历史以便三方合并
3. 在临时分支（不直接推 dev）：
     git checkout -b chore/rd14-code-oss-1.136.2 dev
4. 将 vscode/1.136.2 合并进 code-oss/ 子树
     推荐：把 1.136.2 解压到临时目录，
     rsync -a --delete --exclude contrib/vsword \
       临时/ vscode-1.136.2/  code-oss/
     然后把 VSWord 自研目录与 product.json 自研字段挖回
5. 重做 §3.2 浅色启动补丁 + workbench.common.main.ts import
6. npm install && 重编 native
7. Gate：
     - code-oss tsc（上游警告可忽略，VSWord contrib 0 error）
     - mocha src/vs/workbench/contrib/vsword/test/**/*.test.ts
     - 手启：.md Milkdown · Canvas · Mindmap · HTML Preview · Open VSX 搜索
8. 通过后再 merge 到 dev，更新 0001 / handoff 基线号
```

**禁止：**

- 在 1.124.2 主机上只把 `js-profile-table` 跳到 1.0.11
- 把上游 `product.json` 整文贴进 VSWord（会回退 Open VSX、重启 Copilot）
- 跟 `main` / 1.138.0-dev
- 用 GitHub `push_files` 覆盖整棵 `code-oss/`

## 5. Gate-R14

| # | 条件 |
|---|------|
| R14.1 | `code-oss/package.json` `version` = `1.136.2` |
| R14.2 | product.json 仍是 Open VSX + `disabledBuiltInExtensions: [GitHub.copilot-chat]` |
| R14.3 | `workbench.common.main.ts` 仍 import vsword contribution |
| R14.4 | VSWord mocha 全绿；冷启默认浅色（Light 2026）无黑白闪 |
| R14.5 | Milkdown / Canvas / HTML Preview webview 资源加载正常（验证 localResourceRoots 补丁已进树） |

## 6. 本轮未做什么

当前环境只能通过 GitHub Contents API 写文件，没有可推送的本机 git + native 构建链。  
整树 1.124.2 → 1.136.2 会改数万文件，强行推送会擦掉 VSWord 自研补丁。  
因此 **RD-14 本轮只落盘决策与操作步骤**；源码 rebase 要在 `D:\GIT\VSWord` 执行。

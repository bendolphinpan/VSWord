# VSWord 项目交接文档

> **生成时间**：2026-07-11
> **分支**：`dev`（唯一开发分支）
> **最新 commit**：`1889e82e`（T-3.13.7 Round-2 QA 回归报告）
> **基线**：Code OSS `1.124.2`

---

## 1. 项目是什么

**VSWord** = Code OSS 1.124.2 基底 + Markdown WYSIWYG 编辑器（Milkdown 7.21.x）

**核心用户场景**：本地写作 / 知识管理 / Markdown 实时渲染编辑（对标 Typora 级别体验）

**不做的事**：实时协作、云账号、默认 Copilot

**核心原则**：本地优先 · 数据透明 · 数据无损 · 扩展生态保留 · Git 即历史 · 好看放一放（视觉延后到 UI 阶段）

---

## 2. 目录结构速查

```
D:\GIT\VSWord\                          ← 项目根（workspace）
├── docs\plans\                         ← 所有 PRD 文档（权威）
│   ├── 000-vsword-master-plan.md       ← 产品定义 + 全景目标
│   ├── 003-master-development-plan.md  ← 开发主线 + 进度 + T号对照表
│   ├── 003b-mermaid.md                 ← Mermaid 图表模块 PRD
│   ├── 003b-flowchart-jsseq.md         ← Flowchart.js + js-sequence-diagrams PRD
│   ├── 003c-syntax-completion.md       ← 模块 c 语法补全 PRD
│   ├── 003-phase3-fix-p0.md            ← Round-1 P0 修 PRD（已归档）
│   ├── 003-phase3-mode-orthogonality.md← 模式正交性调研（v2·已拍板）
│   └── 003-phase3-fix-p0-round2.md     ← Round-2 P0 修 PRD（T-3.13.x）
│
├── code-oss\                           ← 源码根
│   ├── src\vs\workbench\contrib\vsword\
│   │   ├── browser\milkdownEditor\     ← Milkdown 编辑器核心
│   │   │   ├── milkdownEditorContribution.ts  ← 入口 Contribution
│   │   │   ├── milkdownWorkingCopy.ts  ← WorkingCopy（脏标记/auto-save/IME gate）
│   │   │   ├── milkdownEditorHtml.ts   ← webview HTML + 所有 CSS（toolbar/hidden/focus）
│   │   │   ├── milkdownEditorProtocol.ts ← host↔webview 消息协议
│   │   │   ├── build-milkdown-editor.cjs ← esbuild 打包脚本
│   │   │   ├── webview\                ← webview 源码（.template.js）
│   │   │   │   ├── entry.template.js         ← webview 入口
│   │   │   │   ├── mode-switch.template.js   ← 模式切换 UI（realtime/reading/source + substyle）
│   │   │   │   ├── mode-controller.template.js ← 模式状态机（applyDom）
│   │   │   │   ├── focus-mode.template.js    ← Focus 单行高亮 + Typewriter 居中
│   │   │   │   ├── view-mode-editable.mjs    ← view mode 编辑态控制
│   │   │   │   ├── find-widget.template.js   ← Ctrl+F 查找替换栏
│   │   │   │   ├── table-chrome.template.js  ← 表格 hover-gated handle
│   │   │   │   ├── sequence-view.mjs         ← js-sequence-diagrams 视图
│   │   │   │   ├── flowchart-view.mjs        ← flowchart.js 视图
│   │   │   │   └── mermaid-view.mjs          ← mermaid 图表视图
│   │   │   └── vendor\                 ← esbuild 打包产物（.gitignore）
│   │   │
│   │   └── test\
│   │       └── reports\                ← 所有测试报告（.md + 截图）
│   │
│   └── out\                            ← 构建产物
│
├── .tmp\milkdown-prod-builder\         ← esbuild builder（node_modules 需 npm install）
├── .tmp\milkdown-spike-builder\        ← spike builder
└── .hermes-scratch\                    ← agent 临时工作文件（可清理）
```

---

## 3. 当前进度总览

### Phase 3 已完成模块

| 模块 | commit 范围 | 状态 | 说明 |
|------|------------|------|------|
| T-3.0 ~ T-3.4 | `c361b402` → `9f76d3e0` | ✅ done | Milkdown MVP + 即时渲染 + 排版 + KaTeX + Prism + Outline |
| T-3.5 图片全套 | `8bd1650d` → `3f43dc6a` | ✅ done | 粘贴/拖拽/resize/caption/alignment |
| T-3.6 表格 chrome | `52426d5f` | ✅ done | hover-gated handle NodeView 重写 |
| T-3.7b 图表（模块 b 剩余） | 见下方 | ✅ done | Mermaid / Flowchart.js / js-sequence-diagrams |
| T-3.8b 模块 c 语法 | `a1a963d2` → `3bd20467` | ✅ done | emoji / footnote / frontmatter / sub·sup / code-meta / setext |
| T-3.9.2 IME 状态机 | `93aa1f85` | ✅ done | composition state 纯函数 + 6+3 单测 |
| T-3.11 wiki-link | `5cad963d` → `f664d47e` | ✅ done | 语法 + resolver + autocomplete + backlinks footer |
| T-3.10 模式正交性 | `79c07850` | ✅ done | v2 两级菜单 radio 互斥（已拍板） |
| T-3.12.1 IME+auto-save 修 | `93aa1f85` → `2844ebb4` | ✅ done | host gate + webview 事件桥 |
| T-3.12.2 表格 chrome UX | `52426d5f` → `dc234dd4` | ✅ done | hover-gated + CSS |
| T-3.12.3 模式 substyle UI | `da60f2d8` → `3b6cdf3f` | ✅ done | radiogroup + reading DOM 隐藏 |
| **T-3.13.x Round-2 修** | `400227ed` → `3cb43364` | ✅ done | 6 项 P0/P1 修复 |
| T-3.13.7 QA 回归 | `1889e82e` | ✅ done | 5 pass + 1 partial（R1 待手测） |

### 所有本地 commits（未 push 的 0 个）

**全部已 push origin/dev**。`git log origin/dev..dev` 为空。

---

## 4. Round-2 六项修复详情（最新工作）

这是最近完成的工作，新团队需要理解：

### T-3.13.1 · IME 打断根因 fix（P0）
- **根因**：`EditorAutoSave` 绕过 `MilkdownWorkingCopy.scheduleAutoSave`，直接调 `workingCopy.save()`，不走 IME composition gate
- **修**：在 `save()` 主入口首行前置 `if (this._webviewComposing) return;`
- **commit**：`41bf2c47`

### T-3.13.2 · 阅读模式二级菜单恢复（P1）
- **根因**：T-3.12.3.b 把阅读模式下 substyle-group 整块 DOM 移除
- **修**：回退 detach 分支，reading 下 substyle radio 常驻可切（normal/focus/typewriter）
- **commit**：`b2b242c8`

### T-3.13.3 · Focus 单行独占语义修（P1）
- **根因**：hover 行与 cursor 行高亮叠加不清除
- **修**：plugin state 升级为 `{ hoverPos, decos }`，cursor + hover 叠加去重，上限 ≤ 2；mouseleave 清 hover
- **commit**：`3cb43364`

### T-3.13.4 · Typewriter AC 单测（P2）
- **行为不改**，只补 23 条单测钉死 AC-4.1 ~ AC-4.4
- **commit**：`c84cf588`

### T-3.13.5 · 顶部工具栏 sticky（P1）
- `.vsword-md-toolbar` 加 `position: sticky; top: 0; z-index: 100`
- **commit**：`22e43559`

### T-3.13.6 · 底部查找栏受控开关（P0）
- **根因**：CSS 从未定义 `.vsword-hidden` class，find-widget 的显隐切换完全失效
- **修**：`.vsword-hidden { display: none !important; }` 一条 CSS
- **commit**：`400227ed`

---

## 5. QA 回归状态

### 已验证（151/151 单测全绿）

| 类别 | 用例数 | 状态 |
|------|-------|------|
| typewriter AC | 23/23 | ✅ |
| IME composition state | 9/9 | ✅ |
| mode-switch component | 8/8 | ✅ |
| view-mode-editable | 7/7 | ✅ |
| view-modes | 37/37 | ✅ |
| view-mode-actions | 9/9 | ✅ |
| find-widget | 20/20 | ✅ |
| find-service | 7/7 | ✅ |
| find-plugin | 31/31 | ✅ |
| **合计** | **151/151** | **✅** |

### 待用户手测（1 项）

- **R1 · IME 真实 rime 交互**：自动化全绿，但需要真实 IME 环境验证。用户说会手测。

---

## 6. 未完成 / 待决策事项

### 6.1 用户拍板问题（来自 Round-2 PRD §7）

| 问题 | 选项 | 当前值 | 说明 |
|------|------|--------|------|
| Q1 · toolbar 毛玻璃 | a=纯色 / b=毛玻璃 / c=视觉延后 | **c（已执行）** | 当前是纯色 sticky，毛玻璃留 UI 阶段 |
| Q2 · Focus 高亮判定 | a=cursor / b=hover / c=叠加 / d=优先hover | **c（已执行）** | cursor + hover 叠加，上限 ≤ 2 |
| Q3 · 阅读模式下 typewriter | a=保留 / b=隐藏 | **a（已执行）** | 阅读下三个 radio 全渲染 |

### 6.2 模块 b 剩余 · Flowchart.js + js-sequence-diagrams

PRD 在 `docs/plans/003b-flowchart-jsseq.md`，spike 已有结果：
- `code-oss/src/vs/workbench/contrib/vsword/browser/spikes/milkdown/` 里有 spike 产物
- Mermaid 已集成（懒加载），Flowchart.js 和 js-sequence-diagrams 已通过 esbuild 打包进 vendor

### 6.3 用户历史提及但尚未处理的需求

1. **5 个预览格式 3+2 关系**：已在 v2 正交性调研中拍板（两级菜单 radio），代码已落地
2. **用户 `0710反馈.md`**：R1~R6 逐条对应 T-3.13.1~6 已修 + T-3.13.7 已回归

---

## 7. 技术要点备忘

### 7.1 构建流程

```bash
# 重新打包 webview vendor bundle
cd D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\milkdownEditor
node build-milkdown-editor.cjs
# 产物在 vendor/（被 .gitignore 忽略，不入库）

# TypeScript 编译检查
cd D:\GIT\VSWord\code-oss
NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json

# 跑所有 vsword 单测（9 组 151 条）
npx mocha --config test/unit/mocharc.json "src/vs/workbench/contrib/vsword/test/**/*.test.ts"
```

### 7.2 esbuild 关键配置

`build-milkdown-editor.cjs` 里：
- `define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' }` —— 后者修复了 js-sequence-diagrams UMD 包的 `global is not defined` 问题
- `alias: { fs: empty-shim, path: empty-shim }` —— sequence-diagrams 的 CJS 依赖
- Code splitting：mermaid / flowchart+raphael / sequence 各自 lazy chunk
- Roundtrip verifier 自动校验

### 7.3 host ↔ webview 协议

`milkdownEditorProtocol.ts` 定义消息类型。IME 相关：
- webview → host：`{ type: 'imeCompositionChanged', composing: boolean }`
- host 侧 `MilkdownWorkingCopy._webviewComposing` 门控 auto-save

### 7.4 模式系统架构

```
一级 radio（互斥）：realtime / reading / source
  └─ 二级 radio（互斥）：normal / focus / typewriter
     （仅在 realtime + source 下渲染；reading 下也渲染但需看后续 UI 调整）
```

- `mode-controller.template.js`：状态机 + `applyDom()` 应用到 shell `data-mode` / `data-substyle`
- `mode-switch.template.js`：UI 按钮 + `applyModeVisibility()` 控制子菜单 DOM 可见性
- `focus-mode.template.js`：ProseMirror plugin · decoration 逻辑（cursor+hover 叠加）
- CSS 在 `milkdownEditorHtml.ts` 里内联

### 7.5 Watcher / Cron

- `kanban-watch` cron（`351e2696c27d`）：每 5 分钟扫描 kanban，有事件则推微信通知
- autopilot cron 可按需在用户睡觉前建（`cronjob action=create`）

---

## 8. Git 规范

- **分支**：只用 `dev`（单分支开发）
- **commit message 格式**：`feat|fix|test|docs|style(scope): T-3.x.y · 一句话描述`
- **push 策略**：每完成一个功能点就 `git push origin dev`，不攒
- **本地未 push**：0（所有 commits 已 push）

---

## 9. 关键文件速查表

| 用途 | 文件路径 |
|------|---------|
| 产品定义 | `docs/plans/000-vsword-master-plan.md` |
| 开发主线 + T 号表 | `docs/plans/003-master-development-plan.md` |
| Round-1 fix PRD | `docs/plans/003-phase3-fix-p0.md`（已归档） |
| Round-2 fix PRD | `docs/plans/003-phase3-fix-p0-round2.md`（已落地） |
| 模式正交性 v2 | `docs/plans/003-phase3-mode-orthogonality.md` |
| 用户反馈原件 | `code-oss/test/reports/0710反馈.md` |
| QA 回归报告 | `code-oss/test/reports/round2-regression-20260710T110149.md` |
| esbuild 打包 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/build-milkdown-editor.cjs` |
| IME 协议 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/milkdownEditorProtocol.ts` |
| WorkingCopy | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/milkdownWorkingCopy.ts` |
| webview HTML+CSS | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/milkdownEditorHtml.ts` |
| webview 入口 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/entry.template.js` |
| 模式切换 UI | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mode-switch.template.js` |
| 模式状态机 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mode-controller.template.js` |
| Focus/Typewriter | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/focus-mode.template.js` |
| 查找替换栏 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/find-widget.template.js` |
| 表格 chrome | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/table-chrome.template.js` |
| flowchart 视图 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/flowchart-view.mjs` |
| sequence 视图 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/sequence-view.mjs` |
| mermaid 视图 | `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mermaid-view.mjs` |

---

## 10. 给新团队的建议

1. **先读 PRD 再看代码**：`docs/plans/` 里的文档是需求源头，代码是实现。PRD 里有现状分析、假设、AC、拆子任务，信息密度高
2. **T 号可能漂移**：`003-master-development-plan.md` 里的 T-号对照表记录了 plan T 号 vs commit T 号的对应关系，注意区分
3. **构建产物不入库**：`vendor/` 被 .gitignore，每次 build 重新生成。改了源码要重新跑 `node build-milkdown-editor.cjs`
4. **视觉延后**：Phase 3 政策是"好看放一放"，功能完善无 bug 优先。毛玻璃/动效/精细样式留 UI 阶段统一改
5. **微信 coordinator**：原来的项目管理通过 Hermes Agent + 微信 gateway 自动推进，cron 每 5 分钟扫 kanban。新团队可以按需调整
6. **IME 是高风险区**：Rime 行为与 Chromium 内置 IME 不同，需要真实环境手测。自动化能覆盖状态机逻辑但覆盖不了真实输入法交互

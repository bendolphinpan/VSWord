# VSWord 项目交接文档

> **生成时间**：2026-07-11 · **修订**：2026-07-13（进度/债务指针与 003/004 对齐）
> **分支**：`dev`（唯一开发分支）
> **最新功能 commit**：`1889e82e`（T-3.13.7 Round-2 QA 回归报告）
> **基线**：Code OSS `1.124.2`
> **下一步执行清单**：`docs/plans/004-remediation-and-debt-plan.md`（**RD- 号**，不是 Phase 4）

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
├── docs\plans\                         ← 计划 / PRD（分工见 003 §0.1）
│   ├── 000-vsword-master-plan.md       ← 产品定义 + 全景目标
│   ├── 003-master-development-plan.md  ← 全景进度权威（§1b 真相表）
│   ├── 004-remediation-and-debt-plan.md← **债务/修复执行清单（RD- 号）**
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

### 全景（与 003 §2 一致）

| 桶 | 状态 |
|----|------|
| Phase 0–2 / 4 Canvas / 5 Mindmap(~90%) | ✅ |
| Phase 3 Milkdown 主线 + Round-2 | ✅ 主线；残余见 RD |
| **Debt 桶（RD-）** | 🔴 **当前推荐主线** → `004` |
| Phase 6 多维表 | ⚪ 后期 |
| Phase 7 产品化 | ⚪ 未启动（最小可发布 = **RD-10**） |

### Phase 3 已完成模块（plan 语义摘要）

| 模块 | 状态 | 说明 |
|------|------|------|
| T-3.0~3.3 / 3.5 图片 | ✅ | MVP + WorkingCopy + 排版 + 图片全套 |
| T-3.5b 图表 | ✅ | Mermaid + Flowchart.js + js-sequence · Gate F 81 · **非「剩余」** |
| T-3.5c 语法补齐 | ✅ | emoji / footnote / frontmatter / sub·sup 等（覆盖原 T-3.4 大部分） |
| T-3.6 双链 | ✅ | 语法/补全/hover；backlinks 为 **footer**（面板 → RD-6） |
| T-3.7 块/表格 · 3.7b 视图 · 3.7c 导航 · 3.7d 主题 | ✅ | 含 Round-1/2 UX 修 |
| T-3.8 Round-trip · 3.8b 导出 | ✅ | Gate E；保真 **L2**（`0004-rd11`）· RD-11 ✅ |
| T-3.9 性能/IME 收口 | ⚠️ | 报告齐；open 🔴→RD-1；IME 手测→RD-2 |
| T-3.12 / T-3.13 | ✅ 代码 | Round-2 QA：5 pass + Rime 人肉 partial → RD-2 |

> T 号曾在 commit 中漂移（表格/代码块/双链等）；考古见 `003` 附录 A，**现行只看 003 §1b**。

### Git

以仓库当前 `git status` / `git log` 为准。文档修订可能产生尚未 commit 的 docs 变更。

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

> **权威清单**：`docs/plans/004-remediation-and-debt-plan.md`。以下为速查。

### 6.1 Round-2 已拍板（归档）

| 问题 | 当前值 |
|------|--------|
| Q1 · toolbar 毛玻璃 | **c 视觉延后**（纯色 sticky） |
| Q2 · Focus 高亮 | **c 叠加**（cursor+hover ≤2） |
| Q3 · 阅读 × typewriter | **a 保留** 三级 radio |

### 6.2 图表三件套

**已完成**（Gate F），不是「模块 b 剩余」。vendor lazy 再优化 → **RD-8**。

### 6.3 债务速查（RD）

| ID | 内容 | 优先级 |
|----|------|--------|
| RD-0 | 文档真相（本轮） | P0 |
| RD-2 | IME 真实手测（含 Rime） | P0 发布硬门槛 |
| RD-1 | 大文档 open pipeline | P0 发布硬门槛 |
| RD-5 | Pretext | P1 · **拍板 A 做**（spike 待排） |
| RD-6 | Backlinks 面板 | **关闭** · 保持 footer |
| RD-7 | 字体 Settings 三元组 | P1 |
| RD-10 | Phase 7 最小可发布 | P0 · **B Portable** |
| RD-11 | 保真等级 L2 声明 | ✅ `docs/decisions/0004-rd11-roundtrip-fidelity.md` |
| RD-12 | 扩展冒烟 | P1 |
| RD-3/4/8/9 | RSS / 模式对账 / lazy / Mindmap 剩余 | P2 |

### 6.4 明确延后

- Phase 6 多维表；整体 UI 视觉大重构；图床；实时协作

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
| 全景进度 + 真相表 | `docs/plans/003-master-development-plan.md` |
| **债务 / 下一步** | **`docs/plans/004-remediation-and-debt-plan.md`** |
| Phase 3 归档 | `docs/decisions/phase-3-acceptance.md` |
| **UI 改造边界 L0–L3** | **`docs/decisions/0002-ui-modification-boundary.md`** |
| Figma VSWord | `https://www.figma.com/design/6YryVesDzsyNOuYtojsehd/VSWord` |
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
2. **T 号可能漂移**：只信 `003` **§1b 真相表**；附录 A 仅考古。新工作用 **RD-x.y**（见 `004`），勿再发明冲突 T 号
3. **Phase 4 = Canvas 已完成**，不是 backlog。债务在 **RD 桶**
4. **构建产物不入库**：`vendor/` 被 .gitignore，改源码后跑 `node build-milkdown-editor.cjs`
5. **视觉延后**：功能优先；毛玻璃/动效留 UI 阶段
6. **IME 是高风险区**：Rime 等人肉手测是 **RD-2** 发布硬门槛，单测不能结案
7. **微信 coordinator**：Hermes + gateway / kanban 可按需调整

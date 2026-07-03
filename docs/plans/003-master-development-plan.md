# VSWord 主开发计划（全景 + 进度）

> **文档定位**：VSWord 的**唯一权威开发路线图**，从头梳理全部阶段、任务、进度与技术决策。
> 取代 `002-development-task-breakdown.md` 的"当前状态"章节（该文档保留作历史任务细节归档）。
> **作者**：Hermes 主代理
> **创建**：2026-06-30
> **基线**：Code OSS `1.124.2`（`D:\GIT\VSWord\code-oss`，分支 `dev`）

---

## 0. 关键路径速览

| 路径类型 | 绝对路径 |
|---------|---------|
| **工作区根** (workspace) | `D:\GIT\VSWord` |
| **源码根** (source) | `D:\GIT\VSWord\code-oss` |
| **VSWord 模块** | `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\` |
| **构建产物** (build) | `D:\GIT\VSWord\code-oss\out\` |
| **日志根** (log) | `D:\GIT\VSWord\docs\phase0\logs\` |
| **需求文档** | `D:\GIT\VSWord\docs\requirements\` |
| **计划文档** | `D:\GIT\VSWord\docs\plans\` |

---

## 1. 产品定位（不变）

VSWord = Code OSS 1.124.2 基线
+ VS Code 扩展生态
+ **Typora 级 / 超越 Typora 的 Markdown WYSIWYG 编辑**（本次重建核心）
+ XMind 参考的 `.mm` 思维导图
+ Miro 参考的"文件夹即 Canvas"组织视图
+ Code OSS 内置 Git 作为版本管理
− 默认 Copilot / 程序员默认噪音 / 实时协作 / 云账号

**核心原则**：本地优先 · 数据透明 · 数据无损 · 扩展生态保留 · 最小侵入 · Git 即历史 · 成熟开源库优先不造轮子。

---

## T-号对照表（Phase 3 · commit ↔ plan）

> **背景**：Phase 3 中期 commit 里的 T-3.6 ~ T-3.11 与本 plan 里同名 T-号语义已漂移（编号被复用于不同含义）。此表以 **commit 实际含义** 为主，反查 **plan 中对应的功能条目**，为后续继续拆解 / 完成度对账做统一口径。生成时间：2026-07-04。
> 依据：`git log --oneline -30`（最新提交 2f93e63c）。

| plan T-号 | plan 含义（一句话） | 实际 commit T-号 | commit hash | commit 含义（一句话） | 一致 | 备注 |
|-----------|--------------------|------------------|-------------|----------------------|------|------|
| T-3.0 | 清理旧 Block Editor（前置） | T-3.0 | c361b402 / 4ccbb95a | Phase 3 rebuild — remove BlockNote block editor, add Milkdown WYSIWYG MVP + gitignore 收紧 | ✅ | 与 T-3.2 合并落地 |
| T-3.1 | Milkdown spike | T-3.1 | （历史，此 30 条外） | Milkdown spike | ✅ | spike 已归档 |
| T-3.2 | WYSIWYG MVP（文件类型关联） | T-3.2 | c361b402 | add Milkdown WYSIWYG MVP | ✅ | 与 T-3.0 同 commit |
| T-3.2b | EditorPane + WorkingCopy 升级 | T-3.2b | 0f6bc00a | native dirty/save/revert via WorkingCopy | ✅ | |
| T-3.3.1~3.3.7 | Typora 级即时渲染 + 排版基础全套（主题 / 光标进出 / slash / KaTeX / Prism / remark / 智能输入） | T-3.3 全套 | 9f76d3e0 | Phase 3 完成 T-3.3 全套 + T-3.4 Outline 面板 | ✅ | Outline 面板一并落地（本属 T-3.7c.2） |
| T-3.4 | 自定义排版 + Typora 缺失语法（mark / emoji / footnote / 字体 / pretext / frontmatter） | T-3.4（Outline 部分） | 9f76d3e0 | Outline 面板 | ⚠️ | 完整 T-3.4 六子项未逐项交付；commit 只覆盖 Outline 面板（属 plan T-3.7c.2） |
| T-3.5.1 | 粘贴/拖拽 → assets/ + 相对路径 | T-3.5.1 | 8bd1650d | paste/drop image → assets/ + relative path | ✅ | |
| T-3.5.2 | 图片拖拽调整大小 | T-3.5.2 | f3b0597a | image resize NodeView with locked aspect ratio | ✅ | |
| T-3.5.3 | 图注（alt / caption） | T-3.5.3 | 2304e746 | image caption (alt-as-caption) with popover editor | ✅ | |
| T-3.5.4 | 图片对齐（左/中/右 via HTML align 保真） | T-3.5.4 | 3f43dc6a | image alignment via `<p align>` wrapper | ✅ | |
| T-3.5b.1~4 | 图表全套（Mermaid / Flowchart / js-seq / 懒加载） | — | — | 未启动 | ⛔ | |
| T-3.6.1 | `[[wiki link]]` 语法 | **T-3.11.1** | 5cad963d | wiki-links (syntax + resolver + click-to-open) | ⚠️ 编号漂移 | commit 用了 T-3.11.1，实为 plan T-3.6.1 |
| T-3.6.2 | 自动补全 UI | **T-3.11.2** | 635b9a1b | wiki-link autocomplete popover | ⚠️ 编号漂移 | 实为 plan T-3.6.2 |
| T-3.6.3 | 全局反向链接索引服务 | **T-3.11.4**（含） | f664d47e | wiki-link backlinks footer | ⚠️ 编号漂移 | 索引服务与面板一并交付 |
| T-3.6.4 | 反向链接面板 | **T-3.11.4** | f664d47e | wiki-link backlinks footer | ⚠️ 编号漂移 | 目前为 footer 形态，非独立面板 |
| T-3.6.5 | 链接跳转 / 悬停预览 | **T-3.11.3** | a78cb8f9 | wiki-link hover preview | ⚠️ 编号漂移 | 跳转在 T-3.11.1 已覆盖 |
| T-3.7.1 | 块拖拽手柄 | **T-3.8**（commit） | 00daab60 | block hover handle (drag + transform menu) | ⚠️ 编号漂移 | commit T-3.8 语义 ≠ plan T-3.8（Round-trip） |
| T-3.7.2 | 块转换菜单（H1↔H2↔段落↔引用等） | **T-3.8**（commit） | 00daab60 | transform menu | ⚠️ 编号漂移 | 与拖拽手柄同 commit 落地 |
| T-3.7.3 | 表格可视化操作（增删行列 / 对齐） | **T-3.6**（commit） | fe241cb1 | table chrome (col/row/align/resize) | ⚠️ 编号漂移 | commit T-3.6 语义 ≠ plan T-3.6（双链） |
| T-3.7b.1 | 源码模式 | — | — | 未启动 | ⛔ | |
| T-3.7b.2 | 预览/阅读模式 | — | — | 未启动 | ⛔ | |
| T-3.7b.3 | 专注模式 | **T-3.10**（commit） | ce03f41f | decoupled focus + typewriter toggles | ⚠️ 编号漂移 | commit T-3.10 语义 ≠ plan T-3.9（性能收口） |
| T-3.7b.4 | 打字机模式 | **T-3.10**（commit） | ce03f41f | typewriter toggle | ⚠️ 编号漂移 | 与专注模式同 commit |
| T-3.7c.1 | TOC 自动生成（`[TOC]`） | — | — | 未启动 | ⛔ | |
| T-3.7c.2 | 大纲面板（Outline View） | T-3.4（commit 附带） | 9f76d3e0 | Outline 面板 | ⚠️ 编号漂移 | commit T-3.4 里同时含 T-3.3 全套 + 本项 |
| T-3.7c.3 | 查找替换 | — | — | 未启动 | ⛔ | |
| T-3.7d.1~3 | 主题兼容层（内置 4 主题 / Typora .css / 切换命令） | — | — | 未启动 | ⛔ | 3.3.1 已做内置主题系统，Typora .css 兼容与切换命令未落 |
| T-3.8.1~4 | Round-trip 保真层（source-mapping） | — | — | 未启动 | ⛔ | 高优先级欠项 |
| T-3.8b.1~3 | 导入导出（HTML / PDF / Pandoc） | — | — | 未启动 | ⛔ | |
| T-3.3.4（数学公式） | KaTeX 行内 + 块（原属 T-3.3.4） | **T-3.9**（commit） | dec56efc | math NodeView (click-to-edit + KaTeX safety) | ⚠️ 编号漂移 | commit T-3.9 语义 ≠ plan T-3.9（性能收口） |
| T-3.3.5（Prism） | Prism 代码高亮（原属 T-3.3.5） | **T-3.7**（commit） | 51d25a3b | code block chrome (prism + lang picker + copy + keymap) | ⚠️ 编号漂移 | commit T-3.7 语义 ≠ plan T-3.7（Notion 块增强） |
| T-3.9.1~4 | 性能与 IME 全矩阵收口 | — | — | 未启动 | ⛔ | Gate D/E/G 未启 |
| — | tsc baseline 清零（非计划任务） | 无 T-号 | 2f93e63c | chore: fix pre-existing tsc errors in Phase 3 baseline | — | 工程债偿还，非 plan 追踪项 |

### 漂移根因

commit 提交时使用的 T-号（T-3.6 / 3.7 / 3.8 / 3.9 / 3.10 / 3.11.x）是 **交付顺序编号**，与 plan 中的 **功能领域编号**（T-3.6 双链 / T-3.7 Notion 块 / T-3.8 Round-trip / T-3.9 性能 / …）语义完全脱钩。以下 6 组编号已被 commit 复用：

- commit **T-3.6**（表格）≠ plan T-3.6（双链） → 实为 plan T-3.7.3
- commit **T-3.7**（代码块）≠ plan T-3.7（Notion 块） → 实为 plan T-3.3.5
- commit **T-3.8**（块 hover）≠ plan T-3.8（Round-trip） → 实为 plan T-3.7.1 + 3.7.2
- commit **T-3.9**（数学）≠ plan T-3.9（性能收口） → 实为 plan T-3.3.4
- commit **T-3.10**（focus / typewriter）→ 实为 plan T-3.7b.3 + 3.7b.4
- commit **T-3.11.x**（双链系列）→ 实为 plan T-3.6.x

**后续策略**：新 commit 一律以 plan 原始 T-号为准（三段式 `T-3.<主项>.<子项>`），本表钉住漂移期映射，避免再次错位。

---

## 2. 全景进度矩阵

| Phase | 模块 | 状态 | 进度 |
|-------|------|------|------|
| **Phase 0** | 基线（checkout / Copilot 移除 / Open VSX） | ✅ 完成 | 100% |
| **Phase 1** | Writer Workbench Shell（Home / writer-mode / 布局） | ✅ 完成 | 100% |
| **Phase 2** | Markdown Core（frontmatter / 字数 / round-trip） | ✅ 完成 | 100% |
| **Phase 3（旧）** | Block Editor（BlockNote） | ❌ **废弃** | 卡死不可用，本次移除 |
| **Phase 3（新）** | **Markdown WYSIWYG 编辑器（Milkdown 重建）** | 🟡 进行中 | T-3.0/3.1/3.2/3.2b ✅；T-3.3~T-3.9 待启动 |
| **Phase 4** | Canvas（React Flow，文件夹视图） | ✅ 完成 | 100% |
| **Phase 5** | Mindmap（`.mm` XMind 对齐，mind-elixir） | ✅ 深度完成 | ~90%（T-5.1~5.9） |
| **Phase 6** | 多维表（Notion-like 数据库） | ⚪ 后期规划 | 标记为后期功能 |
| **Phase 7** | 产品化收口（打包 / 品牌 / 分发） | ⚪ 未启动 | 0% |

---

## 3. 已完成阶段详情（存档）

### ✅ Phase 0 — 基线
- Code OSS 1.124.2 checkout（tag `1.124.2`）
- Copilot 默认入口移除（`defaultChatAgent` 去除，5 处级联崩溃点已修复守卫）
- Open VSX marketplace 接入（避免指向 Microsoft Marketplace）
- Windows native 构建链路打通

### ✅ Phase 1 — Writer Workbench Shell
- VSWord contrib 模块骨架 + workbench contribution 注册
- Writer Home 视图（`vswordHomeView.ts`）
- writer-mode 默认配置（`vswordWriterModeDefaults.ts`）：隐藏 Debug/Terminal 默认噪音，保留可调出
- Activity Bar 顺序调整

### ✅ Phase 2 — Markdown Core
- `VswordDocumentService`：YAML frontmatter 解析、未知字段保留
- 中英文混排字数统计（`vswordWordCount.ts`）
- round-trip fixture 测试套件（37 项通过）
- markdown preview / source / metadata 命令

### ✅ Phase 4 — Canvas（文件夹视图）
基于 **React Flow**（MIT），"文件夹即 Canvas" Miro 风格组织视图。
- T-4.1 渲染库 spike（tldraw vs React Flow → 选定 React Flow）
- T-4.2 Canvas service + `.vsword/canvas/` 存储层
- T-4.3 Canvas MVP
- T-4.4 文件生命周期闭环（暂存盘 / 恢复 / 真实删除 / 拖拽粘贴）
- T-4.5 文件节点体验（图片预览 / 摘要 / fallback）
- T-4.6 操作反馈与异常状态
- T-4.7 产品化收口与阶段验收

### ✅ Phase 5 — Mindmap（`.mm` XMind 对齐）
基于 **mind-elixir**（渲染）+ 自研 XML preservation 层（写回）。
- T-5.1 `.mm` parser/writer + preservation 基础
- T-5.2 只读 Mindmap MVP（XMind 风格 SVG）
- T-5.3 节点文本编辑写回
- T-5.4 节点结构编辑（Tab/Enter/Delete）
- T-5.5 折叠态持久化（FOLDED 写回）
- T-5.6 节点图标（BUILTIN icons）
- T-5.7 节点颜色 & 字体样式
- T-5.8 边样式（COLOR/WIDTH/STYLE）
- T-5.9 arrowlink 跨子树关联线
- 53/53 单测通过；三视图切换（XML / mindmap / MD bullet）

**Phase 5 剩余（P1/P2）**：Markdown ↔ `.mm` 互转完善、richcontent 富文本可视化编辑、10k 节点性能矩阵、IME 全矩阵专项。

---

## 4. 🔴 Phase 3（新）— Markdown WYSIWYG 编辑器（本次重建）

### 4.1 背景与决策

**旧实现废弃原因**（BlockNote 方案）：
1. 两套并行实现（webview panel + EditorPane）互相冲突，file I/O 全是 TODO
2. HTML 模板双重加载 BlockNote bundle，React `createRoot` 与手动 `mount()` 争抢 `#app` → 卡死
3. BlockNote 用 `blocksToMarkdownLossy()`，Markdown 转换有损，违反数据无损原则
4. BlockNote 是 Notion block 范式，不是 Typora 的 inline WYSIWYG

**新技术选型**：**Milkdown**（v7.21.2，MIT）
- 基于 ProseMirror + remark/unified，原生 inline WYSIWYG 范式，与 Typora 同源
- 官方插件生态齐全：slash / tooltip / block / clipboard / history / prism / math
- CJK IME 问题最少（28 open issues，无典型 CJK bug）
- 月度活跃发布，11.6k stars
- 底层暴露完整 ProseMirror 实例，保留无限自定义扩展能力（不局限于 Milkdown API）

**版权确认**：Milkdown / ProseMirror / remark 全部 MIT，无 copyleft 风险，可商用。

### 4.2 目标：完全复刻并超越 Typora

**复刻 Typora 核心体验**：
- Inline WYSIWYG：Markdown 标记实时渲染，编辑发生在渲染后内容上
- 极简干净：无工具栏噪音，聚焦内容与排版
- 即时切换：光标进入代码块/表格显示源码，离开立即渲染
- 精调排版：媲美 Typora 的 CSS 排版质量

**超越 Typora 的差异化能力**：
- 图片位置 / 大小拖拽调整
- Pretext 快速排版
- 用户自定义 Markdown 各层级字体 / 字号 / 效果
- 双向链接 `[[wiki link]]` + 反向链接面板
- Notion-like 可拖拽块增强
- 与 Canvas / Mindmap / Git / VS Code 扩展生态深度联动

### 4.3 架构

```
Markdown 文本 → remark 解析 → ProseMirror 文档 → WYSIWYG 渲染
                                                        ↕ 用户编辑
Markdown 文本 ← remark 序列化 ← ProseMirror 文档 ← 编辑后文档

┌────────────────────────────────────────────────┐
│  文件类型关联层：.md → 直接进 WYSIWYG 编辑器      │
│  （IEditorResolverService.registerEditor 优先级） │
├────────────────────────────────────────────────┤
│  Milkdown (ProseMirror + remark)  ← WYSIWYG 基座 │
│  自定义 NodeView / Plugin / Mark  ← 功能扩展      │
│  CSS 变量主题系统                  ← 排版定制      │
│  反向链接索引服务                  ← 双链引擎      │
├────────────────────────────────────────────────┤
│  Code OSS 平台：FileService / Git / Settings     │
└────────────────────────────────────────────────┘
```

**关键架构决策**：
1. `.md` 文件通过 `IEditorResolverService.registerEditor('*.md', {priority: builtin})` **直接进入 WYSIWYG 编辑器**——不从主页按钮进入（用户明确要求：编辑器与文件类型关联，不做功能按钮）。
2. webview CSP 严格：无 eval / 无 inline script，Milkdown 用 esbuild 打成纯 ESM bundle。
3. Round-trip 分两阶段：先做 Typora 级体验（允许 remark 规范化），后加 source-mapping 保留层（未修改区保留原文，仅编辑区重序列化）→ 超越 Typora 保真度。
4. Notion-like 数据库**不塞进 Markdown 编辑器**，作为 Phase 6 独立模块。

### 4.4 任务拆解

#### T-3.0 — 清理旧 Block Editor（前置）✅ 已完成 2026-07-01
- ✅ 移除 `browser/blockeditor/` 全部文件（BlockNote 实现，含 7 个 .ts/.cjs 源 + 2.0M vendor bundle：index.js/css + Inter 字体 18 个）
- ✅ 解除 `vsword.contribution.ts` 中的 4 处注册引用（`registerBlockEditorEditorFactory` / `BlockEditorResolverContribution` / `blockEditorAction` 副作用导入 / `.md` 默认编辑器绑定）
- ✅ 移除旧 vendor bundle
- ✅ 删除废弃验收清单 `test/2026-06-29-blockeditor-mvp-checklist.md`（BlockNote 版专属，Phase 2 有效内容已在测试套件与本计划保留）
- ✅ 确认 `.md` 文件回到默认文本编辑器 + writer-mode defaults（清理后临时状态，等 T-3.2 用 Milkdown 重建 WYSIWYG 关联）
- ✅ 全库 grep 无 `blockeditor/blockEditor/BlockEditor/openBlockEditor` 残留；package.json/product.json 无构建脚本残留
- 备注：`spikes/reactflow/` 保留 —— 虽在 spikes 目录下，但已是**当前采用**的 Canvas 实现（Phase 4），非废弃路线

#### T-3.1 — Milkdown spike（隔离验证）✅ 已完成 2026-07-01
- ✅ 隔离 spike：Milkdown 最小包组合加载进 CSP-safe webview bundle，esbuild 打包通过
- ✅ Markdown 输入 → Milkdown parser/serializer round-trip：中文、粗体、行内代码、GFM 表格语义保留
- ⚠️ CJK IME composition：本阶段仅验证中文解析/序列化；真实 Windows Chromium webview IME 输入留到 T-3.2 注册编辑器后专项验收
- ✅ bundle size 测量：451,510 bytes raw / 137,986 bytes gzip；静态扫描无 `eval(` / `new Function(`
- ✅ 交付：`browser/spikes/milkdown/build-milkdown-spike.cjs` + `docs/phase0/milkdown-spike.md` + 许可快照 `vendor/THIRD_PARTY_LICENSES.md`
- 决策：不采用 `@milkdown/kit`（会拉 `@milkdown/components` / Vue，且当前 registry 触发 `@babel/parser@^7.29.7` 解析失败）；生产接入使用最小包组合
- 下一步：进入 T-3.2 WYSIWYG MVP（`.md` 文件类型关联），完成后必须启动 VSWord 做真实 IME/保存闭环验收

#### T-3.2 — WYSIWYG 编辑器 MVP（文件类型关联）✅ 已完成 2026-07-01
- ✅ `.md` 文件关联：`IEditorResolverService.registerEditor('*.md', priority: builtin)`，打开 Markdown 文件直接进入 VSWord Milkdown Editor
- ✅ webview host：新增 `browser/milkdownEditor/milkdownEditorContribution.ts`，使用 `WebviewInput` + `IWebviewService.createWebviewOverlay`
- ✅ 通信协议：`ready` / `init` / `markdownUpdated` / `dirtyChanged` / `save` / `saved` / `openAsText` / `hostError`
- ✅ 文件读写闭环：host 通过 `IFileService.readFile/writeFile` 读写真实 `.md` 文件；webview 侧 Ctrl+S/按钮保存，编辑后 700ms debounce 自动写回
- ✅ Milkdown production bundle：`milkdownEditor/build-milkdown-editor.cjs` 生成 CSP-safe ESM bundle 到 `vendor/index.js`
- ✅ bundle 结果：452,299 bytes raw / 138,206 bytes gzip；round-trip（中文、strong、inline code、GFM table）通过；静态扫描无 `eval(` / `new Function(`
- ✅ 工程验证：`npm run compile-check-ts-native` 通过；`npm run transpile-client` 通过并生成 `out/vs/workbench/contrib/vsword/browser/milkdownEditor/*`
- ✅ Windows native GUI smoke：fresh profile 打开 `t32-milkdown-smoke.md`，真实窗口截图确认进入 VSWord Milkdown WYSIWYG（heading/list/inline code/GFM table 均渲染，状态 Ready，Save/Open as Text 可见），不再落回默认文本编辑器
- ✅ GUI 修复项：resolver contribution 从 `AfterRestored` 提前到 `BlockStartup`，避免命令行/双击 `.md` 在 resolver 注册前先被默认文本编辑器接管
- ✅ CSP 修复项：webview CSP 改为 `script-src ${webviewGenericCspSource}`，不再把具体 `index.js` URL 当 CSP source；GUI 日志中 bundle CSP block/invalid source 已消失
- ✅ 文件写回 smoke：Windows SendKeys/IME 自动化曾通过 Milkdown 将 `* **的**` 写回真实 `.md`，证明 webview 编辑事件 → host `IFileService.writeFile` 链路可工作；ASCII marker 自动化因 Electron webview/IME 焦点不稳定不作为验收判据
- ✅ 旧路线约束：未复活 BlockNote / blockeditor；未增加主页按钮入口
- ⚠️ 边界：当前 dirty 状态主要在 webview 内展示，并由 debounce/手动保存写回文件；还不是 VS Code 原生 WorkingCopy dirty dot/关闭前确认。已计划在 **T-3.2b** 升级为原生 EditorPane + WorkingCopy（用户决策 P-1=A）。

- ✅ **T-3.2b 已完成（2026-07-01）**：升级到 `MilkdownEditorInput extends WebviewInput` + `MilkdownWorkingCopy implements IWorkingCopy`，走 pane binding 自动复用 `WebviewEditor`（省 EditorPane 自建）。原生 dirty dot / Ctrl+S / 关闭前弹框 / Revert / external change / Backup 全部代理到 WorkingCopy。`npm run compile` 0 errors，`npm run test-node` 10910 passing（新增 8 个 milkdownWorkingCopy 测试全绿；唯一失败 Kerberos 环境无关）。Gate D 六项手工验收由用户在真机跑一遍确认。

#### T-3.2b — 升级到 EditorPane + WorkingCopy（原生 dirty / backup / external-change）✅ 已完成（2026-07-01）
**背景**：T-3.2 用 `WebviewInput`，dirty 状态只在 webview 内展示，缺少 VS Code 原生 dirty dot、Ctrl+W 保存提示、backup、external-change 合流。用户明确要求现在升级（决策 P-1=A），避免后期返工，也为 T-3.3~T-3.9 及最终 UI 重构留干净接口。

**目标**：
- 新增 `MilkdownEditorInput extends EditorInput`：承载 `resource: URI`，实现 `getName / getResource / matches / isDirty / dispose`
- 新增 `MilkdownEditorPane extends EditorPane`：宿主 webview overlay；`setInput` 时装载资源；`layout` 转发给 webview
- 引入 `IWorkingCopyService` 注册 `IWorkingCopy`：
  - `isDirty()` / `save()` / `backup()` / `revert()` 全部代理到 webview 通信
  - `resource` = markdown 文件 URI
  - `typeId` = `'vsword.markdown.milkdown'`
- Editor Resolver：`createEditorInput` 改为返回 `MilkdownEditorInput`（`EditorInputWithOptions`）
- 保留现有 webview 通信协议，但新增：`saveRequested` / `revertRequested` / `backupRequested` / `externalChange`
- 外部修改检测：host 侧 `IFileService.watch(resource)` → 通知 webview 弹 "文件已在外部修改，是否重新加载？"（无脏改直接刷；有脏改让用户决定）

**验收 Gate**：
- Gate D（Custom Editor 安全）：dirty / save / save as / revert / backup / external change / 关闭前提示 全过
- 与 T-3.2 GUI smoke 同款验证：VSWord fresh profile 打开 `.md`，编辑后标签页出现原生 dirty dot（●）
- 关闭未保存标签页弹出原生 "Do you want to save the changes..." 对话框
- 保存后 dot 消失
- 外部改文件（notepad 修改后保存）→ webview 收到 external change 提示

---

## 4a. Phase 3 最终任务清单（决策后 v3.1，2026-07-01 定稿）

### 用户决策记录（2026-07-01）

| ID | 决策项 | 用户选择 |
|----|-------|---------|
| **D-1** 代码块高亮 | Prism.js（Typora 同款）；后期可评估 Monaco 走 IntelliSense |
| **F-1** 图表 | **B 全套**：Mermaid + Flowchart.js + js-sequence-diagrams（Typora 三件套完整复刻） |
| **G-1** 图片 | P0/P1 全做（写入 assets、拖拽调整、图注、对齐）；**不做图床**（用户外部渠道解决） |
| **J-1** 视图模式 | **4 种全做**：源码 / 预览 / 专注 / 打字机 |
| **L-1** 主题 | **A + B + 最小化 C**：内置 4 主题 + Typora `.css` 主题兼容 + 3 项字体 Settings（`vsword.markdown.fontFamily` / `fontSize` / `lineHeight`），作用域限死在字体三元组避免与主题冲突 |
| **M-1** 导入导出 | C：内置 HTML + PDF（webview print）；Pandoc 走 Open VSX 扩展市场（不内置） |
| **N-1** Round-trip 顺序 | C：T-3.3 用 remark 配置贴近 Typora 输出（`bullet:'-'` / 不对齐表格）；T-3.8 上 source-mapping 保真层 |
| **P-1** EditorPane 升级 | A：现在升级（T-3.2b），避免 T-3.3~T-3.9 返工 |

### 最终执行顺序

```
T-3.0  清理旧 Block Editor                          ✅ 已完成
T-3.1  Milkdown spike                               ✅ 已完成
T-3.2  WYSIWYG MVP（文件类型关联）                  ✅ 已完成
T-3.2b EditorPane + WorkingCopy 升级                ✅ 已完成（2026-07-01）
────────── 以下是决策后拆解的完整 Typora 1:1 复刻任务 ──────────
T-3.3  Typora 级即时渲染 + 排版基础                  ← 下一步
       ├─ 3.3.1 CSS 主题系统（内置 4 主题：Light / Dark / GitHub / Serif）
       ├─ 3.3.2 光标进出代码块/表格切换源码/渲染（inline WYSIWYG 精髓）
       ├─ 3.3.3 slash menu（/ 插入块）
       ├─ 3.3.4 KaTeX 数学公式（行内 $…$ + 块 $$…$$）
       ├─ 3.3.5 Prism 代码高亮（决策 D-1=A）
       ├─ 3.3.6 remark 配置贴近 Typora 输出（bullet '-' / tablePipeAlign:false）
       └─ 3.3.7 智能输入 & 快捷键（自动括号、Ctrl+1..6 段落风格、Ctrl+B/I 等）
T-3.4  自定义排版 + Typora 缺失语法
       ├─ 3.4.1 mark 扩展：上标 (^) / 下标 (~) / 高亮 (==) / 下划线 (<u>)
       ├─ 3.4.2 Emoji `:smile:`（remark-emoji）
       ├─ 3.4.3 脚注 (remark-footnotes)
       ├─ 3.4.4 用户字体三元组 Settings（fontFamily/fontSize/lineHeight）
       ├─ 3.4.5 Pretext 快速排版
       └─ 3.4.6 frontmatter 可视化编辑
T-3.5  图片增强（决策 G-1，不做图床）
       ├─ 3.5.1 粘贴/拖拽自动写入 assets/ + 相对路径
       ├─ 3.5.2 拖拽调整大小（自定义 NodeView + resize handle）
       ├─ 3.5.3 图注 (alt / caption)
       └─ 3.5.4 对齐（左/中/右 via HTML align 保真）
T-3.5b 图表全套（决策 F-1=B）
       ├─ 3.5b.1 Mermaid（flowchart/sequence/gantt/ER/mindmap/state/pie/git-graph 等）
       ├─ 3.5b.2 Flowchart.js（Typora 老三件套之一）
       ├─ 3.5b.3 js-sequence-diagrams
       └─ 3.5b.4 图表懒加载（首屏不打包，编辑到才动态 import）
T-3.6  双向链接系统
       ├─ 3.6.1 [[wiki link]] 语法（自定义 remark plugin）
       ├─ 3.6.2 自动补全 UI
       ├─ 3.6.3 全局反向链接索引服务（IReverseLinkService）
       ├─ 3.6.4 反向链接面板（backlinks panel）
       └─ 3.6.5 链接跳转 / 悬停预览
T-3.7  Notion-like 块增强
       ├─ 3.7.1 块拖拽手柄（plugin-block）
       ├─ 3.7.2 块转换菜单（H1↔H2↔段落↔引用等）
       └─ 3.7.3 表格可视化操作（右键增删行列 / 单元格对齐）
T-3.7b 视图模式（决策 J-1，4 种全做）
       ├─ 3.7b.1 源码模式（Ctrl+/ 切换，复用 Open as Text）
       ├─ 3.7b.2 预览/阅读模式（Milkdown editable=false + 简化 UI）
       ├─ 3.7b.3 专注模式（当前段落亮，其余淡化：ProseMirror decoration）
       └─ 3.7b.4 打字机模式（当前行居中：scroll-into-view）
T-3.7c 导航
       ├─ 3.7c.1 TOC 自动生成（Markdown 内嵌 [TOC]）
       ├─ 3.7c.2 大纲面板（Outline View 集成 Code OSS 原生）
       └─ 3.7c.3 查找替换（复用 webview enableFindWidget + 自定义 replace）
T-3.7d 主题兼容层（决策 L-1=A+B）
       ├─ 3.7d.1 内置 4 主题（Light / Dark / GitHub / Serif）
       ├─ 3.7d.2 Typora `.css` 主题兼容（放 `.vsword/themes/*.css` 自动扫描）
       └─ 3.7d.3 主题切换命令 & 状态栏指示
T-3.8  Round-trip 保真层（source-mapping）
       ├─ 3.8.1 记录未修改区域原始文本（ProseMirror 到 remark AST 的 range map）
       ├─ 3.8.2 仅对编辑区域重新序列化，其余区域返回原始 bytes
       ├─ 3.8.3 fixture 测试扩展（Phase 2 fixtures + Typora 输出对比）
       └─ 3.8.4 Gate E 强化：byte-for-byte 未修改场景 = 100%
T-3.8b 导入导出（决策 M-1=C）
       ├─ 3.8b.1 HTML 导出（webview innerHTML + inline CSS）
       ├─ 3.8b.2 PDF 导出（webview.executeCommand('workbench.action.webview.print') 或 chromium print）
       └─ 3.8b.3 Pandoc 检测（若装了 Pandoc 扩展或本机 pandoc.exe，暴露更多导出格式；否则隐藏）
T-3.9  性能与 IME 全矩阵收口
       ├─ 3.9.1 大文档性能：1MB / 5MB Markdown（打开 <2s / 编辑无卡顿）
       ├─ 3.9.2 中文 / 日文 / 韩文 IME 全矩阵（composition 不丢字/不重复/不打断保存）
       ├─ 3.9.3 内存 / bundle 尺寸复盘
       └─ 3.9.4 阶段验收报告（Gate D/E/G 全过）
```

### UI 重构接口预留（贯穿所有子任务）

用户明确所有 Phase 3 工作完成后会**整体重构 UI**。为此每个子任务必须：

1. **命令化**：所有用户可触发的动作（切换视图、切主题、导出、插入图片…）走 `CommandsRegistry.registerCommand`，UI 层只是命令的一层皮
2. **状态服务化**：编辑器状态（当前主题、视图模式、字体设置）走 `IContextKeyService` + 独立 service，UI 层只订阅不持有状态
3. **消息协议稳定**：webview ↔ host 通信协议在 `milkdownEditor/protocol.ts` 集中定义，禁止散落
4. **UI 组件契约**：webview 内所有工具栏 / 面板 / 弹窗都实现 `IMilkdownUIComponent { mount / unmount / dispose }`，为后期整体换皮做准备

---

## 5. ⚪ Phase 6 — 多维表（Notion-like 数据库）【后期功能】

> **本阶段标记为后期开发，当前不启动。**

- 作为**独立文件类型**（如 `.vsdb`）注册，不塞进 Markdown 编辑器
- 结构化存储（JSON / SQLite），多视图（表格 / 看板 / 日历）
- 通过嵌入语法在 Markdown 中引用数据库视图
- 遵循 Won't Do：不做跨页面 Database 联动 / Relation / Rollup（单文件多维表）

---

## 6. ⚪ Phase 7 — 产品化收口【未启动】

- VSWord 品牌化（图标 / 名称 / 欢迎页）
- Windows native 打包分发
- 自动更新机制评估
- 用户文档 / 快速上手

---

## 7. 本次执行顺序（Phase 3 新建）

```
T-3.0 清理旧 Block Editor（前置，无风险）
  ↓
T-3.1 Milkdown spike 🚨 验收后继续
  ↓
T-3.2 WYSIWYG MVP（文件类型关联）
  ↓
T-3.3 Typora 级排版与即时渲染
  ↓
T-3.4 自定义排版  →  T-3.5 图片增强  →  T-3.6 双链  →  T-3.7 块增强
  （超越点，可按用户优先级调整顺序）
  ↓
T-3.8 Round-trip 保真层
  ↓
T-3.9 性能与 IME 收口
```

**验收节奏**：用户每天早上集中验收；模块内技术自主拍板（可维护 > 性能 > 效果，成熟开源库优先）；仅产品方向问题用 🚨【需要你批准】。

---

## 8. 风险与升级路径

| 风险 | 触发条件 | 升级动作 |
|------|---------|---------|
| Milkdown CSP webview 不兼容 | T-3.1 spike 无法在严格 CSP 下运行 | 评估放宽 CSP nonce 或降级裸 ProseMirror |
| CJK IME 仍有问题 | T-3.1 中文输入丢字/重复 | 评估 ProseMirror 直接处理 composition 事件 |
| Milkdown 抽象层阻碍扩展 | T-3.5+ 自定义 NodeView 受限 | 逐步替换为裸 ProseMirror（保留 remark） |
| Round-trip 保真不达标 | T-3.8 fixture 失败 | 先保留 Typora 级规范化，保真层降级为 P1 |

---

## 9. 与旧文档的关系

- `002-development-task-breakdown.md`：保留作 Phase 0/1/2/4/5 历史任务细节归档，其"当前状态"章节已过时，以本文档为准。
- `PRD-vsword-v1.md`：产品总需求不变；FR-01 需重写为 Milkdown WYSIWYG 方案（见 T-3.2 前置）。
- 各 FR 文档（FR-02~FR-06）：Canvas / Mindmap 需求仍有效。

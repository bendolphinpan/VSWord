# VSWord 主开发计划（全景 + 进度）

> **文档定位**：VSWord 的**全景路线图与模块进度权威**（Phase 0–7 含义、产品决策、历史交付）。  
> **债务 / 修复 / 发布前硬门槛**的执行清单不在本文展开，见 → **`004-remediation-and-debt-plan.md`（RD- 号）**。  
> 取代 `002-development-task-breakdown.md` 的「当前状态」章节（该文档保留作历史任务细节归档）。  
> **作者**：Hermes 主代理 · **创建**：2026-06-30 · **修订**：2026-07-13（真相表 + 债务指针）  
> **基线**：Code OSS `1.124.2`（`D:\GIT\VSWord\code-oss`，分支 `dev`）  
> **功能线水位**：Phase 3 主线归档 + Round-2 `T-3.13.x`（至 `1889e82e` / handoff `e65f8411`）

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
| **债务执行清单** | `D:\GIT\VSWord\docs\plans\004-remediation-and-debt-plan.md` |

### 0.1 文档权威分工（2026-07-13 起）

| 问题 | 读哪份 |
|------|--------|
| 产品是什么、Phase 0–7 各自做什么 | 本文 + `000-vsword-master-plan.md` |
| **下一步修什么 / 债务优先级** | **`004-remediation-and-debt-plan.md`** |
| Phase 3 归档 Gate 证据 | `docs/decisions/phase-3-acceptance.md` |
| **UI 改造边界 L0–L3** | **`docs/decisions/0002-ui-modification-boundary.md`** |
| 代码目录与构建命令速查 | `docs/VSWord-PROJECT-HANDOFF.md` |

### 0.2 Phase 序号冻结规则

- **Phase 4 = Canvas 模块**，已 100% 完成。
- **禁止**再把「未闭合优化 / 性能债 / IME 手测」称为「转交 Phase 4」。
- 新工作使用 **RD- 债务号**（见 `004`）或未启动的 **Phase 6 / Phase 7**。
- 实际交付时间线（供理解历史，**不是**推荐执行序）：  
  `0 → 1 → 2 → 4(Canvas) → 5(Mindmap) → 3旧废弃 → 3新 Milkdown → 3 收官/Round-2 → **RD 债务桶** → 7 产品化`

---

## 1. 产品定位（不变）

VSWord = Code OSS 1.124.2 基线
+ VS Code 扩展生态
+ **Typora 级 Markdown WYSIWYG 编辑**（Milkdown；「超越 Typora」能力见下，部分仍为债务）
+ XMind 参考的 `.mm` 思维导图
+ Miro 参考的「文件夹即 Canvas」组织视图
+ Code OSS 内置 Git 作为版本管理
− 默认 Copilot / 程序员默认噪音 / 实时协作 / 云账号

**核心原则**：本地优先 · 数据透明 · 数据无损 · 扩展生态保留 · 最小侵入 · Git 即历史 · 成熟开源库优先不造轮子 · **功能优先视觉延后**（UI 大重构另立阶段）。

**「超越 Typora」对账（避免过度承诺）**：

| 能力 | 状态 |
|------|------|
| 图片位置 / 大小拖拽 | ✅ |
| 双向链接 + 反向链接 | ✅ 语法/补全/hover；反向链接 **footer 为正式形态**（不做侧栏面板） |
| Notion-like 块拖拽 / 转换 | ✅ |
| 图表三件套 | ✅ Mermaid + Flowchart.js + js-sequence |
| Pretext 快速排版 | ▶ **RD-5=A 做**（已拍板；待 spike） |
| 用户字体三元组 Settings | ⏸ 未闭合 → **RD-7** |
| 大文档 open 性能 | 🔴 未达标 → **RD-1** |
| Round-trip 保真等级 | Gate E 绿；语义等级待钉 → **RD-11** |

---

## 1b. Phase 3 功能真相表（plan 语义 · 现行状态）

> **本表为 2026-07-13 起的进度权威**。只使用 **plan 功能领域 T 号**。  
> commit 曾用过的冲突 T 号见文末 **附录 A（ARCHIVE）**，不得再当现行状态引用。

| plan T-号 | 含义 | 状态 | 关键证据 | 残余 / 债务 |
|-----------|------|------|----------|-------------|
| T-3.0 | 清理旧 Block Editor | ✅ | `c361b402` / `4ccbb95a` | — |
| T-3.1 | Milkdown spike | ✅ | `docs/phase0/milkdown-spike.md` | — |
| T-3.2 / 3.2b | WYSIWYG MVP + WorkingCopy | ✅ | `c361b402` / `0f6bc00a` | — |
| T-3.3.x | 即时渲染 + 排版基础 | ✅ | `9f76d3e0` 等；数学曾标 commit T-3.9；Prism 曾标 commit T-3.7 | — |
| T-3.4.1~3 / 3.4.6 | mark 系 / emoji / footnote / frontmatter | ✅ | 由 **T-3.5c** 覆盖（`003c-syntax-completion.md`） | — |
| T-3.4.4 | 用户字体三元组 Settings | ⏸ | 决策 L-1 有；实现未收官 | **RD-7** |
| T-3.4.5 | Pretext 快速排版 | ▶ 已立项 | 用户拍板 RD-5=**A 做**（2026-07-13） | **RD-5** spike→接入 |
| T-3.5.1~4 | 图片增强 | ✅ | `8bd1650d` → `3f43dc6a` | — |
| T-3.5b | 图表全套 + 懒加载 | ✅ | Gate F 81 pass；`e557e475` 等 | 再优化 → **RD-8** |
| T-3.5c | 语法补齐 | ✅ | Gate G-A | — |
| T-3.6.1~3 / 3.6.5 | 双链语法 / 补全 / 索引 / 跳转·hover | ✅ | commit 曾标 T-3.11.x | — |
| T-3.6.4 | 反向链接 | ✅ footer 正式形态 | `f664d47e`；用户拍板保持 footer、**不做面板**（2026-07-13） | RD-6 关闭 |
| T-3.7.1~2 | 块拖拽 + 转换菜单 | ✅ | commit 曾标 T-3.8：`00daab60` | — |
| T-3.7.3 | 表格 chrome | ✅ | commit 曾标 T-3.6；UX `T-3.12.2` | — |
| T-3.7b.1~4 | 源码 / 阅读 / 专注 / 打字机 | ✅ | 服务化 + 正交性 v2 + Round-2 | 对账 → **RD-4** |
| T-3.7c.1~3 | TOC / Outline / 查找替换 | ✅ | TOC 四子卡；Outline；find `4b5b5718` | — |
| T-3.7d.1~3 | 主题兼容层 | ✅ | `94f0f0eb` / `5b78d516`… / `29f87452` | — |
| T-3.8.1~4 | Round-trip 保真 | ✅ 主线 | Gate E 296 pass | 等级声明 → **RD-11** |
| T-3.8b.1~3 | HTML / PDF / Pandoc | ✅ | `1d051293`…`daf95a08` | — |
| T-3.9.1~4 | 性能与 IME 收口 | ⚠️ 部分 | 三报告 + Gate G | open 🔴 **RD-1**；IME **RD-2**；RSS **RD-3** |
| T-3.12.x | 收官 P0 fix Round-1 | ✅ | IME gate / 表格 hover / 模式 state | — |
| T-3.13.x | 用户反馈 Round-2 | ✅ 代码 | `400227ed`→`1889e82e` | Rime 人肉 → **RD-2** |

**主线口径**：可称「Phase 3 主线完成」；**不得**宣称「无债务 / 性能达标 / IME 全矩阵签字」。

---

## 2. 全景进度矩阵

| Phase / 桶 | 模块 | 状态 | 进度 | 备注 |
|------------|------|------|------|------|
| **Phase 0** | 基线（checkout / Copilot 移除 / Open VSX） | ✅ 完成 | 100% | |
| **Phase 1** | Writer Workbench Shell | ✅ 完成 | 100% | |
| **Phase 2** | Markdown Core | ✅ 完成 | 100% | |
| **Phase 3（旧）** | BlockNote | ❌ 废弃 | — | 有损 MD + 卡死 |
| **Phase 3（新）** | Milkdown WYSIWYG | ✅ 主线 + Round-2 | ~95% 功能 | 残余见 **RD-*** / §1b |
| **Phase 4** | Canvas（React Flow） | ✅ 完成 | 100% | **仅指 Canvas，不是 backlog** |
| **Phase 5** | Mindmap（`.mm`） | ✅ 深度完成 | ~90% | 剩余 → **RD-9** |
| **Debt 桶** | 体验债 / 治理 / 发布门槛 | 🔴 进行中 | 见 `004` | **当前推荐主线** |
| **Phase 6** | 多维表 | ⚪ 后期 | 0% | 发布前不启动 |
| **Phase 7** | 产品化收口 | ⚪ 未启动 | 0% | 最小可发布 → **RD-10** |

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

**Phase 5 剩余（P1/P2）**：Markdown ↔ `.mm` 互转完善、richcontent 富文本可视化编辑、10k 节点性能矩阵、IME 全矩阵专项。统一登记为债务 **RD-9**（见 `004-remediation-and-debt-plan.md`），**不**再写入「Phase 4」。

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

> **历史清单**：本节保留 2026-07-01 决策与任务树原文结构，便于追溯「当时打算做什么」。  
> **现行完成度**请只看 **§1b 真相表**；未闭合项执行看 **`004`（RD- 号）**。  
> 决策表中的 **D-1**（Prism）≠ 债务 **RD-1**（大文档 open）。

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
T-3.3  Typora 级即时渲染 + 排版基础                  ← 历史清单（已交付，见 §1b）
       ├─ 3.3.1 CSS 主题系统（内置 4 主题：Light / Dark / GitHub / Serif）
       ├─ 3.3.2 光标进出代码块/表格切换源码/渲染（inline WYSIWYG 精髓）
       ├─ 3.3.3 slash menu（/ 插入块）
       ├─ 3.3.4 KaTeX 数学公式（行内 $…$ + 块 $$…$$）
       ├─ 3.3.5 Prism 代码高亮（决策 D-1=A）
       ├─ 3.3.6 remark 配置贴近 Typora 输出（bullet '-' / tablePipeAlign:false）
       └─ 3.3.7 智能输入 & 快捷键（自动括号、Ctrl+1..6 段落风格、Ctrl+B/I 等）
T-3.4  自定义排版 + Typora 缺失语法
       ├─ 3.4.1 mark 扩展：上标 (^) / 下标 (~) / 高亮 (==) / 下划线 (<u>)  ✅→T-3.5c
       ├─ 3.4.2 Emoji `:smile:`（remark-emoji）  ✅→T-3.5c
       ├─ 3.4.3 脚注 (remark-footnotes)  ✅→T-3.5c
       ├─ 3.4.4 用户字体三元组 Settings（fontFamily/fontSize/lineHeight）  ⏸→RD-7
       ├─ 3.4.5 Pretext 快速排版  ⏸→RD-5
       └─ 3.4.6 frontmatter 可视化编辑  ✅→T-3.5c
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

## 7. 当前执行序（2026-07-13 修订）

### 7.1 Phase 3 主线交付（已完成 · 2026-07-09 归档 · Round-2 至 2026-07-11）

```
T-3.0 清理旧 Block Editor            ✅
  ↓
T-3.1 Milkdown spike                 ✅
  ↓
T-3.2 / 3.2b WYSIWYG MVP + WorkingCopy ✅
  ↓
T-3.3 排版与即时渲染                  ✅
  ↓
T-3.5 图片 → T-3.5b 图表 → T-3.5c 语法 → T-3.6 双链 → T-3.7 块增强  ✅
  ↓
T-3.7b 视图模式 / T-3.7c 导航 / T-3.7d 主题  ✅
  ↓
T-3.8 Round-trip / T-3.8b 导入导出     ✅
  ↓
T-3.9 性能与 IME 收口（报告齐；open/手测未闭合）  ⚠️ → RD-1 / RD-2
  ↓
T-3.12 Round-1 P0 fix                 ✅
T-3.13 Round-2 用户反馈 fix           ✅ 代码（Rime 手测 → RD-2）
```

**归档决策**：`docs/decisions/phase-3-acceptance.md`（Gate D/E/F/G）。  
**旧 U-1..U-5**：已映射到 **RD-1..RD-4 / RD-8**，见 `004` §4。  
**Gate G 回归**：`node code-oss/test/scripts/gate-g.mjs --phase3-only`

### 7.2 当前推荐主线 = Debt 桶（不是 Phase 4）

| 顺序 | ID | 内容 | 优先级 |
|------|-----|------|--------|
| 1 | **RD-0** | 规划/文档真相收敛 | P0 · 本轮文档 |
| 2 | **RD-2** | 真实 IME 手测签字 | P0 · 发布硬门槛 |
| 3 | **RD-1** | 大文档 open pipeline | P0 · 发布硬门槛 |
| 4 | **RD-11** | Round-trip 保真等级声明 | P1 |
| 5 | **RD-7** | 字体三元组 Settings | P1 |
| 6 | **RD-5** | Pretext（已拍板 **A 做** · spike 穿插） | P1 |
| 7 | **RD-10** | Phase 7 最小可发布（**B Portable**） | P0 |
| 8 | **RD-12** | Open VSX / VSIX 冒烟 | P1 |
| 9 | RD-4 / RD-3 / RD-8 / RD-9 | 对账 / 度量 / lazy / Mindmap 剩余 | P2 穿插（**RD-6 已关闭**） |

完整 AC、子任务、禁止项 → **`004-remediation-and-debt-plan.md`**。

### 7.3 明确不启动

- **Phase 6 多维表**：后期；可发布前不做。  
- **整体 UI 视觉大重构**：功能债与发行之后另立阶段。  
- **重开 BlockNote / 图床 / 实时协作**：非目标。

### 7.4 验收节奏

用户每天早上集中验收；模块内技术自主拍板（可维护 > 性能 > 效果）；仅产品方向问题用 🚨【需要你批准】（RD-5 做/砍、RD-6 是否做面板、RD-10 安装形态等）。

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

- `002-development-task-breakdown.md`：保留作 Phase 0/1/2/4/5 历史任务细节归档，其「当前状态」已过时，以本文 §1b/§2 与 `004` 为准。
- `004-remediation-and-debt-plan.md`：**债务与修复执行权威**（RD- 号）；取代一切「转交 Phase 4」表述。
- `PRD-vsword-v1.md`：产品总需求仍有效；FR-01 已切换为 Milkdown 路线。
- 各 FR 文档（FR-02~FR-06）：Canvas / Mindmap 需求仍有效。
- `003-phase3-fix-p0.md` / `003-phase3-fix-p0-round2.md` / `003-phase3-mode-orthogonality.md`：Phase 3 修复与模式设计归档，不改写历史结论。
- `docs/decisions/phase-3-acceptance.md`：主线归档证据；未闭合项以 `004` RD- 号为准（文内已加 supersede 指针）。

---

## 附录 A · T 号漂移映射（ARCHIVE · 仅考古）

> 生成于 2026-07-04；**冻结**。commit 提交时的 T 号是**交付顺序编号**，与 plan **功能领域编号**脱钩。  
> 现行进度请只看 **§1b**，不要把本附录的「未启动」当成 2026-07 之后的状态。

| commit 标签 | commit 实际含义 | 对应 plan 语义 |
|-------------|-----------------|----------------|
| commit T-3.6 | 表格 chrome | plan T-3.7.3 |
| commit T-3.7 | 代码块 Prism chrome | plan T-3.3.5 |
| commit T-3.8 | 块 hover + 转换菜单 | plan T-3.7.1 + 3.7.2 |
| commit T-3.9 | 数学 NodeView | plan T-3.3.4 |
| commit T-3.10 | focus / typewriter | plan T-3.7b.3 + 3.7b.4 |
| commit T-3.11.x | 双链系列 | plan T-3.6.x |
| commit T-3.4（历史） | 常含 Outline | plan T-3.7c.2（Outline） |

**后续 commit 策略**：新工作优先 `RD-x.y` 或明确 plan 语义三段号；**禁止**再复用上表左侧冲突标签指代新功能。

---

**文档修订 End · 2026-07-13 · 真相表 + Debt 指针**

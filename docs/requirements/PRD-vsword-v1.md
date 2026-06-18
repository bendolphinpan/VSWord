# VSWord 产品需求文档 v1

> **文档定位**：VSWord 总产品需求，作为 PRD 主文。详细切片见 `FR-01/02/03-*.md`，实施任务见 `docs/plans/002-development-task-breakdown.md`。
> **作者**：Hermes 主代理（需求 + 审查角色）
> **日期**：2026-06-18
> **基线**：Code OSS `1.124.2`，源码位于 `D:\GIT\VSWord\code-oss`
> **执行者**：fullstack-developer 子代理执行编码；本文档作者负责需求、审查、测试。

---

## 1. 产品定义

VSWord 是基于 Code OSS 改造、面向**文字工作者**（写作者、研究者、知识工作者）的**本地优先**写作与知识工作台。

> **一句话定位**：保留 VS Code 扩展生态、去除程序员默认噪音和 Copilot，加入 Notion 风格的 Markdown 块编辑、XMind 风格的 `.mm` 思维导图、Miro 风格的"文件夹即 Canvas"组织视图。

### 公式

```text
VSWord = Code OSS 1.124.2 基线
       + VS Code 扩展兼容
       + Notion 风格 Markdown 块编辑（不含历史/协作/AI）
       + XMind 参考的 .mm 思维导图（FreeMind XML 兼容）
       + Miro 参考的文件夹 Canvas（图钉/文字标注/贴纸/图片/网页/frame/连线）
       + Code OSS 内置 Git 作为版本管理（替代 Notion 页面历史）
       - 默认 Copilot
       - 程序员默认 UI 噪音（Debug/Terminal/SCM 不删但默认隐藏，Git/Source Control 仍可调出）
       - 实时协作 / 云账号 / 多人 Comments / Presence
       - Notion 页面历史（用 Git 替代）
       - Notion 同步块、Database 跨页面联动等强联动特性
```

---

## 2. 核心原则

| # | 原则 | 说明 |
|---|---|---|
| P-1 | **本地优先** | 所有用户内容是本地真实文件，不依赖云。 |
| P-2 | **数据透明** | 正文 = 标准 `.md` / `.mm` / 普通文件；视图层和元数据放 `.vsword/`。任何文件在外部编辑器中仍然完整可用。 |
| P-3 | **数据无损** | Markdown 和 `.mm` 必须通过 round-trip fixture 测试。未识别语法 / 未识别 XML 属性子节点必须保留。 |
| P-4 | **扩展生态保留** | VS Code 扩展机制、Extension Host、VSIX、命令、键位、设置、主题、Webview、Custom Editor 全部保留。 |
| P-5 | **最小侵入** | 所有 VSWord 功能集中在 `src/vs/workbench/contrib/vsword/`，核心只做注册式改动，便于上游同步。 |
| P-6 | **Git 即历史** | 不实现 Notion 风格页面历史，用户用 Code OSS 自带 Source Control / Timeline / Local History 完成版本回溯。 |
| P-7 | **不做联动** | 不实现实时协作、Comments、Presence、同步块、跨页面 Database 联动等任何"联动"特性。 |

---

## 3. 范围与不范围

### 3.1 P0（MVP 必做）

#### 文档与编辑

- F-DOC-1：Markdown 文件读写无数据损失。
- F-DOC-2：YAML frontmatter 解析、未知字段保留。
- F-DOC-3：源码 / 预览 / 阅读 / 块 四种模式可切换。
- F-DOC-4：Notion 风格块编辑器（详见 `FR-01`）。
- F-DOC-5：粘贴图片自动写入资源目录、相对路径引用。
- F-DOC-6：中英文混排字数统计。

#### 思维导图

- F-MM-1：`.mm`（FreeMind XML）读写，未知属性 / 未知子节点 / 节点顺序保留。
- F-MM-2：XMind 参考的视觉与交互（详见 `FR-02`）：树形 / 鱼骨 / 组织结构 / 逻辑图 / 时间轴 等基础布局；节点风格、图标、备注、链接、关系线（free relationship）。
- F-MM-3：Markdown 大纲 ↔ Mindmap 互转（标记为有损转换）。

#### Canvas（文件夹视图）

- F-CAN-1：任意 workspace 文件夹可"以 Canvas 打开"。Canvas 与 Explorer 树形视图**并存**，互不替代。
- F-CAN-2：Canvas 元素（详见 `FR-03`）：文件卡片（带预览）、文件夹卡片（双击下钻）、便签 / 文字标注、图钉、贴纸、图片、网页（iframe）、frame（分组框）、连线（直线/箭头/曲线）。
- F-CAN-3：文件卡片在 Canvas 中可基础预览与轻量编辑（如改 Markdown 标题、移动列表项），重度编辑双击进入文件本体。
- F-CAN-4：Canvas 数据存 `.vsword/canvas/<folder-path>.canvas.json`，可被 Git 追踪、可被人工审计。
- F-CAN-5：文件移动 / 重命名 / 删除时，Canvas 卡片状态正确更新（broken / moved），不崩溃。

#### 产品壳

- F-SHELL-1：默认布局调整为写作友好（写作 Home、隐藏 Debug/Terminal/Run 默认入口，但保留可调出）。
- F-SHELL-2：保留 Source Control（Git）作为一等公民，作为"页面历史"的替代。
- F-SHELL-3：移除默认 Copilot 入口、欢迎页推荐、`defaultChatAgent` 等绑定（详见 Phase 0 Task 0.7）。
- F-SHELL-4：Extensions 视图、VSIX 安装、命令面板、设置 UI、键位 UI 全保留。
- F-SHELL-5：默认 Marketplace 策略待法务复核——MVP 先用 Open VSX 或纯本地 VSIX 安装，**绝不**默认指向 Microsoft Marketplace。

### 3.2 P1（次轮）

- 块编辑器 database 视图（单文件内嵌 table-as-database）。
- Canvas 缩略图缓存优化、节点虚拟化。
- `.mm` 富文本节点（richcontent）的可视化编辑。
- 文档间双向链接（[[link]] 风格），但**不联动数据**，仅 Code OSS workspace 内的引用解析。
- 写作模板系统（小说 / 论文 / 周报 / 卡片笔记）。
- 阅读模式排版主题（衬线、稿纸、Typora 风格等）。

### 3.3 P2（远期）

- XMind 私有 `.xmind`（ZIP）格式导入 / 导出（仅作为 P2 兼容）。
- PDF 文件卡片渲染。
- 自定义 Canvas 渲染器（高性能 LOD）。
- VSWord 专属扩展 API typed namespace（`vsword.documents` / `vsword.canvas` / `vsword.mindmap` / `vsword.metadata`）。

### 3.4 ❌ Won't Do（明确不做）

| # | 不做项 | 替代方案 |
|---|---|---|
| W-1 | 实时协作 / Presence / 多人光标 | 单用户产品。 |
| W-2 | 云账号 / 云同步 | 用户自行通过 Git/网盘/Syncthing 同步。 |
| W-3 | 多人 Comments / Mentions | 不做。 |
| W-4 | Notion 同步块（synced block） | 不做，会引入跨页面联动复杂度。 |
| W-5 | Notion 跨页面 Database 联动 / Relation / Rollup | 不做。MVP 内嵌 database 仅限单文件 table。 |
| W-6 | **Notion 页面历史 / 版本快照** | **使用 Code OSS 内置 Source Control（Git）+ Timeline + Local History 替代。** |
| W-7 | 默认 AI / Copilot | 用户可自行装 AI 扩展，但产品默认不集成。 |
| W-8 | CRDT / OT 协作内核 | 不引入。 |
| W-9 | 私有 marketplace 后端 | 不自建。 |

---

## 4. 工作区数据布局

```text
project-root/
├── docs/                   # 用户的 Markdown 文档
├── maps/                   # 用户的 .mm 思维导图
├── assets/                 # 用户资源（图片等）
├── references/             # 用户引用资料
└── .vsword/
    ├── workspace.json      # 工作区级配置
    ├── canvas/             # 文件夹 Canvas 视图数据
    │   ├── index.json
    │   └── <folder-hash>.canvas.json
    ├── metadata/           # 文档/导图额外元数据（标签、状态等）
    ├── cache/              # 缩略图、解析缓存（可删除）
    └── extensions/         # VSWord 内置扩展配置
```

**规则**：
- 用户内容文件是权威数据源。
- `.vsword/` 全部走 JSON / 文本格式，可被 Git 追踪与审计。
- `.vsword/cache/` 可被任意删除而不影响核心数据。

---

## 5. 与 Phase 0 / 现有规划的对齐

| 现有 Phase | 对应本 PRD 的功能 | 状态 |
|---|---|---|
| Phase 0 Task 0.1–0.4 baseline | F-SHELL 前置条件 | 源码已 checkout（`code-oss/`），但 `npm install` / `npm run watch` / 启动验证未完成（Gate A 未通过） |
| Phase 0 Task 0.5 产品身份 | F-SHELL-1, F-SHELL-3 | 未开始 |
| Phase 0 Task 0.6 扩展兼容 | F-SHELL-4 (Gate B) | 未开始 |
| Phase 0 Task 0.7 Copilot 默认移除 | F-SHELL-3 (Gate C) | 未开始 |
| Phase 0 Task 0.8 Custom Editor / Webview spike | F-DOC-4 / F-MM-2 / F-CAN-* 前置 | 未开始 |
| Phase 0 Task 0.9 Markdown round-trip | F-DOC-1 / F-DOC-2 (Gate E) | 未开始 |
| Phase 0 Task 0.10 `.mm` round-trip | F-MM-1 (Gate F) | 未开始 |
| Phase 0 Task 0.11 依赖 / 许可证 | 前置所有 P0 | 未开始 |
| Phase 1 Writer Workbench Shell | F-SHELL-* | 等 Phase 0 |
| Phase 2 Markdown Core | F-DOC-1/2/3/5/6 | 等 Phase 0 |
| Phase 3 Block Editor MVP | F-DOC-4 | 等 Phase 2 |
| Phase 4 Folder Canvas MVP | F-CAN-* | 等 Phase 0 spike |
| Phase 5 `.mm` Mind Map MVP | F-MM-* | 等 Phase 0 spike |

---

## 6. 验收策略（总）

每个 P0 功能上线时必须通过：

- **Gate A 基线**：Code OSS 未修改基线可 install / watch / 启动。
- **Gate B 扩展兼容**：12 项扩展 smoke 用例（详见 `001-phase0-execution-plan.md` §1 Gate B）。
- **Gate C Copilot 默认移除**：默认无 Copilot 推荐 / 入口 / 网络调用，但用户可自行安装 AI 扩展。
- **Gate D Custom Editor / Webview 安全**：dirty / save / save as / revert / backup / CSP 全过。
- **Gate E Markdown Round-trip**：fixtures 未修改场景下 byte-for-byte 一致或白名单格式化差异。
- **Gate F `.mm` Round-trip**：fixtures 未修改场景下未知属性、未知子节点、节点顺序全部保留。
- **Gate G 写作体验**：中文 IME 在所有编辑器（Markdown 块、Mindmap 节点、Canvas 便签）输入不丢字、不误触发 slash menu。

详细验收清单见 `FR-01 / FR-02 / FR-03` 各自文档末尾。

---

## 7. 角色分工

| 角色 | 职责 |
|---|---|
| Hermes 主代理（本文作者） | 需求撰写、审查、测试设计、跨阶段把关、向用户汇报 |
| **fullstack-developer** 子代理 | 编码实现、技术选型 spike、单测、修 bug |
| 用户（Pan） | 决策、批准动作、提供产品判断、最终验收 |

**协作约定**：
1. fullstack-developer 每完成一个任务，提交：代码 + 单测 + 用法说明 + 修改文件清单 + 自测截图（可选）。
2. 主代理按 PRD 与 FR 文档逐项验收；不通过的任务必须返工，不允许"先合并后修"。
3. 重大动作（依赖安装、修改产品身份、移除 Copilot 入口、首次启动 watch、首次写源码）**必须先经用户批准**。

---

## 8. 已知风险与决策记录

| 风险 | 影响 | 缓解 |
|---|---|---|
| `1.124.2` Node 24.15.0 + `/mnt/d` 性能 | watch / 启动慢，文件监听可能不稳 | 用户已批准在 `/mnt/d` 路径，性能问题等首次 watch 完成后评估 |
| Markdown round-trip 风险 | 块编辑可能造成数据损失 | Gate E 强制阻塞 Phase 3 |
| `.mm` 富文本兼容 | XMind / FreeMind 各家扩展属性不一 | preservation 模型 + fixture 测试，必要时降级 raw |
| Canvas 第三方库许可证（tldraw / React Flow） | bundle 法务风险 | Phase 0 Task 0.11 决定 |
| 中文 IME 与 / menu / keybinding 冲突 | 用户体验严重受损 | composition guard + 专项测试矩阵 |
| Marketplace 法务 | 默认指向 MS Marketplace 涉嫌违反 ToS | 默认走 Open VSX 或纯 VSIX |

---

## 9. 文档索引

- `docs/plans/000-vsword-master-plan.md` — 总规划（已存在）
- `docs/plans/001-phase0-execution-plan.md` — Phase 0 执行计划（已存在）
- `docs/plans/002-development-task-breakdown.md` — **新增**，任务拆解
- `docs/requirements/PRD-vsword-v1.md` — **本文**
- `docs/requirements/FR-01-notion-block-editor.md` — **新增**，块编辑器需求切片
- `docs/requirements/FR-02-mindmap-xmind-parity.md` — **新增**，思维导图需求切片
- `docs/requirements/FR-03-canvas-miro-parity.md` — **新增**，Canvas 需求切片
- `docs/research/phase0-vsword-feature-architecture.md` — 架构预研（已存在）
- `docs/decisions/0001-repository-strategy.md` — 仓库策略（已存在）
- `docs/phase0/baseline-selection.md` — baseline 选择（已存在）
- `docs/phase0/source-checkout-report.md` — 源码 checkout 报告（已存在）

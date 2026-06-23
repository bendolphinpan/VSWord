# VSWord 开发任务拆解（给 fullstack-developer 子代理执行）

> **配套文档**：`PRD-vsword-v1.md` / `FR-01-notion-block-editor.md` / `FR-02-mindmap-xmind-parity.md` / `FR-03-canvas-miro-parity.md`
> **执行模式**：每个任务以独立 subagent 调用 `fullstack-developer` 完成。每完成一个任务，主代理（Hermes）按对应 FR 文档逐项验收。**未通过验收禁止进入下一任务**。
> **作者**：Hermes 主代理
> **日期**：2026-06-18

---

## 0. 全局规则（fullstack-developer 必读）

1. **绝对路径规范**
   - 工作区根：`D:\GIT\VSWord`（WSL: `/mnt/d/git/VSWord`）
   - Code OSS 源码：`D:\GIT\VSWord\code-oss`（baseline tag `1.124.2`，HEAD `6928394f91b684055b873eecb8bc281365131f1c`）
   - VSWord 模块根：`D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\`（**不存在则需创建**）
   - 测试 fixture 根：`D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\test\fixtures\`
   - 文档：`D:\GIT\VSWord\docs\`

2. **Git 策略**
   - 当前分支 `dev`（已 push to origin/dev）
   - **每个任务一个 commit**，commit 信息：`<type>(<scope>): <desc>`，例如 `feat(canvas): add canvas service skeleton`
   - 不直接合并到 main，由主代理审阅后决定

3. **不可触碰**
   - **不修改** Code OSS 核心 editor / Extension Host / FileService 内部实现，只通过 contribution 注册
   - **不引入** 任何依赖前必须先在任务里说明用途、许可证、bundle 影响，由主代理确认
   - **不删除** Copilot 相关源码，仅通过产品配置 / 默认设置 / 注册条件禁用其默认入口（任务 T-1.3 详述）

4. **每个任务结束的交付清单**（缺一项视为未完成）
   - 修改文件清单（绝对路径）
   - 新增依赖清单 + 许可证 + bundle 大小估算
   - 自测执行命令 + 输出片段
   - 已知缺陷 / 风险 / 后续 TODO
   - 关联的验收清单条目（FR 文档中哪些项已过）

5. **Skill 调用规范**
   每个任务开始前 fullstack-developer 必须 `skill_view` 这两个 skill：
   - `agents/fullstack-developer`
   - 涉及 Code OSS baseline 时：`fullstack-developer` skill 中的 `references/code-oss-baseline-workflow.md` 与 `references/code-oss-watch-and-launch.md`

---

## 1. 任务依赖图

```text
T-0.1 baseline build 验证（强阻塞）
  ↓
T-1.1 vsword contrib 骨架  ──┬──→  T-1.3 Copilot 默认移除
                             │
                             ├──→  T-1.2 Writer Workbench Shell
                             │
                             ↓
T-2.1 Markdown core service  ──→  T-2.2 round-trip fixtures (Gate E)
                                       ↓
                              T-3.1 Block editor spike (TipTap PoC)
                                       ↓
                              T-3.2 Block editor MVP (FR-01)
T-4.1 Canvas spike (tldraw vs ReactFlow) (Gate D + license)
              ↓
       T-4.2 Canvas service + storage
              ↓
       T-4.3 Canvas MVP (FR-03)
              ↓
       T-4.4 Canvas 文件生命周期闭环（暂存盘/恢复/真实删除/拖拽粘贴）
T-5.1 .mm parser/writer + Gate F fixtures
              ↓
       T-5.2 Mindmap MVP (FR-02)
```

任务间凡无箭头依赖均可并行。建议默认串行执行，必要时主代理按风险开并行（如 T-4.1 与 T-5.1 可并行 spike）。

---

## 2. 任务清单

### Phase 0 收尾

#### T-0.1 — Baseline Build / Watch / Launch 验证（**强阻塞**）

**前置**：`docs/phase0/source-checkout-report.md` Gate A 后三项 (`build / watch / launch`) 仍未勾。

**目标**：在 `D:\GIT\VSWord\code-oss` 上完成 unmodified baseline 的 install / watch / launch，证明 1.124.2 在当前 WSL/Windows 环境下可用。

**步骤建议**：
1. 在 WSL 中确认 Node 24.15.0（参考 `code-oss/.nvmrc`）；若需安装新版本，先报告再做。
2. `npm install` → 日志写到 `D:\GIT\VSWord\docs\phase0\logs\npm-install.<date>.log`。
3. `npm run watch`（或先 `npm run compile` 出一份 baseline 编译产物） → 日志同上。
4. WSL 启 X：`./scripts/code.sh --version` 或先 `npm run electron` 准备 electron shell（参见 fullstack-developer skill 的 `code-oss-watch-and-launch.md`）。
5. 启动后访问内置 Markdown preview，确认无功能损坏。

**验收**：
- `git status` 在 `code-oss/` 内仍干净（未跑测试期间不应改源）
- 三类日志都齐
- 截图或文字记录"已成功启动并可看到 Welcome 页"
- 更新 `docs/phase0/source-checkout-report.md` 的 Gate A 复选框

**风险**：
- `/mnt/d` 路径文件监听慢——若 watch 卡住 > 10 分钟仍未达 idle，立即停下来汇报，不要自行迁移路径。

---

### Phase 1 — Writer Workbench Shell

#### T-1.1 — VSWord contrib 模块骨架

**前置**：T-0.1 通过。

**目标**：创建 `src/vs/workbench/contrib/vsword/` 完整目录骨架并接入 workbench contribution registry，**不实现任何功能**，仅打通"模块存在 + 可被 workbench 加载 + 一个 Hello 命令可运行"。

**文件结构**（按 `docs/research/phase0-vsword-feature-architecture.md` §1.1）：
```
code-oss/src/vs/workbench/contrib/vsword/
├── common/
│   ├── vswordTypes.ts
│   └── vswordConfiguration.ts
├── browser/
│   ├── vsword.contribution.ts        # 主注册入口
│   └── vswordHelloAction.ts          # 占位命令：Show "VSWord Hello"
├── services/
│   └── (空，下个任务填充)
└── test/
    └── browser/
```

**实施要点**：
- `vsword.contribution.ts` 在 `Registry.as(WorkbenchContributionsRegistry).registerWorkbenchContribution(...)` 注册。
- 在 `code-oss/src/vs/workbench/workbench.common.main.ts`（或对应 main 入口）添加一行 `import './contrib/vsword/browser/vsword.contribution.js';`。
- 提供命令 `vsword.dev.hello`，触发后用 `notificationService.info('VSWord is alive')`。
- 暂不涉及 webview / custom editor。

**验收**：
- watch 产物中包含 vsword 模块
- 命令面板可搜到并执行 `VSWord: Hello`
- 关闭后再开仍生效
- 不破坏 Gate A

**修改文件清单上限**：≤ 8 个文件，且仅 1–2 个为 Code OSS 原文件（注册 import 行）

---

#### T-1.2 — Writer Workbench Shell（隐藏程序员默认噪音）

**前置**：T-1.1 通过。

**目标**：调整默认 UI，使 VSWord 启动后默认对写作者友好，但**不删除**任何 Code OSS 功能。

**实现要点**：
- 默认隐藏视图（通过 `product.json` 默认设置 + workbench 默认配置覆盖）：
  - Run and Debug
  - Terminal panel（默认折叠）
  - Source Control（**保留按钮但默认折叠**——Git 是 Won't Do W-6 的替代，必须可一键调出）
  - Outline / Timeline 默认面板可见
- 默认显示：
  - VSWord Home（先做占位 view container，注册 view `vsword.home`，后续 T-1.4 再填内容）
  - Explorer
  - Search
  - Extensions
- 默认主题：保留 VS Code 默认 dark/light，不强制写作主题（P1 再做）
- Activity Bar 顺序：Home → Explorer → Search → SCM → Extensions → 其他

**验收**：
- 启动后 Home 占位面板可见
- Debug / Terminal / SCM 可通过 View 菜单 / 命令面板调出
- 安装一个第三方扩展验证 Extensions 视图正常（FR-PRD Gate B 部分项）

---

#### T-1.3 — Copilot 默认移除（**Gate C**）

**前置**：T-1.1 通过。本任务可与 T-1.2 并行。

**目标**：移除默认 Copilot 入口、欢迎页推荐、`defaultChatAgent` 等绑定，**保留**用户自行安装 AI 扩展的能力。

**操作步骤**：
1. 在 `code-oss/` 内全文 grep `copilot` / `Copilot` / `defaultChatAgent` / `chat.experimental.defaultAgent` 等关键字，列出所有出现位置（写入 `docs/phase0/copilot-removal-report.md`）。
2. 在 `product.json` 中：
   - 移除 `defaultChatAgent` 字段（如有）
   - 移除 `extensionRecommendations` 中所有 copilot 相关项
   - 移除 / 替换 `welcomePageExtensions` / `getStarted` 中 copilot 引导
3. 在 `extensions/` 下确认是否有 bundled copilot 扩展（按 `code-oss/extensions/copilot` 之类目录）。**MVP 阶段策略：暂不删除目录，但不通过 product.json 推荐，且默认禁用**。
4. 启动后验证：
   - 命令面板搜不到默认的 "Copilot:" 命令（除非用户自己装了扩展）
   - Welcome 页无 Copilot 推荐
   - 状态栏无 Copilot 入口
   - 网络监控（手工抓包或浏览器 DevTools）：首次启动**不**调用 `*.copilot.com` / `*.githubcopilot.com` / `*.openai.com`

**验收**：
- `docs/phase0/copilot-removal-report.md` 含完整 grep 结果 + 改动清单
- 用户安装第三方 AI 扩展（如 Continue / Cline）后，扩展正常工作
- PRD Gate C 全 ✅

---

#### T-1.4 — VSWord Home 占位页

**前置**：T-1.2 通过。

**目标**：填充 VSWord Home 视图，提供：
- 最近打开文件 / 文件夹列表（用 `IWorkspacesService.getRecentlyOpened`）
- "新建 Markdown 文档" 按钮（占位，命令 `vsword.newMarkdownDocument`，先创建 `untitled-<timestamp>.md` 即可）
- "打开文件夹为 Canvas" 按钮（占位，提示"Canvas 模块尚未实现"）
- "打开思维导图" 按钮（占位）

**验收**：
- Home 视图可见，按钮可点
- "新建 Markdown" 可创建文件并打开
- 其他按钮显示 toast "Coming in T-3 / T-4 / T-5"

---

### Phase 2 — Markdown Core

#### T-2.1 — Markdown 文档服务 + frontmatter + 字数统计

**前置**：T-1.1 通过。

**目标**：实现 `VswordDocumentService`：
- 解析 YAML frontmatter，未知字段保留
- 中英文混排字数统计（CJK 按字 / Latin 按 word）
- 状态栏字数 item
- 命令 `vsword.document.showWordCount`

**依赖建议**：
- `gray-matter`（MIT，~10KB） 或自实现简单 YAML frontmatter 拆分（避免 YAML 全量解析时丢注释）
- 字数统计自实现 + 单测

**验收**：
- 单测覆盖：CJK/EN/混排/数字/带 frontmatter 文档
- 状态栏在打开 `.md` 时显示"字数: XXX"
- 切换文档自动刷新

---

#### T-2.2 — Markdown round-trip fixture 集（**Gate E**）

**前置**：T-2.1 通过。

**目标**：建立 `code-oss/src/vs/workbench/contrib/vsword/test/fixtures/markdown/` fixture 集，并实现 round-trip 测试 harness（不依赖 UI，纯 model 层）。

**Fixture 文件**（每个文件附原始预期 hash）：
- simple.md
- frontmatter-with-comments.md
- mixed-cjk-en.md
- tables.md
- html-block.md
- unknown-directives.md
- nested-lists.md
- code-fences-various-languages.md
- task-list.md
- huge-1mb.md（合成）

**测试**：
1. parse → serialize → 与原文 byte 比较：未修改场景必须 byte-for-byte 一致或仅白名单 EOL 差异
2. 修改单段文本 → 仅该段范围被改
3. 未识别 directive 原样保留

**验收**：
- 所有 fixture 测试通过
- `docs/phase0/markdown-roundtrip-spike.md` 记录技术选型（remark / unified 配置）+ 已知白名单差异
- PRD Gate E 全 ✅

---

### Phase 3 — Block Editor

#### T-3.1 — Block editor 内核 spike（TipTap）

**前置**：T-2.2 通过。

**目标**：在隔离的 `code-oss/src/vs/workbench/contrib/vsword/browser/blockEditor/` 下做 webview spike：
- TipTap 加载，最小 starter kit
- Markdown 输入 → 渲染（用 prosemirror-markdown 或 remark 适配）
- 输入修改 → serialize 回 Markdown
- 中文 IME composition guard 验证
- bundle size 测量

**交付**：
- spike 代码 + `docs/phase0/block-editor-spike.md`（含许可证 / bundle / IME 测试结果 / 性能初测）

**验收**：
- 主代理评审通过 spike 报告，决定是否进入 T-3.2

---

#### T-3.2 — Block editor MVP（FR-01）

**前置**：T-3.1 评审通过。

**目标**：按 `FR-01-notion-block-editor.md` 实现 P0 全部能力。

**子任务建议拆分**（fullstack-developer 自行决定 PR 粒度，但每个 PR 必须有验收）：
1. Custom editor 注册 + webview 通信协议
2. 块模型 ↔ Markdown AST 双向映射
3. § 2.1 P0 块类型实现
4. § 2.2 P0 内联样式实现
5. § 2.3 P0 交互实现（slash menu / 拖拽 / 多选）
6. 写回策略 + 外部修改冲突检测
7. 中文 IME 矩阵专项测试
8. 性能测试（1MB / 5MB）

**验收**：FR-01 §5 全部勾选

---

### Phase 4 — Canvas

#### T-4.1 — Canvas 渲染库 spike（tldraw vs React Flow）

**前置**：T-1.1 通过。可与 T-2.* 并行。

**目标**：分别用 tldraw 和 React Flow 做最小 PoC（webview 内）：
- 渲染 10 / 100 / 500 个文件卡片
- 测连线、frame、拖拽、缩放
- 测许可证、bundle 大小、CSP 兼容
- 测自定义节点（VSWord 文件卡片）实现成本

**交付**：
- 两份 PoC 代码
- `docs/phase0/canvas-renderer-spike.md` 含选型推荐 + 理由 + 主代理决策记录

**验收**：主代理选定渲染库进入 T-4.2

---

#### T-4.2 — Canvas service + storage

**前置**：T-4.1 决定后。

**目标**：实现 `VswordCanvasService` 与 `.vsword/canvas/` 存储层（**先不做 UI**）：
- schema v1（FR-03 §3.2）
- index.json 维护
- 加载 / 保存 / 迁移
- 文件系统事件订阅（rename / delete / change）→ 节点状态同步
- 单元测试

**验收**：
- 单测覆盖 schema / index / 迁移 / 文件事件
- `.vsword/canvas/` 文件可被 Git 友好 diff（节点 ID 排序）

---

#### T-4.3 — Canvas MVP（FR-03）

**前置**：T-4.2 通过。

**目标**：按 `FR-03-canvas-miro-parity.md` 实现 P0 全部能力。

**验收**：FR-03 §6 全部勾选

---

#### T-4.4 — Canvas 文件生命周期闭环（阶段成果交付）

**前置**：React Flow Canvas 已具备打开文件夹、自动发现直接子项、节点拖拽/缩放/连线、tab 恢复、viewport 恢复、安全删除节点。

**目标**：一次性交付完整文件生命周期闭环，避免用户反复验收零散小功能：

1. **安全删除闭环**
   - Delete/Backspace 仍只从 Canvas 移除 file/folder 节点，不删除磁盘文件。
   - 被移除但仍存在于当前文件夹的 file/folder 自动进入暂存盘列表。
   - 删除节点时清理相关边。

2. **暂存盘 / 未上画布面板**
   - UI 显示 `暂存盘 (N)`。
   - N = 当前文件夹直接子项中未被 canvas.json 引用的 file/folder 数。
   - 面板支持刷新、单项放回、全部放回。
   - 放回后创建 file/folder 节点，默认放到当前视口中心或网格排布位置。

3. **真实删除文件/文件夹**
   - 暂存盘条目支持 `真实删除…`。
   - 必须二次确认，明确显示目标名称。
   - 优先走系统回收站/Trash；若当前平台/API 只能永久删除，确认文案必须写明"永久删除"。
   - 删除后刷新暂存盘与 Canvas 状态。

4. **拖拽加入 Canvas + 文件夹**
   - OS / Explorer 文件拖入 Canvas 时，保证文件存在于当前 Canvas 文件夹内。
   - 当前文件夹内文件：只建/恢复节点，不复制。
   - 当前文件夹外文件：复制到当前文件夹或 `assets/` 后创建节点。
   - 同名冲突自动追加后缀，不覆盖已有文件。

5. **粘贴加入 Canvas + 文件夹**
   - 粘贴文件列表：复制到当前 Canvas 文件夹并创建节点。
   - 粘贴图片数据：写入 `assets/pasted-*.png` 并创建节点。
   - 粘贴 URL/文本：创建 URL 或 Note 节点（P0 可先 Note）。

**修改文件清单上限**：优先限制在 VSWord Canvas 相关文件内：
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\common\canvasTypes.ts`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\common\canvasService.ts`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\reactFlowCanvasAction.ts`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\build-reactflow-spike.cjs`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\README.md`

**验收 Gate（阶段成果一次验收）**：
- [ ] 删除 Canvas 上的文件节点后，磁盘文件仍存在，暂存盘数量 +1。
- [ ] 从暂存盘放回该文件，Canvas 节点恢复，reload 后仍存在。
- [ ] 从暂存盘真实删除文件，有二次确认；确认后磁盘文件消失，暂存盘刷新。
- [ ] 子文件夹删除/放回/真实删除遵循同样语义。
- [ ] 从外部拖入文件后，文件出现在当前 Canvas 文件夹内，Canvas 出现节点。
- [ ] 粘贴图片后，`assets/` 下出现图片文件，Canvas 出现节点。
- [ ] 同名文件拖入/粘贴不会覆盖原文件。
- [ ] `npm run compile` 0 errors；root `package.json/package-lock.json` 无变化。

---

#### T-4.5 — Canvas 文件节点体验模块（阶段成果交付）

**前置**：T-4.4 通过；React Flow Canvas 已具备安全删除、暂存盘、恢复、真实删除、拖拽/粘贴写入能力。

**目标**：按 `D:\GIT\VSWord\docs\requirements\FR-04-canvas-file-node-experience.md` 实现 P0：图片预览、Markdown/文本摘要、未知文件 fallback、文件夹视觉区分、预览开关一致性、稳定卡片尺寸。

**修改文件清单上限**：优先限制在：
- `D:\GIT\VSWord\docs\requirements\FR-04-canvas-file-node-experience.md`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\reactFlowCanvasAction.ts`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\build-reactflow-spike.cjs`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\vendor\style.css`
- `D:\GIT\VSWord\code-oss\src\vs\workbench\contrib\vsword\browser\spikes\reactflow\README.md`

**验收 Gate（阶段成果一次验收）**：
- [ ] 图片文件节点显示缩略图，拖入/粘贴后也立即显示。
- [ ] Markdown/文本文件显示摘要；未知文件不读二进制，显示 fallback。
- [ ] `Show/Hide preview` 对图片、Markdown、文本、fallback 一致。
- [ ] 节点 hover、图片加载、resize 不造成扩高/重排。
- [ ] Delete → Tray → Restore 后预览仍正常。
- [ ] React Flow bundle build 通过；`npm run compile` 0 errors；root `package.json/package-lock.json` 无变化。
- [ ] 完成代码审查：CSP 不放开远程脚本，图片 URI 只来自 workspace/folder resource，二进制不误读。

---

### Phase 5 — Mindmap

#### T-5.1 — `.mm` parser/writer + Gate F fixtures

**前置**：T-1.1 通过。可与 Phase 2/4 并行。

**目标**：
- 选定 XML 库（fast-xml-parser 优先）
- 实现 `.mm` ↔ `VswordMindmapDocument`（FR-02 §3.3 schema）
- preservation 模型实现
- fixture 集 + round-trip 测试
- `docs/phase0/mm-preservation-spike.md`

**Fixture 集**（FR-02 §6.1）：
- freemind-basic.mm / freemind-icons.mm / richcontent.mm
- unknown-attrs.mm / unknown-children.mm / large-1k-nodes.mm
- xmind-exported.mm

**验收**：FR-02 §6.1 全部勾选 → PRD Gate F ✅

---

#### T-5.2 — Mindmap MVP（FR-02）

**前置**：T-5.1 通过。

**目标**：按 `FR-02-mindmap-xmind-parity.md` 实现 P0 全部能力。

**子任务建议**：
1. Custom editor 注册 + 视图切换（思维导图 / 树形 / 组织结构 / 逻辑图）
2. SVG 渲染 + 布局算法（Reingold-Tilford）
3. 节点编辑 / 增删 / 拖拽 / 折叠
4. 图标 / 颜色 / 备注 / 链接 / 关系线
5. Markdown ↔ `.mm` 互转（带有损提示）
6. 中文 IME 测试
7. 性能测试（1k / 10k 节点）

**验收**：FR-02 §6 全部勾选

---

## 3. 主代理验收流程

每个任务完成后，fullstack-developer 提交报告。主代理执行：

1. **代码审查**
   - `git diff` 范围合理
   - 无对 Code OSS 核心的不当侵入（grep 检查）
   - 命名 / 注释 / 错误处理符合规范
2. **功能验收**
   - 跑 fullstack-developer 提供的自测命令
   - 手动复现 §2 关键路径
   - 对照 FR 文档勾验收清单
3. **回归**
   - Gate A baseline 仍可启动
   - Gate B 扩展仍可装/卸（每个 Phase 至少一次完整 smoke）
   - Gate C Copilot 仍未默认引入
4. **决策**
   - PASS：合入 dev，进入下一任务
   - FAIL：写明原因 + 必修项，回退给 fullstack-developer
   - PARTIAL：列出可延后修的小项，主任务先合，留 follow-up issue

---

## 4. 风险与升级路径

| 风险 | 触发条件 | 升级动作 |
|---|---|---|
| baseline build 持续失败 | T-0.1 累计 > 3 次失败 | 暂停所有下游任务，主代理评估是否切到 Windows native build |
| 中文 IME 测试不过 | T-3.1 spike 阶段无法解决 | 暂停 T-3.2，主代理评估是否换 ProseMirror 直接实现 |
| Canvas 库许可证不清 | T-4.1 spike 报告标红 | 暂停 T-4.2，主代理评估是否自实现轻量渲染 |
| `.mm` round-trip 不达标 | T-5.1 fixture 测试失败 | Phase 5 降级为只读 mindmap 编辑器（先不写回） |
| 扩展兼容回归 | 某次 PR 后 Gate B 失败 | 立即回滚该 PR |

---

## 5. 当前状态

- ✅ PRD / FR-01 / FR-02 / FR-03 / 本任务拆解 已完成
- ⏳ T-0.1 baseline build 待启动（**需要用户批准**）
- ⏳ T-1.1 contrib 骨架 等 T-0.1
- ⏳ 其他全部待启动

---

## 6. 下一步（等待用户批准）

主代理建议按下列顺序推进，每步都先与用户确认：

1. **批准下发 T-0.1**：fullstack-developer 子代理执行 baseline 验证（这是首次实质性占用磁盘 / 执行 npm install，必须用户明确批准）
2. T-0.1 通过后，**批准下发 T-1.1**（首次实际写 vsword 源码）
3. 之后按依赖图推进

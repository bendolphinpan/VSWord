# PRD · 模块 b · Mermaid 图表（T-3.5b）

> **文档定位**：Phase 3 模块 b（Mermaid 图表）的产品需求文档 v1。
> 承接 `003-master-development-plan.md` §4a 决策 **F-1 = B 全套**（Mermaid + Flowchart.js + js-sequence-diagrams），本 PRD 只覆盖其中的 **Mermaid** 部分（T-3.5b.1 + 懒加载 T-3.5b.4 归属本模块；T-3.5b.2 Flowchart.js / T-3.5b.3 js-sequence-diagrams 后续独立 PRD）。
> **作者**：PM Agent
> **创建**：2026-07-04
> **前置**：模块 a Round-trip 保真层已完成（commit `2f93e63c..bd7cdc1e`，push `origin/dev`）。
> **命名**：沿用 plan 原始 T-号（`T-3.5b.1~5`），不使用 body 里的 `T-3.b.1` 简写，避免与 T-3.6 双链等冲突。

---

## 1. 背景

- VSWord 是 Code-OSS fork 里的 Milkdown 富文本编辑器，Markdown 是唯一持久层格式。
- Typora 三件套（Mermaid + Flowchart.js + js-sequence-diagrams）是决策 F-1=B 的既定复刻目标，其中 Mermaid 覆盖面最广、生态最活跃、优先启动。
- 现有可复用参考：
  - `math-view.template.js`（T-3.9）— **点击预览 → textarea + live preview + Esc/Ctrl+Enter commit + KaTeX 错误红条**，是本模块的**首选原型**（用户 body 提到 mindmap NodeView 最接近，但 mindmap 是独立 `.mm` 文件类型，与 Milkdown 内嵌 NodeView 场景不匹配；math NodeView 才是内嵌 code-block-like 原子节点的直接参照）。
  - `code-block-chrome.template.js`（T-3.7 commit / plan T-3.3.5）— Prism 高亮 + 语言选择 + 复制 + keymap，代码块 chrome 层已就位。
  - `roundtrip-tracker.template.js` + `blockIdAllocator.ts`（T-3.8）— mermaid fence 走 `code_block` 通道，`blockId` / `dirtyBlockContents` **无需破 Round-trip 契约**（build-result.json 已含 ` ```mermaid` fixture 通过校验）。
- Milkdown vendor：`@milkdown/*@7.21.2` ESM bundle，webview CSP 禁用 `eval` / `new Function`。
- Bundle 现状：`webviewBundleGzipBytes = 294 KB`；Mermaid v11 完整包 min+gzip 约 700–900 KB —— 懒加载是硬约束。

---

## 2. 目标（Goals）

1. **G1 · Inline 渲染**：Markdown 里 ` ```mermaid ` 代码块在 Milkdown WYSIWYG 视图下自动渲染为图形，与正文流一同显示，不需要用户切换到源码模式。
2. **G2 · 点击编辑**：点击图形进入源码编辑，实时预览（live preview），Esc 取消 / Ctrl+Enter 或失焦 commit，回写到 `code_block` 节点。
3. **G3 · Round-trip 零破坏**：mermaid 图块的持久化格式**永远是** ` ```mermaid\n...\n``` ` 三反引号 fence code block，byte-for-byte 与用户输入一致；不引入 HTML `<svg>` 内嵌、不引入自定义 fence 语法。
4. **G4 · 图类型覆盖**：P0 覆盖 Mermaid 官方文档 v11 全部**稳定**图类型，P1 覆盖 beta 类型，P2 保留扩展位。
5. **G5 · 语法错误可见**：mermaid 解析失败时用户能一眼看到错误信息与行号提示，且不阻塞其他块。
6. **G6 · 首屏零负担**：Mermaid runtime 首屏不打包进 webview bundle，仅当文档里出现第一个 mermaid 块时动态 import。
7. **G7 · UI 可换皮**：所有用户可触发动作（进入编辑、切主题、复制源码、导出 svg）走命令注册；主题跟随 Code OSS 明暗主题的**联动逻辑**放在 host 侧独立 service。

---

## 3. 非目标（Non-Goals）

- **NG1**：不做 mermaid **可视化拖拽建图**（画布式节点连线编辑）。保持"源码 + 实时预览"模型。
- **NG2**：不做 Flowchart.js / js-sequence-diagrams（属 T-3.5b.2 / T-3.5b.3，独立 PRD）。
- **NG3**：不做**独立文件类型** `.mmd`（Mermaid 只作为 Markdown 内嵌代码块存在）。
- **NG4**：不做**图片导出到 assets/** 自动固化（保持源码可编辑；导出 svg/png 是用户显式命令，非默认路径）。
- **NG5**：不做 CSS 主题**深度定制**（跟随 Phase 3 "好看放一放"policy，只做 Code OSS light/dark 二档跟随，视觉细调延后到 UI 整合阶段）。
- **NG6**：不接入 mermaid v10（一步到位 v11.x 官方稳定版；如遇 v11 特定图类型不稳，用 P1/P2 降级处理，不切 v10）。

---

## 4. 用户故事

- **US-1 · 阅读者**：作为写作者，我在 md 里写了 ` ```mermaid flowchart LR\n A-->B\n``` `，我打开 VSWord 后应该看到渲染出的流程图而不是原始代码，跟 Typora / Obsidian 预览模式一致。
- **US-2 · 编辑者**：作为写作者，我点击已渲染的流程图，想直接在图的位置进入源码编辑，同时能看到我每敲一个字符图形都实时变化，Esc 取消 / Ctrl+Enter 提交回到只读预览。
- **US-3 · Debug 者**：作为写作者，我写坏了一行 mermaid 语法，编辑器应该在编辑区下方告诉我哪一行出错、错误消息是什么，而不是整个图消失或者整个编辑器崩溃。
- **US-4 · 主题跟随者**：作为夜间写作者，我在 Code OSS 里切了 dark 主题，mermaid 图应该自动切换到 dark 配色（黑底/浅色线条），不需要我手动改配置。
- **US-5 · Round-trip 洁癖者**：作为版本管理用户，我 git diff 一个只改了正文标点、没动图的 md 文件，应该只看到正文那一行变化，mermaid 代码块本体 byte-for-byte 与原文件一致，不应该出现 lang tag 大小写变化、缩进变化、trailing newline 变化等副作用。

---

## 5. 特性清单与图类型分级

### 5.1 核心功能特性

| 特性 | 说明 | 优先级 |
|------|------|--------|
| F-01 | Inline NodeView：`code_block[lang=mermaid]` 渲染为 mermaid SVG | Must |
| F-02 | 点击图形进入编辑，textarea + live preview | Must |
| F-03 | Esc / 失焦 / Ctrl+Enter commit 到 ProseMirror `tr.setNodeMarkup`（保持 code_block 类型） | Must |
| F-04 | 语法错误 banner：错误消息 + 行号（mermaid parseError 若含行号则取，否则显示第一行） | Must |
| F-05 | 主题联动：Code OSS light → mermaid `default`，dark → mermaid `dark`（写死映射，Phase 3 不做用户配置） | Must |
| F-06 | Mermaid runtime 懒加载：首个 mermaid 块进入视口 / 首次 mount 时动态 import | Must |
| F-07 | 命令 `vsword.markdown.mermaid.copySource` 复制源码到剪贴板 | Should |
| F-08 | 命令 `vsword.markdown.mermaid.exportSvg` 导出 svg 到用户选择的路径 | Should |
| F-09 | 命令 `vsword.markdown.mermaid.exportPng` 导出 png（走 svg → canvas → toBlob） | Could |
| F-10 | 空 mermaid 块占位符 "空图 — 点击编辑"（mirror math-view 空态） | Should |
| F-11 | 只读模式（editable=false）下点击图不进入编辑 | Should |
| F-12 | slash menu `/mermaid` 插入空 mermaid 块（可选，若 T-3.3.3 slash menu 已就位则挂上） | Could |
| F-13 | Round-trip：mermaid 块走 `code_block` 通道，blockId + dirtyBlockContents 上报 `code_block` 类型，unchanged 场景 byte-for-byte | Must |
| F-14 | 状态服务：`vswordMermaidLoaded` context key（用于命令 when 表达式） | Should |
| F-15 | webview ↔ host 协议：mermaid 相关消息类型统一走 `milkdownEditorProtocol.ts` 已有 pattern | Must |

### 5.2 图类型分级（Mermaid v11.x）

按 mermaid 官方文档 v11 稳定性 + 用户高频度综合分级。**默认假设，等 Q5 用户拍板可推翻**。

| 级别 | 图类型 | 说明 |
|------|--------|------|
| **P0**（GA 必过） | flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, pie, gantt | Typora 生态最常用 7 类，官方 GA，测试 fixture 强制覆盖 |
| **P1**（GA 应过） | journey, gitGraph, mindmap, timeline, quadrantChart, requirementDiagram, C4Context/C4Container | v11 GA，fixture 覆盖 smoke 级即可 |
| **P2**（beta 观察） | sankey-beta, xyChart-beta, block-beta, packet-beta, architecture-beta, kanban, radar-beta, treemap | mermaid v11 beta，出错走 F-04 错误 banner 通道即可，**不列入验收 AC** |

Mermaid 内部注册表决定：只要底层 `mermaid.render()` 支持，我们**无需在 VSWord 侧做类型白名单**，理论上"库支持啥都能画"。P0/P1 只是**测试 fixture 与用户可见承诺**的粒度差异。

---

## 6. 验收标准（Acceptance Criteria · Given/When/Then）

### AC-1 · Inline 渲染（G1, US-1）

> **Given** 一个 Markdown 文件包含 ` ```mermaid\nflowchart LR\n  A --> B\n``` `
> **When** 用户在 VSWord 打开该文件
> **Then** 编辑器视图中该代码块位置应渲染出对应的 SVG 流程图，源码代码块本身不可见；SVG 应包含节点 A、B 及其连线。

### AC-2 · 点击编辑（G2, US-2）

> **Given** 已渲染的 mermaid 图正显示
> **When** 用户单击图形任意位置
> **Then** 图形下方（或原位）应出现一个 textarea，加载当前 mermaid 源码；textarea 获得焦点；图形保持可见（继续显示 live preview）；每次 textarea `input` 事件后 300ms 内预览应刷新。

### AC-3 · Commit / Cancel（G2）

> **Given** 用户正在编辑 mermaid 源码
> **When** 用户按 `Esc`
> **Then** textarea 消失，图形回到编辑前的源码渲染结果，ProseMirror doc **不产生 transaction**。
>
> **And When** 用户按 `Ctrl+Enter` 或 textarea 失去焦点
> **Then** textarea 消失，最新源码通过 `tr.setNodeMarkup(pos, null, { ...attrs })`（或等价 code_block 内容替换）写回 doc，触发一次 `dispatch`。

### AC-4 · 语法错误反馈（G5, US-3）

> **Given** 用户输入 `flowchart LR\n A -->>`（不完整语法）
> **When** live preview 触发渲染
> **Then** 编辑区下方应出现红色 error banner，文本为 mermaid `parseError.str` 或 `err.message` 首行；预览区回到"上一次成功渲染"或显示占位符（**Q4 待定，见方向性问题**）；文档其他块继续正常工作，编辑器不崩溃。

### AC-5 · Round-trip byte-for-byte（G3, US-5）

> **Given** 一份 md 含 mermaid 块，用户仅编辑正文一行（未触碰 mermaid 块）
> **When** 保存并对比原文件
> **Then** mermaid 代码块（含 fence 首行 ` ```mermaid`、内容、fence 尾行 ` ``` `、trailing newline）与原文件 byte-for-byte 一致；`dirtyBlockContents` 上报中不应包含该 mermaid 块的 blockId。

### AC-6 · 主题联动（G7, US-4）

> **Given** VSWord 当前使用 Code OSS `Dark+` 主题
> **When** 用户切换到 `Light+` 主题
> **Then** 已渲染的 mermaid 图应在 500ms 内重渲染为 `mermaid.initialize({ theme: 'default' })` 效果；反之切回 dark 时应变回 `theme: 'dark'`；切换过程中源码不变、Round-trip 无副作用。

### AC-7 · 懒加载（G6）

> **Given** 一个不含任何 mermaid 块的 md 文件
> **When** 用户打开该文件
> **Then** Chrome DevTools Network 应显示 mermaid runtime chunk **未加载**；webview bundle gzip 尺寸相比基线 (`vendor/build-result.json`) 增长应 ≤ 30 KB（仅包含懒加载 stub + NodeView 代码）。
>
> **And When** 用户打开另一个含 mermaid 块的 md 文件
> **Then** mermaid runtime chunk 应在首个 mermaid NodeView mount 时被动态 import，加载完成后自动触发首次渲染；重复打开第二个含 mermaid 的文件时应命中 module cache 不重复请求。

### AC-8 · P0 图类型全绿（G4）

> **Given** 测试 fixture 包含 P0 全部 7 种图类型的最小有效示例
> **When** 打开 fixture 文件
> **Then** 每种图类型均应成功渲染出可见 SVG（`<svg>` 节点存在且 `width > 0`），无 mermaid parseError 抛出。

### AC-9 · 只读模式无编辑（F-11）

> **Given** 编辑器处于 preview / read-only 模式（T-3.7b.2）
> **When** 用户点击 mermaid 图
> **Then** 不进入编辑态，无 textarea 出现，鼠标 cursor 保持默认；如有 F-07 复制源码命令仍可通过右键菜单触发。

### AC-10 · 空块占位（F-10）

> **Given** 一个空的 mermaid 代码块 ` ```mermaid\n\n``` `
> **When** 渲染
> **Then** 图区显示占位文本"空图 — 点击编辑"，点击后进入 textarea，与 math-view 空态一致；此时无 mermaid parseError 触发。

---

## 7. 技术约束

- **C-1**：mermaid 图作为 Milkdown/ProseMirror **NodeView** 附着于 `code_block` schema，`node.attrs.language === 'mermaid'` 触发；**不新建 schema**，避免破 Round-trip。
- **C-2**：webview CSP 已禁用 `eval` / `new Function`，mermaid v11 SVG rendering 走 `document.createElementNS` 路径，需在 spike 阶段确认无 `Function()` 构造调用（v10 的 `sequenceDiagram` 曾有 `Function` 用法，v11 已移除，但仍需 verify）。
- **C-3**：mermaid runtime 通过 `vendor/mermaid.chunk.js` 独立 chunk 输出，`entry.template.js` 里用动态 `import('./mermaid.chunk.js')` 触发；构建脚本 `build-milkdown-editor.cjs` 增加 `mermaid` 作为独立 entry。
- **C-4**：错误处理走"NodeView 内 try/catch + errBar" pattern（复用 math-view.template.js §renderKatex 的错误捕获形态）。
- **C-5**：主题联动通过 host → webview 协议下发 `themeChanged` 消息，webview 侧调用 `mermaid.initialize({ theme, startOnLoad: false })` 后对当前文档内所有 mermaid NodeView 触发 re-render。
- **C-6**：Round-trip 契约不变，`roundtripSerializer` / `blockIdAllocator` **无需改动**；只在 webview 侧新增 NodeView。
- **C-7**：memory 里已记录的 T-3.9 math NodeView 三条 pitfall（`stopEvent` + `ignoreMutation`、atom + interactive children pattern、失焦 vs Esc 语义分离）**必须**在 mermaid NodeView 里同款复用。
- **C-8**：TSC baseline 保持 0 errors（T-3.11.4 tsc-baseline-clean 成果），新增文件全部通过 `.d.ts`；mermaid 的 typings 走 `@types/mermaid` 或官方内置 d.ts。

---

## 8. 子任务拆解（送 dev 排期）

| 子任务 | 标题 | 依赖 | 交付物 |
|--------|------|------|--------|
| **T-3.5b.1** | Spike：mermaid v11 在 Milkdown webview CSP 下的可行性 | — | 结论备忘 + 最小 fixture 渲染 demo；确认 `Function` / `eval` 无阻塞；bundle 尺寸实测 |
| **T-3.5b.2** | Mermaid NodeView：inline 渲染 + 点击编辑 + Esc/Ctrl+Enter + live preview | T-3.5b.1 | `mermaid-view.template.js` + `mermaid-view-helpers.mjs`（≤ 400 行 pattern-mirror math-view） + fixture 单测 |
| **T-3.5b.3** | 错误处理 + 空块占位 + 只读模式禁用编辑 | T-3.5b.2 | error banner UI + AC-4 / AC-9 / AC-10 通过 |
| **T-3.5b.4** | 主题联动 + Code OSS light/dark ↔ mermaid theme 映射 | T-3.5b.2 | `mermaidThemeBridge.ts` host service + AC-6 通过 |
| **T-3.5b.5** | 懒加载 + 独立 chunk 构建 + P0 图类型 fixture 全绿 | T-3.5b.2 | `build-milkdown-editor.cjs` 增 mermaid entry + AC-7 / AC-8 通过 |

> 建议顺序：**T-3.5b.1 → .2 → .3 → .5 → .4**（懒加载先落，主题联动最后叠加，避免主题切换影响 chunk 缓存判断）。
> **导出 svg/png（F-08/F-09）** 归入 Should/Could，不列入本次交付主线；作为独立跟进任务 T-3.5b.6 / .7 后置。

---

## 9. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| R-1：mermaid v11 部分 beta 图类型（xyChart / block）在 CSP 下调用 `Function` 或 dynamic evaluate | 图渲染失败 | Spike 阶段（T-3.5b.1）静态扫描 chunk，识别到就把该类型移到 P2 并在错误 banner 里提示"该图类型暂不支持" |
| R-2：mermaid runtime chunk 首次 import 耗时 > 1s，用户看到"空白"图区 | 体验感差 | 加载中显示 skeleton + "正在加载 Mermaid 引擎…"，且提前在 idle 时预热 import（`requestIdleCallback → import()`） |
| R-3：主题切换触发全文档 mermaid 重渲染，大文档（50+ 图）卡顿 | 交互卡 | debounce 300ms + 分批渲染（每帧最多 5 张，`requestAnimationFrame` 队列） |
| R-4：mermaid live preview 高频 render 造成键入延迟 | 输入卡顿 | textarea input debounce 200ms（可与 Q1 编辑体验方案联动调整） |
| R-5：export svg/png 涉及字体加载与 xmlns 声明 | 导出图残缺 | 归入 Should/Could，Phase 3 主线不阻塞，后置到 T-3.5b.6/.7 |

**依赖**：
- 模块 a Round-trip（已完成）✅
- Milkdown 7.21.2 vendor（已就位）✅
- `math-view.template.js` NodeView pattern（已就位）✅
- `code-block-chrome.template.js`（已就位，需避免 mermaid 块被 code-block-chrome 二次装饰）— 需在 chrome 层加 `if (lang === 'mermaid') return`

---

## 10. 默认假设（可推翻）

以下默认在方向性问题 Q1–Q5 未拍板前先按此写 PRD；用户任何一条推翻，PRD 相应节回改：

1. **D-1**：编辑体验 = **a) inline WYSIWYG（math-view 同款）**。
2. **D-2**：渲染引擎 = **b) 完全懒加载**（首屏 0 KB）。
3. **D-3**：主题 = **a) 跟随 Code OSS 主题**（不开用户 config，Phase 3 policy "好看放一放"）。
4. **D-4**：语法错误 = **b) 图区保留最后一次成功渲染 + 顶部错误条**（比"整图消失"体验友好）。
5. **D-5**：P0/P1/P2 分级 = **本文 §5.2 表**（v11 GA 全进 P0/P1，beta 全进 P2）。

---

## 11. 待用户拍板的方向性问题

见 kanban 评论（一次性 5 题 a/b/c）。用户拍板后 PM 更新本 PRD 至 v1.1，锁定后送 dev 启动 T-3.5b.1 spike。

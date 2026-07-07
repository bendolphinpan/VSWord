# PRD · 模块 b · Flowchart.js + js-sequence-diagrams（T-3.5b 剩余）

> **文档定位**：Phase 3 模块 b 第 2/3 份 PRD。承接 `003-master-development-plan.md` §4a 决策 **F-1 = B 全套**（Mermaid + Flowchart.js + js-sequence-diagrams），本 PRD 只覆盖后两个图库；Mermaid 部分见 `003b-mermaid.md`。
> **作者**：PM Agent
> **创建**：2026-07-07
> **前置**：模块 a Round-trip 保真层已完成；`003b-mermaid.md` v1 已定稿并进入 spike 阶段（T-3.5b.1）。
> **命名**：本 PRD 内子任务改用 `T-3.5b-flow.*` / `T-3.5b-seq.*` / `T-3.5b-flowseq.*` 前缀，与 mermaid 的 `T-3.5b.1~5` 平行、不复用序号，避免混排。

---

## 1. 背景

### 1.1 两图库定位

| 图库 | 最新稳定版 | Typora fence | 官方 npm 状态 | 自身 unpacked |
|------|-----------|--------------|--------------|----------------|
| **Flowchart.js** | `flowchart.js@1.18.0` | ` ```flow ` | 正常维护（GitHub adrai/flowchart.js） | 83 KB |
| **js-sequence-diagrams** | `@rokt33r/js-sequence-diagrams@2.0.6-2` | ` ```sequence ` | 官方 `js-sequence-diagrams` 已被 npm-security **撤下**（`0.0.1-security` 占位），生态实际用 rokt33r fork · **5+ 年未维护** | 710 KB |

- 与 Mermaid 关系：**不重叠不冲突**。Mermaid 走 ` ```mermaid ` fence；这两库分别走 ` ```flow ` / ` ```sequence ` fence；三者在 ProseMirror 里都是 `code_block[language=xxx]`。
- Typora 生态历史：Flowchart.js / js-sequence-diagrams 是 Typora "老三样"里资历更老的两个（早于 Mermaid），至今在 Typora 生态里仍有存量文档使用；**本 PRD 的核心动机是"兼容存量语法"而非"新写作首选"** —— 新文档建议用户走 mermaid，两库主要用于打开旧 md 时不至于渲染成裸代码块。

### 1.2 依赖树 & Bundle 预估

**Flowchart.js**：
- 一级依赖：`raphael@2.3.0`（SVG/VML 绘图库，unpacked 1.1 MB · min+gzip 约 90 KB）
- Bundle 预估：`flowchart.chunk.js` min+gzip 约 **110–130 KB**（flowchart.js 自身 24 KB + raphael 90 KB + 少量 glue）

**js-sequence-diagrams**：
- 一级依赖：`underscore@~1.4.x`（unpacked 908 KB · min+gzip 约 8 KB）+ `raphael@~2.1.x`（**版本区间与 Flowchart.js 的 2.3.0 不完全一致**，见 R-3）
- 潜在二级依赖（Typora 部署常见变体使用）：`snap.svg@0.5.1`（依赖 `eve@~0.5.1`，只有 sequence-diagrams 的 `snap-svg` 主题需要）、`webfontloader@1.6.28`（`hand` 主题字体加载，主题非 `simple` 时用）
- Bundle 预估：`sequence.chunk.js` min+gzip 约 **60–90 KB**（seq 主体 30 KB + underscore 8 KB + raphael **走共享 chunk** + 可选主题资源按需切入）

**共享 chunk 策略**（默认假设 D-6）：
- `vendor/raphael.chunk.js` 独立输出，`flowchart` 与 `sequence` 两图库懒加载时先加载 `raphael.chunk.js` 再加载各自主体 → 避免 raphael 双份进包。
- 首屏 bundle 增量：仅 stub + 两个 NodeView 占位代码（**≤ 20 KB gzip**，与 mermaid 模块合并计入 AC-7 类似口径）。

### 1.3 现有可复用参考

- `003b-mermaid.md` **完整结构 mirror**（背景/目标/非目标/AC/技术约束/子任务/风险/默认假设/待拍板），本 PRD 对齐同一节次编号，dev 交叉阅读零成本。
- `mermaid-view.template.js`（模块 b 已产 · 待 T-3.5b.2 落库）作为 NodeView 首选原型。
- `math-view.template.js`（T-3.9）— **点击预览 → textarea + live preview + Esc/Ctrl+Enter commit + 错误红条** —— 与 mermaid 同款复用。
- `code-block-chrome.template.js`（T-3.7）— 已在 `code_block[lang=xxx]` 层做 chrome 装饰，需在 chrome 层增加 `if (lang === 'flow' || lang === 'sequence') return;`（与 mermaid 同款豁免）。
- `roundtrip-tracker.template.js` + `blockIdAllocator.ts`（T-3.8）— 两库走 `code_block` 通道，**无需破 Round-trip 契约**。

---

## 2. 目标（Goals）

1. **G1 · Inline 渲染**：Markdown 里 ` ```flow ` / ` ```sequence ` 代码块在 Milkdown WYSIWYG 视图下自动渲染为 SVG，不需要切换到源码模式。
2. **G2 · 点击编辑**：点击图形进入源码编辑，live preview，Esc 取消 / Ctrl+Enter 或失焦 commit，回写到 `code_block` 节点。
3. **G3 · Round-trip 零破坏**：两库图块持久化格式**永远是** ` ```flow\n...\n``` ` / ` ```sequence\n...\n``` `，byte-for-byte 与原文件一致。
4. **G4 · 主题联动**：Code OSS light/dark ↔ 图库主题映射（Flowchart.js 走 `symbols` 配色 override，js-sequence-diagrams 走 `theme: 'simple' | 'hand'` 二档，默认 `simple`）。
5. **G5 · 语法错误可见**：解析失败时用户能一眼看到错误信息（尽量含行号），不阻塞其他块。
6. **G6 · 首屏零负担**：两库 runtime 首屏不打包进 webview bundle，仅当文档里出现第一个对应 fence 时动态 import；`raphael` 走独立共享 chunk。
7. **G7 · UI 可换皮**：命令注册化（复制源码、导出 svg、导出 png）；主题联动放在 host 侧独立 service，与 mermaid 主题联动共用 host bridge 骨架。

---

## 3. 非目标（Non-Goals）

- **NG1**：不做可视化拖拽建图（保持"源码 + 实时预览"模型）。
- **NG2**：不做**独立文件类型** `.flow` / `.sequence`（两库只作为 Markdown 内嵌代码块）。
- **NG3**：不做**图片导出到 assets/** 自动固化（导出 svg/png 是显式命令，非默认路径）。
- **NG4**：不做 CSS 主题**深度定制**（Phase 3 policy "好看放一放"）。
- **NG5**：不做 **Flowchart.js 与 Mermaid flowchart 的语法互转** / 也**不做** js-sequence-diagrams 与 Mermaid sequenceDiagram 的语法互转 —— 用户手动迁移。
- **NG6**：不做 **js-sequence-diagrams `hand` 主题的手写字体（Gochi Hand）预热** —— 首次切主题接受一次网络字体加载延迟；`hand` 主题默认关闭，需用户主动切（见 D-5）。
- **NG7**：不追加 fork 维护（若 `@rokt33r/js-sequence-diagrams` 因未来 npm 生态变动不可用，走 vendor 目录静态托管；不 fork 自建）。

---

## 4. 用户故事

- **US-1 · 存量文档打开者**：作为从 Typora 迁移过来的用户，我打开一份 5 年前写的 md，里面有 ` ```flow ` 和 ` ```sequence ` 块，我期望 VSWord 能直接渲染它们，而不是显示成一段带高亮的代码。
- **US-2 · 编辑者**：作为写作者，我点击已渲染的流程图/时序图，想直接在图的位置进入源码编辑，实时看到图形变化，Esc 取消 / Ctrl+Enter 提交。
- **US-3 · Debug 者**：作为写作者，我写坏了一行 flowchart 或 sequence 语法（比如漏写节点定义），编辑器应该告诉我错误消息（尽量含行号），而不是整张图消失或整个编辑器崩溃。
- **US-4 · 主题跟随者**：作为夜间写作者，我在 Code OSS 里切了 dark 主题，flow 与 sequence 图应该自动切换到 dark 配色（黑底/浅色线条），不需要我手动改配置。
- **US-5 · Round-trip 洁癖者**：作为版本管理用户，我 git diff 一个只改了正文标点、没动图的 md 文件，应该只看到正文那一行变化，flow / sequence 代码块 byte-for-byte 与原文件一致，不出现 lang tag 大小写变化、缩进变化、trailing newline 变化。

---

## 5. 特性清单与语法覆盖

### 5.1 核心功能特性

| 特性 | 说明 | 优先级 |
|------|------|--------|
| F-01 | Inline NodeView：`code_block[lang=flow]` 渲染为 flowchart SVG | Must |
| F-02 | Inline NodeView：`code_block[lang=sequence]` 渲染为 sequence SVG | Must |
| F-03 | 点击图形进入编辑，textarea + live preview | Must |
| F-04 | Esc / 失焦 / Ctrl+Enter commit 到 ProseMirror `tr.setNodeMarkup`（保持 code_block 类型） | Must |
| F-05 | 语法错误 banner：错误消息 + 行号（若图库 API 暴露）；否则显示第一行 | Must |
| F-06 | 主题联动：Code OSS light → flow/sequence 图库 light 配色，dark → dark 配色（写死映射，Phase 3 不做用户配置） | Must |
| F-07 | 两库 runtime 懒加载：首个对应 fence 块进入视口 / 首次 mount 时动态 import | Must |
| F-08 | `raphael` 走共享 chunk：flow + sequence 两库懒加载都先加载 raphael.chunk.js | Must |
| F-09 | 命令 `vsword.markdown.flowchart.copySource` / `vsword.markdown.sequence.copySource` 复制源码 | Should |
| F-10 | 命令 `vsword.markdown.flowchart.exportSvg` / `.sequence.exportSvg` 导出 svg | Should |
| F-11 | 命令 `vsword.markdown.flowchart.exportPng` / `.sequence.exportPng` 导出 png（svg → canvas → toBlob） | Could |
| F-12 | 空块占位符 "空图 — 点击编辑"（mirror math-view 空态） | Should |
| F-13 | 只读模式（editable=false）下点击图不进入编辑 | Should |
| F-14 | slash menu `/flow` / `/sequence` 插入空块 | Could |
| F-15 | Round-trip：两库图块走 `code_block` 通道，`blockId` + `dirtyBlockContents` 上报 `code_block` 类型，unchanged 场景 byte-for-byte | Must |
| F-16 | 状态服务：`vswordFlowchartLoaded` / `vswordSequenceLoaded` context key（用于命令 when 表达式） | Should |
| F-17 | webview ↔ host 协议：两库相关消息类型统一走 `milkdownEditorProtocol.ts` 已有 pattern | Must |

**Flowchart.js 特有**：
- F-18 · Flowchart.js `parse().drawSVG(container, opts)` 直接向 DOM 容器渲染（**不返回 SVG 字符串**），NodeView 需保留 host `<div>` 作为绘制目标；卸载时手动 `container.innerHTML = ''` 清理。
- F-19 · Flowchart.js `opts.line-length` / `opts.text-margin` / `opts.font-size` 等可视参数暴露为 host bridge 主题包的一部分（默认 mirror Typora 默认值）。

**js-sequence-diagrams 特有**：
- F-20 · 依赖树重（raphael + underscore + 可选 snap.svg / webfontloader），需在 spike 阶段（T-3.5b-seq.1）扫描 chunk 内是否含 `new Function()` / `eval()` / `document.write()`（CSP 阻断点）。
- F-21 · 主题默认 `simple`；`hand` 主题 opt-in（首次切换会异步加载 Gochi Hand webfont，接受一次加载延迟）。

### 5.2 语法覆盖（默认假设，等 Q 用户拍板可推翻）

#### 5.2.1 Flowchart.js 节点/边语法

| 级别 | 语法 | 说明 |
|------|------|------|
| **P0**（GA 必过） | `start` / `end` / `op` / `cond` / `inputoutput` / `subroutine` 节点；`->` / `(yes)->` / `(no)->` 边；`\|approved\|` 边标签 | Typora 生态最常用 6 类节点 + 决策分支边，fixture 强制覆盖 |
| **P1**（GA 应过） | `parallel` 节点；边方向 `right` / `left` / `top` / `bottom`（例如 `op1(right)->op2`） | fixture 覆盖 smoke 级即可 |
| **P2**（观察） | 自定义节点样式 `op1@>op2({"stroke":"red"})`；节点内联样式 `op1: op@>` | 出错走 F-05 错误 banner，**不列入验收 AC** |

#### 5.2.2 js-sequence-diagrams 语法

| 级别 | 语法 | 说明 |
|------|------|------|
| **P0**（GA 必过） | `Actor A` / `A->B: msg`（实线）/ `A-->B: msg`（虚线）/ `A->>B: msg`（开箭头）/ `A-->>B: msg`（开虚箭）；`Note left of A: text` / `Note right of A: text` / `Note over A,B: text`；`participant A as "别名"` | fixture 强制覆盖 |
| **P1**（GA 应过） | `title: xxx`；多参与者 note over `Note over A,B,C:` | fixture 覆盖 smoke 级即可 |
| **P2**（观察） | 内联样式；`sequence` fork 分支的私有扩展语法 | 出错走 F-05，**不列入验收 AC** |

> 与 Mermaid `sequenceDiagram` 关系：语法不兼容。js-sequence-diagrams 的 `A->B: msg` 在 Mermaid 里是 `sequenceDiagram\n  A->>B: msg`。**不做互转**（见 NG5）。

---

## 6. 验收标准（Acceptance Criteria · Given/When/Then）

### AC-1 · Flowchart Inline 渲染（G1, US-1）

> **Given** 一个 Markdown 文件包含 ` ```flow\nst=>start: Start\ne=>end: End\nst->e\n``` `
> **When** 用户在 VSWord 打开该文件
> **Then** 编辑器视图中该代码块位置应渲染出对应的 SVG 流程图，源码代码块本身不可见；SVG 应包含 `Start`、`End` 文本节点及其连线。

### AC-2 · Sequence Inline 渲染（G1, US-1）

> **Given** 一个 Markdown 文件包含 ` ```sequence\nAlice->Bob: Hello\nBob-->Alice: Hi\n``` `
> **When** 用户在 VSWord 打开该文件
> **Then** 编辑器视图中该代码块位置应渲染出对应的 SVG 时序图；SVG 应包含 `Alice`、`Bob` 参与者与两条消息线（实线 + 虚线）。

### AC-3 · 点击编辑（G2, US-2）

> **Given** 已渲染的 flow / sequence 图正显示
> **When** 用户单击图形任意位置
> **Then** 图形下方（或原位）应出现一个 textarea，加载当前源码；textarea 获得焦点；图形保持可见（继续显示 live preview）；每次 textarea `input` 事件后 300ms 内预览应刷新。

### AC-4 · Commit / Cancel（G2）

> **Given** 用户正在编辑 flow / sequence 源码
> **When** 用户按 `Esc`
> **Then** textarea 消失，图形回到编辑前的源码渲染结果，ProseMirror doc **不产生 transaction**。
>
> **And When** 用户按 `Ctrl+Enter` 或 textarea 失去焦点
> **Then** textarea 消失，最新源码通过 `tr.setNodeMarkup(pos, null, { ...attrs })` 写回 doc，触发一次 `dispatch`。

### AC-5 · 语法错误反馈（G5, US-3）

> **Given** 用户在 flow 块输入 `st=>start\ne=>end\nst->` （最后一条边缺目标）
> **When** live preview 触发渲染
> **Then** 编辑区下方应出现红色 error banner，文本为图库抛出的 error message 首行（若行号可提取则展示）；预览区回到"上一次成功渲染"或显示占位符（策略 mirror mermaid AC-4）；文档其他块继续正常工作，编辑器不崩溃。
>
> **同款 Given/When/Then** 适用于 sequence 块。

### AC-6 · Round-trip byte-for-byte（G3, US-5）

> **Given** 一份 md 含 flow 或 sequence 块，用户仅编辑正文一行（未触碰图块）
> **When** 保存并对比原文件
> **Then** 图代码块（含 fence 首行、内容、fence 尾行、trailing newline）与原文件 byte-for-byte 一致；`dirtyBlockContents` 上报中不应包含该图块的 blockId。

### AC-7 · 主题联动（G4, US-4）

> **Given** VSWord 当前使用 Code OSS `Dark+` 主题
> **When** 用户切换到 `Light+` 主题
> **Then** 已渲染的 flow / sequence 图应在 500ms 内以对应主题重渲染；反之切回 dark 时应变回 dark；切换过程中源码不变、Round-trip 无副作用。

### AC-8 · 懒加载 + 共享 raphael chunk（G6）

> **Given** 一个不含任何 flow / sequence 块的 md 文件
> **When** 用户打开该文件
> **Then** Chrome DevTools Network 应显示 `flowchart.chunk.js` / `sequence.chunk.js` / `raphael.chunk.js` **均未加载**；webview bundle gzip 尺寸相比 mermaid PRD 完成后基线增长应 ≤ 20 KB（仅两个懒加载 stub + NodeView 骨架）。
>
> **And When** 用户打开一个含 flow 块的 md 文件
> **Then** `raphael.chunk.js` 与 `flowchart.chunk.js` 应在首个 flow NodeView mount 时被动态 import；`sequence.chunk.js` **不加载**；后续打开另一个含 flow 的文件应命中 module cache。
>
> **And When** 用户随后打开一个只含 sequence 块的 md 文件
> **Then** `sequence.chunk.js` 应动态 import，且 `raphael.chunk.js` 已缓存**不重复请求**（AC-8 关键点：raphael 共享）。

### AC-9 · P0 语法全绿（G4 · Flowchart）

> **Given** 测试 fixture 包含 P0 全部节点类型（start/end/op/cond/inputoutput/subroutine）+ yes/no 分支边的最小有效示例
> **When** 打开 fixture 文件
> **Then** 每种节点/边组合均应成功渲染出可见 SVG（`<svg>` 节点存在且 `width > 0`），无图库 parse error 抛出。

### AC-10 · P0 语法全绿（G4 · Sequence）

> **Given** 测试 fixture 包含 P0 全部消息类型（-> / --> / ->> / -->>) + 三种 note 变体（left of / right of / over）+ `participant … as …` 别名的最小有效示例
> **When** 打开 fixture 文件
> **Then** 每种消息/note/actor 组合均应成功渲染出可见 SVG，无图库 parse error 抛出。

---

## 7. 技术约束

- **C-1**：两库图均作为 Milkdown/ProseMirror **NodeView** 附着于 `code_block` schema，`node.attrs.language === 'flow' | 'sequence'` 触发；**不新建 schema**，避免破 Round-trip。
- **C-2**：webview CSP 已禁用 `eval` / `new Function`。
  - **Flowchart.js**：其 parser 是手写递归下降，**理论上**不用 `Function()`；但依赖 `raphael@2.3.0` 需 spike 阶段（T-3.5b-flow.1）静态扫描 chunk 二进制，识别 `new Function` / `eval` / `document.write` 三个高风险 API。
  - **js-sequence-diagrams**：其 parser 由 PEG.js 生成，**PEG.js 生成的 parser 使用 `new Function()` 生成 rule 函数**。这是**已知 CSP 阻塞点**。Spike 阶段（T-3.5b-seq.1）**必须验证** rokt33r fork 版本是否已预编译 PEG parser 为普通函数；若未预编译，需构建时 vendor 一份编译产物（vendor 目录静态托管）。
  - **兜底方案（若两库均无法过 CSP）**：在 webview 侧走 iframe 沙箱嵌入，牺牲一部分性能与主题联动能力；此方案需用户拍板（见 §11 Q3）。
- **C-3**：`raphael.chunk.js` 独立共享 chunk 输出，`flowchart.chunk.js` 与 `sequence.chunk.js` 都通过 `import('./raphael.chunk.js')` 触发；构建脚本 `build-milkdown-editor.cjs` 增加三个 entry。
- **C-4**：raphael 版本冲突：Flowchart.js 声明 `raphael@2.3.0`，js-sequence-diagrams 声明 `raphael@~2.1.x`；实际 API 兼容（raphael 2.x 系列 API 稳定），**统一使用 2.3.0**（更新的补丁修复更全）。
- **C-5**：错误处理走"NodeView 内 try/catch + errBar" pattern（复用 math-view.template.js §renderKatex 的错误捕获形态）。
- **C-6**：主题联动通过 host → webview 协议下发 `themeChanged` 消息，webview 侧对两库分别执行 re-render；host 侧的主题映射表复用 mermaid 已有的 `themeBridge` 骨架，只新增两组映射常量。
- **C-7**：Round-trip 契约不变，`roundtripSerializer` / `blockIdAllocator` **无需改动**；只在 webview 侧新增 NodeView + code-block-chrome 层豁免。
- **C-8**：memory 里已记录的 T-3.9 math NodeView 三条 pitfall（`stopEvent` + `ignoreMutation`、atom + interactive children pattern、失焦 vs Esc 语义分离）**必须**在两库 NodeView 里同款复用（复用 mermaid NodeView pattern，二次复用零成本）。
- **C-9**：TSC baseline 保持 0 errors（T-3.11.4 tsc-baseline-clean 成果），新增文件全部通过 `.d.ts`；两库均无官方 TypeScript 定义 —— 需在 `src/vs/workbench/contrib/vsword/webview/typings/` 下手写 minimal `.d.ts` 声明用到的 API（`parse()`, `drawSVG()`, `Diagram.parse()`, `diagram.drawSVG()`）。
- **C-10**：vendor 托管兜底：若 spike 阶段发现 npm 包 CSP 不达标或维护中断，转为在 `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/vendor/` 下静态托管两库源码（同 mermaid 处理方式），并在 vendor 头部注释里写清 upstream commit / license。

---

## 8. 子任务拆解（送 dev 排期）

| 子任务 | 标题 | 依赖 | 交付物 |
|--------|------|------|--------|
| **T-3.5b-flow.1** | Spike：Flowchart.js + raphael 在 Milkdown webview CSP 下的可行性 | mermaid T-3.5b.1 完成 | 结论备忘 + 最小 fixture 渲染 demo；确认 `Function`/`eval`/`document.write` 无阻塞；bundle 尺寸实测；raphael chunk 拆分方案 |
| **T-3.5b-flow.2** | Flowchart.js NodeView + 懒加载 + P0 fixture 全绿 | T-3.5b-flow.1 | `flowchart-view.template.js` + `flowchart-view-helpers.mjs`（≤ 400 行 · mirror mermaid-view pattern） + `flowchart.chunk.js` 独立 entry + AC-1/3/4/5/6/9 通过 |
| **T-3.5b-seq.1** | Spike：js-sequence-diagrams + PEG.js parser CSP 兼容性验证 | mermaid T-3.5b.1 完成 | 结论备忘 + rokt33r fork 是否已预编译 PEG parser 的验证结论；若未预编译，产出 vendor 化方案（含 pre-compile 脚本）；bundle 尺寸实测 |
| **T-3.5b-seq.2** | js-sequence-diagrams NodeView + 懒加载 + P0 fixture 全绿 | T-3.5b-seq.1 + T-3.5b-flow.2（借用 raphael chunk 结论） | `sequence-view.template.js` + `sequence-view-helpers.mjs` + `sequence.chunk.js` 独立 entry + AC-2/3/4/5/6/10 通过 |
| **T-3.5b-flowseq.3** | 两库 Gate F fixture 汇总 + 主题联动 + 收官 | T-3.5b-flow.2 + T-3.5b-seq.2 | `flowThemeBridge.ts` + `sequenceThemeBridge.ts`（可能合并为 `typoraLegacyThemeBridge.ts`） + AC-7/8 通过 + Gate F/G 报告更新 + 三库（mermaid + flow + sequence）联合测试 fixture |

**建议顺序**：**T-3.5b-flow.1 与 T-3.5b-seq.1 并行 spike** → 若两个 spike 都通过 → `flow.2` → `seq.2` → `flowseq.3`。若 seq.1 spike 失败（PEG parser CSP 阻塞且无法预编译），走 §11 Q3 兜底路径（iframe 沙箱 OR 只落 flow / 只落 sequence / 全砍 →降级 F-1 决策）。

> 导出 svg/png（F-10/F-11）归入 Should/Could，不列入本次交付主线；作为独立跟进任务 T-3.5b-flowseq.4/.5 后置。

---

## 9. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| **R-1**：js-sequence-diagrams 内部 PEG.js parser 使用 `new Function()` 生成规则函数，webview CSP 禁用 | sequence 图全部渲染失败 | Spike 阶段（T-3.5b-seq.1）**首要验证项**。若 rokt33r fork 已预编译 → 通过；否则走 vendor + 构建时 `pegjs --format globals` 预编译方案，vendor 目录托管 |
| **R-2**：raphael 2.x 内部历史含 `Function()` / VML 分支代码（IE 兼容遗留） | 两库均无法初始化 | Spike 阶段（T-3.5b-flow.1）静态扫描 chunk，识别到就在构建时用 esbuild define 剔除 VML 分支（`RAPHAEL_HAS_VML: false`）+ 手工 patch |
| **R-3**：raphael 版本区间冲突（flowchart 声明 `2.3.0`，sequence 声明 `~2.1.x`） | npm install 时可能双份 raphael 进包 | 使用 `overrides`/`resolutions` 强制统一到 2.3.0；构建时验证 chunk 里 raphael 只出现一次 |
| **R-4**：js-sequence-diagrams 5+ 年未维护，某天 npm 可用性中断 | 新用户无法安装 | 兜底：vendor 化托管（C-10）。**PRD 阶段不预防性 vendor**，等真出问题再切 |
| **R-5**：Flowchart.js `drawSVG` 直接向 host div 渲染，卸载时若不清空可能导致 memory leak / 图残留 | 编辑器长期使用时内存增长 | NodeView `destroy()` 强制 `container.innerHTML = ''` + `paper.remove()`（raphael 实例清理） |
| **R-6**：两库图 live preview 高频 render 造成键入延迟（尤其 sequence 图 raphael 绘制较慢） | 输入卡顿 | textarea input debounce 200ms（与 mermaid AC-3 同款） |
| **R-7**：主题切换触发全文档 flow + sequence 重渲染，raphael 绘制慢于 mermaid | 大文档主题切换卡顿 | debounce 300ms + 分批渲染（每帧最多 3 张 raphael 图，`requestAnimationFrame` 队列 · 比 mermaid 的 5 张更保守） |
| **R-8**：Flowchart.js / js-sequence-diagrams 无官方 TypeScript 定义 | tsc baseline 破 | 手写 minimal `.d.ts`（C-9），只声明我们用到的 API |

**依赖**：
- 模块 a Round-trip（已完成）✅
- 模块 b Mermaid PRD（已完成 v1）✅ · Mermaid NodeView（T-3.5b.2 实施中，本 PRD 复用其 pattern）
- Milkdown 7.21.2 vendor（已就位）✅
- `math-view.template.js` NodeView pattern（已就位）✅
- `code-block-chrome.template.js`（已就位，需在 chrome 层加 flow / sequence 豁免）— 与 mermaid 同款处理

---

## 10. 默认假设（可推翻）

以下默认在方向性问题 Q1–Q5 未拍板前先按此写 PRD；用户任何一条推翻，PRD 相应节回改：

1. **D-1**：编辑体验 = **inline WYSIWYG（math-view / mermaid-view 同款）**。
2. **D-2**：渲染引擎 = **完全懒加载**（首屏 0 KB · raphael + flowchart + sequence 均按需 import）。
3. **D-3**：raphael 走 **共享 chunk**（flow 与 sequence 共用一份 raphael.chunk.js · 见 F-08 / AC-8）。
4. **D-4**：主题 = **跟随 Code OSS 主题**（不开用户 config · Phase 3 policy "好看放一放"）；两库主题映射写死。
5. **D-5**：js-sequence-diagrams 主题默认 = **`simple`**（不加载 webfont · 首次渲染快）。用户可通过命令切到 `hand`（接受一次 webfont 加载延迟）。
6. **D-6**：语法错误 = **图区保留最后一次成功渲染 + 顶部错误条**（mirror mermaid AC-4）。
7. **D-7**：P0/P1/P2 分级 = 本文 §5.2 表（Typora 生态最常用节点/消息类型全进 P0）。
8. **D-8**：sequence 图库来源 = **`@rokt33r/js-sequence-diagrams@2.0.6-2`**（官方包已被 npm-security 撤下）；未来若 rokt33r 也不可用，转 vendor 化托管，不 fork 自建。
9. **D-9**：raphael 版本 = **`raphael@2.3.0`**（`overrides` 强制统一 · 见 R-3）。
10. **D-10**：命令注册命名空间 = `vsword.markdown.flowchart.*` / `vsword.markdown.sequence.*`（与 `vsword.markdown.mermaid.*` 平行）。
11. **D-11**：导出 svg/png（F-10/F-11）**不列入本次交付主线**（Should/Could），后置到 T-3.5b-flowseq.4/.5 独立任务。
12. **D-12**：不做 Typora 老三样与 Mermaid 之间的**语法互转** / 语法糖（NG5）。
13. **D-13**：不 fork 自建（NG7）；`@rokt33r/js-sequence-diagrams` 5+ 年未维护可接受，只作"读旧文档兼容"用途，不推广新写作。

---

## 11. 待用户拍板的方向性问题（≤5 题）

以下问题涉及方向性选择，PM 建议默认按 §10 假设走；如用户有异议请回帖 a/b/c 拍板，PM 更新至 v1.1 后锁定送 dev 启动 spike。

**Q1 · 优先级取舍：Flowchart.js 与 js-sequence-diagrams 是否必须**同时**交付？**

- a) 都做（默认 · 三库齐全 · F-1=B 全套决策严格执行）
- b) 只做 Flowchart.js（js-sequence-diagrams 5+ 年未维护 · CSP 风险最高 · 优先级最低）
- c) 只做 js-sequence-diagrams（Flowchart.js 有 mermaid `flowchart` 替代 · 存量文档 sequence 使用率更高）

**Q2 · CSP 阻塞兜底路径**：若 T-3.5b-seq.1 spike 发现 PEG parser 无法在 webview CSP 下运行、且预编译方案也失败：

- a) vendor 化托管 + 构建时预编译 PEG parser（PM 首选 · 一次性投入 · 长期稳定）
- b) 走 iframe 沙箱嵌入（CSP 隔离层单独放宽 · 主题联动弱化 · 交付时间快 1 周）
- c) 直接砍 sequence 图库，只留 flow + mermaid（F-1=B 降级为 F-1=B-lite · 交付时间快 2 周）

**Q3 · raphael 共享 chunk 策略**（默认假设 D-3）：

- a) 共享 chunk（默认 · 一份 raphael 服务两库 · 打开 flow 后再打开 sequence 只加载 seq 主体 ≈ 30 KB gzip）
- b) 各自打包 raphael（两库解耦 · 单独懒加载零耦合 · 但每库都要背 raphael 90 KB gzip）
- c) raphael 也进首屏（放弃懒加载 raphael · 首屏 +90 KB gzip · 换取图库首次渲染零延迟）

**Q4 · 主题联动强度**：

- a) 只跟 light/dark 二档（默认 · Phase 3 policy · 主题写死）
- b) 跟 Code OSS 全部主题（light/dark/high-contrast · 需要三套 raphael 配色映射 · 工作量 +30%）
- c) 不做主题联动（两库固定 light 配色 · 极简 · 但夜间用户体验差）

**Q5 · 未来 5+ 年未维护的 js-sequence-diagrams 生态风险的接受度**：

- a) 接受（默认 · "读旧文档兼容"定位明确 · 不做新功能承诺）
- b) PM 主动 fork 自建 + 长期维护（推翻 NG7 · 长期成本高）
- c) 不做 js-sequence-diagrams，用户手动把 sequence 语法迁移到 mermaid（推翻 F-1=B · 与 Q1=b 联动）

---

### 11.1 v1.1 锁定：用户全部按默认拍板 · Q1..Q5 全 a

**用户回帖（2026-07-07）**：Q1=a · Q2=a · Q3=a · Q4=a · Q5=a — 全部沿用 §10 D-1..D-13 默认假设，无一推翻。

**锁定含义**：

- **Q1=a** → Flowchart.js 与 js-sequence-diagrams 同时交付，F-1=B 全套决策严格执行；两库对等优先级，两 spike（T-3.5b-flow.1 + T-3.5b-seq.1）并行启动。
- **Q2=a** → CSP 阻塞兜底路径确定为 **vendor 化托管 + 构建时预编译 PEG parser**；iframe 沙箱与砍 sequence 两条兜底路线均不采用（若 seq.1 spike 发现 rokt33r fork 未预编译，直接走 `pegjs --format globals` 一次性预编译方案，产物纳入 vendor 目录）。
- **Q3=a** → raphael 走**共享 chunk**（一份 raphael 服务两库，D-3 生效）；懒加载策略：首屏 stub 0 KB · 打开首个含 flow/sequence 的文档时按需拉取 raphael 共享 chunk · 之后两库共用。
- **Q4=a** → 主题联动固定 **light/dark 二档**（Phase 3 policy "好看放一放"）；high-contrast 与 Code OSS 全主题联动均延后到最后 UI 统一调优阶段处理，本模块不承诺。
- **Q5=a** → **接受 js-sequence-diagrams 生态未维护现状**，走 rokt33r fork（D-8 生效），不 fork 自建（D-13 生效），不引导用户迁移到 mermaid；产品定位明确为"读旧 Typora 文档兼容"，不承诺新功能与长期演进。

**§10 D-1..D-13 全部沿用不动**，本 v1.1 仅在 §11 追加本节锁定记录，其他章节内容与 v1 完全一致。

**下一步**：dev 启动 **T-3.5b-flow.1** 与 **T-3.5b-seq.1** 并行 spike；spike 通过后按 §8 建议顺序继续 `flow.2 → seq.2 → flowseq.3`；spike 失败按 §7 C-2 与本节 Q2=a 定义的兜底路径（vendor + 预编译 PEG）执行。

---

## 附：与 `003b-mermaid.md` 的差异速览

| 章节 | mermaid 独有 | flow+seq 独有 |
|------|-------------|---------------|
| §1 背景 | Mermaid v11 图类型分级 | 两库依赖树 + npm 生态状态（rokt33r fork） |
| §3 非目标 | 不做 v10 兼容降级 | 不做 Typora 老三样与 mermaid 语法互转 · 不 fork 自建 |
| §5 特性 | F-14 单一 context key | F-16 两个 context key · F-08 raphael 共享 chunk · F-18/19 Flowchart.js 特有 · F-20/21 sequence 特有 |
| §5.2 语法 | Mermaid v11 图类型 | Flowchart.js 节点/边 + js-sequence-diagrams actor/message/note |
| §6 AC | 10 条（mermaid 单库） | 10 条（**AC-1/2 分列两库 · AC-8 特别验证 raphael 共享 chunk · AC-9/10 分列两库 P0 语法**） |
| §7 约束 | Mermaid v11 CSP 已 OK | **PEG parser 是核心 CSP 阻塞点** · raphael VML 历史包袱 · 手写 .d.ts |
| §8 子任务 | 5 个 T-3.5b.1~5 | 5 个 T-3.5b-flow.* / seq.* / flowseq.*（**两 spike 并行**） |
| §9 风险 | 5 条 | 8 条（新增 PEG.js CSP · raphael 版本冲突 · 生态未维护 · Flowchart.js drawSVG 清理 · 主题切换 raphael 绘制慢） |
| §10 假设 | 5 条 D-1~5 | 13 条 D-1~13（**新增 raphael 共享 chunk · sequence 图库来源 · 不 fork 自建 · 不做语法互转**等） |
| §11 拍板 | 5 题 | 5 题（**Q1 优先级取舍 · Q2 CSP 兜底 · Q3 raphael chunk · Q4 主题强度 · Q5 生态风险**） |

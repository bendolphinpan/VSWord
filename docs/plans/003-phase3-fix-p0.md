# 003 · Phase 3 收官 P0 修 PRD · 保存打断输入 + 表格 chrome UX

> 状态：v1 · 待 review
> 关联 kanban：t_2a4a735f
> 上游依赖：T-3.9.2.c（IME 状态机纯函数已就绪）· T-3.6（表格 chrome 首建）
> 下游拆分：本 PRD § 每节末尾定义 T-3.12.x 子任务
> 类型：Fix PRD（非新增功能，收官前 P0 用户体验修）
> 语言：中文 · KISS · Phase 3 policy 不动主题/CSS 视觉调优（除非阻断功能验证）

---

## 0 · 背景

用户在 IME 输入手测里发现 2 个 P0 缺陷，均不在 T-3.9.2 IME checklist 现有 case 覆盖里，必须在 Phase 3 收官前修复：

- **P0-1 保存打断输入**：IME composition 期间 auto-save timer 到期 → webview 失焦 → 拼音候选被吞。
- **P0-2 表格菜单全域展开**：光标落进任意表格 → 整表所有编辑控件常驻可见，本应像 Notion / Typora 那样 hover cell 才出三点条、点击才展开。

两个都是"已有底层构件 + 集成没做"或"首建时策略取粗"的收口漏项，不涉及新架构。

---

## §1 · 问题 1 · 保存打断输入（IME 组合被吞）

### 1.1 现状

- **状态机侧**：`webview/ime-composition-state.template.js` 已建纯函数 `createImeCompositionState()`（T-3.9.2.c 交付）。契约里 case 3 明确说："composition 期间外部触发 auto-save：save 被 queue，等 compositionend 后 flush"；`requestAutoSave()` 在 `state.composing === true` 时返回 `'pending'` 并置 `state.pendingAutoSave = true`；`handleCompositionEnd()` 会在结束后 `_flushAutoSave()`。
- **单测侧**：`test/node/imeComposition.test.ts` 已覆盖 6+3 case（含 case 3 pending → flush 时序）。
- **集成侧**：`browser/milkdownEditor/milkdownWorkingCopy.ts` 的 `scheduleAutoSave()`（L383-391）到期直接 `this.save({ reason: SaveReason.AUTO })`，**从未询问 webview 是否在 composing**。
- **协议侧**：`milkdownEditorProtocol.ts` 里 `WebviewMarkdownUpdatedMessage` / `WebviewSessionReadyMessage` 无 `isComposing` 位，webview → host 没有 composition 状态上报通道。
- **webview 侧**：`entry.template.js`（Milkdown Editor bootstrap）目前**未实例化** `createImeCompositionState()`，也未在 ProseMirror `EditorProps.handleDOMEvents` 上挂 `compositionstart / compositionupdate / compositionend` 钩子。integration notes L221-232 已经指明接线方式，但代码没接。

一句话：**状态机建好了、单测过了、但没插到 save 路径上**。

### 1.2 复现步骤（P0 fixture）

```
1. 打开任意 .md 文件（走 Milkdown 编辑器）。
2. 光标停在段落末尾，按拼音输入法快速打 "shi jie ni hao"，
   停在拼音候选浮层可见（尚未选中候选）的中间态。
3. 保持不动 ≥ VSWORD_MILKDOWN_AUTOSAVE_DEBOUNCE_MS（当前 500ms）。
4. 观察：
   - 预期：候选保持，等用户按空格 / 数字选定 → compositionend → doc 落地
     "世界你好"，然后 auto-save 才写盘。
   - 实际（bug）：候选未提交 → webview 失焦 → 候选浮层消失 → 打的字丢失。
```

自动化路径：`test/node/imeComposition.test.ts` 已可作为单元回归；集成回归留给 T-3.9 IME checklist 手测复核。

### 1.3 修复策略对比

| 策略 | 描述 | 复杂度 | 副作用 | 风险 |
|---|---|---|---|---|
| **A 纯 webview 内 gate** | 在 webview `entry.template.js` 里实例化 `imeCompositionState`，把 host 的 auto-save trigger 转换成"webview 内先经 `requestAutoSave()`"。但 auto-save timer **在 host 侧**（`milkdownWorkingCopy.setTimeout`），webview 拦不到。→ **不可行**。 | 低 | – | 逻辑上无法覆盖 host 侧定时器 |
| **B host 侧问 webview + 同步返回** | host 的 timer 到期时 `postMessage → webview 回 isComposing`，等回复。postMessage 是异步的，setTimeout 里无法 sync 等 → 需要"先 postMessage 请求 → webview 决定是执行还是延后"。 | 中 | 一次 msg 往返 | 时序竞态：webview 回复期间 composition 可能已结束或又开始 |
| **C webview 主动上报 isComposing** ★推荐 | webview 侧监听 `compositionstart / compositionend`，在状态翻转时 postMessage `{type:'imeCompositionChanged', composing:true/false}`；host 缓存最新态。host 的 `scheduleAutoSave` timer 到期时读 `_webviewComposing`，为 `true` 则**跳过本轮 flush 并把 dirty flag 保留**（下一次 markdownUpdated 或 compositionend → markdownUpdated 会重启 scheduleAutoSave）。 | 中 | 每次 IME start/end 一条 msg | 需保证 compositionend 后 webview 必产生一次 markdownUpdated 触发重启（Milkdown listener 已保证：composition 提交进 doc → listener 触发） |
| **D webview 端拦截 + 端到端 flush** | webview 实例化 `imeCompositionState` 承载语义，webview 侧 markdownUpdated 携带 `composingSnapshot` 位；host `scheduleAutoSave` 到期查最近一次 markdownUpdated 的 `composingSnapshot`。 | 中 | 与 C 相当，但语义耦合到 markdownUpdated 消息 | markdownUpdated 频率高于 composition state 翻转，多数消息里 composing 位是无用负载 |

**推荐 C**：composition 状态翻转事件少（一次 IME 一头一尾），host 侧只加一个 boolean 缓存 + auto-save gate；协议扩展面最小。webview 侧把 `imeCompositionState` 用起来（尽管 host 也 gate 了，webview 侧的状态机仍然作为 flush 兜底：万一 host 侧因 race 漏一次 gate，webview 还能拦 compositionend）。

### 1.4 目标行为

- **G1**：composition 期间（`webview.view.composing === true`），host 侧的 auto-save timer 到期**不 flush**。
- **G2**：`compositionend` 后（webview 侧发出 `{type:'imeCompositionChanged', composing:false}` 且 doc 落地触发一次 markdownUpdated），host 侧 auto-save 应在**下一次 debounce 到期**时正常 flush（即 compositionend 后 500ms）。
- **G3**：显式保存（`Ctrl+S` / `save()` 由用户命令触发，`reason !== SaveReason.AUTO`）**不受本 gate 影响**——用户显式意图 > IME 中间态保护。
- **G4**：Escape 取消 IME 时，若期间 auto-save 被推迟，`compositionend` 路径不会走（因为 Escape 是回滚），需要在 webview 侧 `handleEscape()` 后主动发一次 markdownUpdated（doc 未变则 host 侧 `_dirty` 变 false，自然不 schedule）——**沿用现有 listener 触发即可，无额外接线**。

### 1.5 影响面

**改**：
1. `browser/milkdownEditor/milkdownEditorProtocol.ts` · 新增 message 类型 `WebviewImeCompositionChangedMessage { type: 'imeCompositionChanged'; composing: boolean }`；加入到 `WebviewToHostMessage` union。
2. `browser/milkdownEditor/webview/entry.template.js`（或视 bootstrap 位置调整）· 实例化 `createImeCompositionState()`；在 ProseMirror `EditorProps.handleDOMEvents` 挂 `compositionstart / compositionupdate / compositionend` 钩子，钩子里 `postMessage({type:'imeCompositionChanged', composing:true/false})`。
3. `browser/milkdownEditor/milkdownWorkingCopy.ts` · 新增私有 `_webviewComposing: boolean`；`updateWebviewComposing(composing:boolean)` setter；`scheduleAutoSave` 的 timer callback 里 `if (this._webviewComposing) return;`（保留 `_dirty` 不 clear，下一次 markdownUpdated / imeCompositionChanged=false 会重启 scheduleAutoSave）。
4. `browser/milkdownEditor/milkdownEditorContribution.ts` · 在 message 分发（switch msg.type，L347+ 附近）新增 `case 'imeCompositionChanged'`，调 `input.workingCopy.updateWebviewComposing(msg.composing)`；`composing === false` 时额外 `input.workingCopy.scheduleAutoSaveIfDirty()`（新增 public 方法，或复用现有 dirty check 触发一次 scheduleAutoSave）。

**不改**：
- `ime-composition-state.template.js` 契约不动（已过单测），只在 webview 侧使用。
- `view-mode-editable.template.js` 不动（AC-6 已用空 tr dispatch 处理切模式时的 composition flush，与本 P0 场景正交）。
- `milkdownWorkingCopy.save()` 主路径不改（只在 auto-save timer 到期分支加 gate）。

### 1.6 AC · Given/When/Then

**AC-1.1**（G1）：Given 用户在 IME composition 中打了 "shi jie"，When auto-save timer 到期，Then host `save()` 不被调用、`_dirty` 保持 `true`、磁盘文件未变、webview 保持焦点。

**AC-1.2**（G2）：Given AC-1.1 状态，When 用户按空格提交候选（compositionend） + 500ms 后，Then host `save()` 被调用一次、磁盘文件落地"世界"（或用户选定的候选）。

**AC-1.3**（G3）：Given 用户在 composition 中，When 用户按 `Ctrl+S`（reason=EXPLICIT），Then host `save()` 立即执行（gate 只对 AUTO 生效），磁盘文件写入当前 markdown（webview 已发 composition 前的 markdownUpdated → `_current` 是可提交态）。

**AC-1.4**（G4）：Given 用户在 composition 中按 Escape 取消，When Milkdown listener 因 doc 未变化不 trigger markdownUpdated，Then `_dirty` 保持不变、无多余 save 被调度。

**AC-1.5**（协议扩展）：`imeCompositionChanged` message 通过 T-3.8.x protocol roundtrip 单测新增 1 case（`test/node/protocolRoundtrip.test.ts`）；host 侧 `updateWebviewComposing` 有 mocha 单测覆盖三态转移。

### 1.7 拆子任务

| ID | 标题 | assignee | 依赖 | Gate |
|---|---|---|---|---|
| **T-3.12.1.a** | 协议扩展 + host 侧 auto-save gate | dev | – | mocha 单测：`_webviewComposing=true` 时 timer callback 不调 save；`false` 后 scheduleAutoSave 恢复。tsc 0 error。 |
| **T-3.12.1.b** | webview 侧 composition 事件桥 + postMessage 上报 | dev | 1.a 协议 | 手测复现步骤 §1.2 不再丢字；`test/node/protocolRoundtrip.test.ts` 新增 1 case。 |
| **T-3.12.1.c** | 端到端回归 · IME + auto-save 组合 checklist | qa | 1.a + 1.b | 微软拼音 / 搜狗 / Google 日文 IME 三种输入法各跑 §1.2 复现步骤 + 变体（composition 中间切模式、Escape、连续两次 composition），全部无丢字。 |

---

## §2 · 问题 2 · 表格菜单全域展开（本应 hover cell 才出）

### 2.1 现状

`webview/table-chrome.template.js`（248 行）里 NodeView 挂载时**无条件构建** `corner / colBar / rowBar` 三个 chrome 元素并 `wrap.append(corner, colBar, rowBar, table)`。CSS 层未 gate 显示 → 每张表所有按钮（"+左 +右 ← → 删 / +上 +下 ↑ ↓ 删 / 左中右对齐 / ⋮整表菜单"）常驻可见。

现状截图（用户描述）："光标一进表格 DOM，右侧/上方全展开，密度高、干扰阅读"。

具体代码位：
- 构建：L83-86 `wrap.append(corner, colBar, rowBar, table)` + L170-172 `buildCorner(); rebuildColBar(node); rebuildRowBar(node);`
- 触发：仅 `.vsword-table-corner` 走了 open/close 折叠（L149 `corner.dataset.open = ...`），`colBar / rowBar` 完全没 gate。
- 命令通道：L50-62 `OP_TO_KEY` map + L176-215 click handler → `commands.call(key, payload)`（走 preset-gfm）。**命令通道正确，无需动**。

### 2.2 目标 UX

对齐 Notion / Typora / Confluence pattern（用户明示）：

1. **默认态（无 hover）**：整张表格**只显示表格本体**，无任何 chrome 元素可见。
2. **hover 到某个 cell（含 header）**：
   - 在该 cell 的**上边缘中点**冒出一个短横条 `<div class="vsword-table-col-handle">⋯</div>`（列 handle）；
   - 在该 cell 的**左边缘中点**冒出另一个短横条 `<div class="vsword-table-row-handle">⋮</div>`（行 handle）。
   - 两个 handle 宽/高 ≈ cell 宽/高的 30-50%，视觉上是三点小条。
3. **点击 col handle**：在该 col handle 下方冒出候选菜单浮层 `<div class="vsword-table-col-menu">`，含 `+左 / +右 / ← / → / 删 / 对齐(左中右)`。行 handle 同理，菜单含 `+上 / +下 / ↑ / ↓ / 删`。
4. **integer handle 外点击**：菜单折叠回到 handle 态。
5. **鼠标移出整个 table 范围**：handle 隐藏（默认态）。
6. **右下角 corner（整表菜单）**：保留现有 `⋮` 按钮 + 点击展开 `删除整表`，位置改到 table 右下角外侧（当前是左上角，位置由 CSS 定），行为不动。

### 2.3 交互状态机

```
IDLE ───(pointer over cell C)──▶ HOVER(C)
HOVER(C) ──(pointer over cell C', C' ≠ C)──▶ HOVER(C')
HOVER(C) ──(pointer leaves table)──▶ IDLE
HOVER(C) ──(click col handle of C)──▶ OPEN_COL(C)
HOVER(C) ──(click row handle of C)──▶ OPEN_ROW(C)
OPEN_COL(C) ──(click menu button)──▶ execute command → IDLE
OPEN_COL(C) ──(click outside menu)──▶ HOVER(C) or IDLE (depending on where)
OPEN_COL(C) ──(hover cell C', C'.col ≠ C.col)──▶ OPEN_COL 关闭 → HOVER(C')
```

关键不变式：
- 同时**至多一个 OPEN_*** 菜单。切列或切行会自动关掉上一个。
- 表格外点击（`document mousedown`，见 L217-222 现有 outside handler）应关掉所有 OPEN_* 与 corner。
- **hover 判定用 `pointerenter/pointerleave` 而不是 `mouseover/mouseout`**（后者冒泡语义会误伤子元素）。

### 2.4 与命令通道的关系

现有 `OP_TO_KEY` map + click handler（L176-215）**完全保留**：
- 每个 handle 弹出的菜单里的按钮 `dataset.action` 沿用现有值（`col-add-before`, `col-add-after`, `col-move-left`, `col-move-right`, `col-delete`, `align-left`, `align-center`, `align-right`, `row-add-before`, `row-add-after`, `row-move-up`, `row-move-down`, `row-delete`, `table-delete`）。
- click handler 里定位 col/row 索引从 handle 的 `dataset.col / dataset.row` 拿（当前是从 col-menu / row-menu 拿，语义等价）。
- 命令 dispatch（cell selection seed + `commands.call(key, payload)`）**一行不动**。

### 2.5 影响面

**改**：
1. `browser/milkdownEditor/webview/table-chrome.template.js` · NodeView 结构重写：
   - 去掉 `colBar / rowBar` 常驻构建；改为**每 cell 动态挂 handle**。
   - 新增 `pointerenter/pointerleave` 事件，命中的 cell 挂上两个 handle（col-handle / row-handle）。
   - Handle click → 展开对应菜单 popover（DOM 结构与现有 `.vsword-table-col-menu / .vsword-table-row-menu` 复用）。
   - `corner` 保留但迁移到 right-bottom 外侧（CSS 层调整）。
2. `browser/milkdownEditor/webview/table-chrome-helpers.template.js` · **不动**（纯函数 `actionForButton / getColAlignments` 与 UI 结构无关）。
3. `browser/milkdownEditor/milkdownEditorHtml.ts`（若 CSS inline 在此）· 新增 `.vsword-table-col-handle / .vsword-table-row-handle` 样式；隐藏原来的 `.vsword-table-col-bar / .vsword-table-row-bar` 常驻块（或直接移除该规则）。
4. `test/node/tableChrome.test.ts` · 新增 3 P0 case（见 §2.6）+ 保留现有 command dispatch 单测。

**不改**：
- `milkdownEditorProtocol.ts`（webview↔host 协议不涉及此）。
- 命令通道（`OP_TO_KEY` map + click handler dispatch）。
- 现有 tsc-clean baseline（T-3.11.4）不能被破坏。
- 表格 markdown 序列化 / round-trip（Gate E）不动。

### 2.6 AC · P0 fixture 3 case + 补充

**AC-2.1**（hover-未点击-不展开）：Given 表格已 render 且 pointer 未进入 table，When DOM inspect，Then `.vsword-table-col-handle / .vsword-table-row-handle / .vsword-table-col-menu / .vsword-table-row-menu` 均无可见元素（`display:none` 或不在 DOM 里）。

**AC-2.2**（hover 到 cell → handle 出现）：Given 表格已 render，When pointer `pointerenter` 到 `td[data-cell='r1c2']`，Then 该 cell 的 col-handle（col index=2）与 row-handle（row index=1）出现；离开该 cell 到另一 cell 时 handle 迁移到新 cell。

**AC-2.3**（点击 handle → 菜单展开）：Given AC-2.2 状态（col-handle 在 cell r1c2 上可见），When 用户 click 该 col-handle，Then 出现 `.vsword-table-col-menu[data-col='2']`，包含 `+左 +右 ← → 删 左中右` 6 个按钮；点击 `+右` 触发 preset-gfm `addColAfterCommand`（复用现有 dispatch 路径），DOM 上新增一列。

**AC-2.4**（外点击 → 折叠）：Given AC-2.3 状态（菜单展开），When 用户 mousedown 到 table 外的段落，Then 菜单折叠、handle 也隐藏（回到 IDLE）。

**AC-2.5**（切列自动关旧菜单）：Given 用户已展开 col=2 菜单，When 用户 hover 到 cell r0c5 并点该 cell 的 col-handle，Then col=2 菜单关闭、col=5 菜单打开（同时最多一个）。

**AC-2.6**（命令通道兼容）：现有 `tableChrome.test.ts` 里 `actionForButton` / `OP_TO_KEY` / cell selection seed 相关的既有 case 全部通过（回归保证命令层不动）。

### 2.7 拆子任务

| ID | 标题 | assignee | 依赖 | Gate |
|---|---|---|---|---|
| **T-3.12.2.a** | table-chrome NodeView 结构重写（hover-gated handle + click-expand menu） | dev | – | AC-2.1 ~ AC-2.5 单测通过（jsdom + `test/node/tableChrome.test.ts` 扩展）；AC-2.6 回归。 |
| **T-3.12.2.b** | CSS 层：隐藏旧 col-bar/row-bar 常驻规则 + 新增 col-handle/row-handle 样式 | dev | 2.a 结构 | 手测：hover cell 时 handle 出现、离开消失、位置贴 cell 边缘（Phase 3 policy 不动主题——只做**功能可见性**这一维，颜色/尺寸粗调即可，最终样式打磨留给 UI 布局阶段）。 |
| **T-3.12.2.c** | 端到端手测 · 3 P0 + 键盘可达性 sanity | qa | 2.a + 2.b | 3 P0 fixture 全过；键盘 Tab 到 cell 时 handle 可通过快捷键/上下文菜单激活（若不支持，qa 记 backlog 交 Phase 4 a11y 迭代——**Phase 3 不阻塞**）。 |

---

## §3 · 合并 DoD

- [ ] `docs/plans/003-phase3-fix-p0.md` 落盘（本文件）
- [ ] commit：`docs(plans): 003-phase3-fix-p0 · 保存打断+表格 chrome 修 PRD`
- [ ] **本地不 push**（Phase 3 PM 类文档 review-gated）
- [ ] kanban_block · `kind='needs_input'` · `reason='review-required: 003-phase3-fix-p0 PRD 完成 · 请 review 修复策略'`
- [ ] Review 通过后由 coordinator 派 T-3.12.1.a / .b / .c 与 T-3.12.2.a / .b / .c 六张卡进 kanban，assignee 按表分派 dev / qa

---

## §4 · 风险 & 备注

- §1 修完后需回归 T-3.9.2 IME checklist 全部 case（6+3），确认 gate 不误伤正常 flush 路径。
- §2 CSS 尺寸/颜色**故意不精调**（Phase 3 policy · 好看放一放）。UI 布局阶段与 corner 位置、handle 尺寸、颜色统一在最终 pass 里处理。
- 两个问题的子任务可**并行推进**（无 cross-file 冲突：§1 动 protocol + working copy + entry.template，§2 动 table-chrome.template + tableChrome.test）。
- 若 §1 修完后仍偶发丢字，可能是 Milkdown/PM 内部 composition 事件时序问题；此时降级到策略 D（markdownUpdated 携带 composingSnapshot），T-3.12.1.b 里预留一个 fallback branch 说明。

---

**PRD end**

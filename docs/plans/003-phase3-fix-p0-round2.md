# Phase 3 · P0-Fix Round-2 · T-3.12.1.c 回归 5 反馈修复 PRD

> **状态**：Round-2 fix PRD · 提出中 · 待 review
> **上游**：`003-phase3-fix-p0.md`（round-1 · done · 已归档不改动）
> 　　　　`003-phase3-mode-orthogonality.md`（v2 · 两级菜单 radio 设计原文）
> **触发**：`code-oss/test/reports/0710反馈.md`（用户手测 5 条反馈 · IME=中文 Rime）
> **原则**：只写 PRD 不改代码 · KISS · 中文 · 功能优先视觉延后
> **DoD**：本地 commit 不 push · kanban_block 待 review Q1/Q2 拍板

---

## §1 P0-1 · 自动保存仍打断 IME + 失焦（回归失败）

### 1.1 反馈原文

> "现在我进行输入法测试。还是自动保存会出现打断的情况。会失焦。输入法我进行了中文 rime 测试，其他我跳过。"

### 1.2 现状事实（PM 读码结果 · 不含推断）

- **Round-1 修复面**：
  - T-3.12.1.a：host 侧 `MilkdownWorkingCopy._webviewComposing` gate —— 收到 webview 的 `imeCompositionChanged` 消息后开关一个布尔位，dirty auto-save 路径读它并 skip。
  - T-3.12.1.b：webview 侧 `entry.template.js` L864-880 在 `#milkdown-root` 冒泡阶段挂 `compositionstart` / `compositionend` 监听，翻转时 `postMessage({type:'imeCompositionChanged', composing})`。
- **Round-1 未覆盖的路径**（待 dev 确认，PM 只列观察）：
  - webview → host 是 `postMessage` 异步 · host 收到 gate 翻转到"关"之间存在**~1 tick 延迟窗口**，若 auto-save 定时器命中窗口内则仍会 fire。
  - `handleDOMEvents` 路径未走（entry 注释明说"避开与 view-mode-editable setProps 的耦合"）· 冒泡阶段只在 `#milkdown-root` 层，若组件（math NodeView / 图片上传 dialog / find-widget input 等）**吞掉 composition 事件**或**在自己的 subtree 内 stopPropagation**，则不会冒泡到 root。
  - 用户反馈的"失焦" —— 目前 host/webview 都无显式 `blur()` 调用，Round-1 未定位来源。假设候选：Milkdown editor `createEditor()` 重建时 DOM replaceChild 副作用；host 侧文档 revert 触发的 view 重装。

### 1.3 三条假设（需 dev 逐一证伪）

| ID | 假设 | 验证方式 |
|---|---|---|
| **A** | Rime 特殊性 —— Rime 在候选窗关闭 → 上屏之间不 fire `compositionend`，或 fire 顺序与 Chromium 内置 IME 不同 | 打开 DevTools Console，`document.addEventListener('compositionstart\|compositionupdate\|compositionend', e => console.log(e.type, performance.now()))`，Rime 敲一段中文观察三事件时序 |
| **B** | 某条 auto-save 路径未走 `_webviewComposing` gate —— 如 host dirty tracker 独立触发的 external save / `flushOnDispose` / `revert` 路径 | grep `MilkdownWorkingCopy` 里所有 `writeFile`/`save` 调用点，逐点检查是否读 gate |
| **C** | 失焦不是 auto-save 直接触发，是 DOM 重建的副作用 —— save 完成后 host `_applyContentFromDisk` 或 `setMarkdown('external')` 触发 view 重装，contenteditable 元素被 replace，浏览器丢焦点 | 在 `createEditor` / `setMarkdown` 打点，与失焦时刻比对；若 save 后 200ms 内 view 重装 → 命中 C |

### 1.4 交付要求（dev · T-3.13.1）

- **必须**：产出**至少 1 条 100% 可复现步骤**（含具体 Rime 词组、按键节奏、光标位置、页面滚动状态），补进 `docs/qa/phase-3.12.1-ime-autosave-checklist.md` 的 Round-2 section
- **推荐修复策略**（三选一 · dev 依据 A/B/C 验证结果决定）：
  - 若 A 命中：webview 侧加 `compositionupdate` 作为兜底 gate（compositionend 迟到时用 compositionupdate 保持 gate open · 15 秒无 update 再自动 release）
  - 若 B 命中：在 host `MilkdownWorkingCopy` 所有 save 调用点前置统一门 `if (this._webviewComposing) return;`
  - 若 C 命中：保存后避免整片 DOM 重装 —— 若磁盘内容 === 内存内容则 skip `setMarkdown('external')`

### 1.5 AC（Round-2 通过条件）

- **AC-1.1**：Rime 连续输入"人工智能大语言模型"（8 字 · 2 秒内敲完 · 期间 auto-save 至少触发 1 次），编辑器不失焦，输入内容完整落库无字符丢失、无字符重复
- **AC-1.2**：Ctrl+S 手动保存在 composition 未 commit 时 no-op（保 checklist 现有断言不回归）
- **AC-1.3**：dev 交付的复现步骤 QA 可 100% 复现 fail → 修复后 100% 复现 pass
- **AC-1.4**：修复不引入新的 IME 场景回归（微软拼音 / 五笔 · 用户跳过实测，但 dev 至少跑一遍微软拼音自证）

---

## §2 · 阅读模式二级子菜单（normal / focus）缺失

### 2.1 反馈原文

> "阅读模式有问题，没有办法切二级在普通 / focus"

### 2.2 现状事实

- **代码来源**：`webview/mode-switch.template.js` L132-154 `applyModeVisibility(mode)`
  - `mode === 'reading'` 时**整块从 DOM 移除** `#milkdown-substyle-group`（`substyleGroupEl.parentNode.removeChild(substyleGroupEl)`）
  - 移除前记录 `parentEl + nextSibling` 到 `substyleAnchor`，切离 reading 时 `insertBefore` re-attach 复位
- **设计来源**：T-3.12.3.b（commit 3b6cdf3f · 归档在 `003-phase3-mode-orthogonality.md` §4.3）—— "阅读态自身即专注体验，不需要 overlay，因此二级菜单结构消除而非 disable 遮盖"
- **CSS gate**（`milkdownEditorHtml.ts` L147-156）：`data-substyle=focus` 与 `data-mode=reading` **在视觉上等价**（都触发 opacity 0.35 + `.vsword-focus-active` 恢复 1.0 的行内独占）

### 2.3 用户诉求解析

- 用户想在**阅读模式下**切换"整篇均匀展示 / 单行独占聚焦"两种阅读姿态
- 当前"阅读=永远 focus 视觉"是过度耦合 —— 两种阅读姿态在 v1 版本存在（reading 有独立 focus toggle），T-3.12.3.b 把它并进 substyle radio 后**只在 realtime/source 下可切**

### 2.4 修复方向（需求回退 · dev · T-3.13.2）

**方向选项**（Q1 待用户拍板 · §7）：

- **方向 A（推荐）**：阅读模式下也渲染 substyle radio · normal/focus/typewriter 三选一均生效
  - shell 属性由 `applyDom()` 直通（去掉 `visualSubstyle = reading ? 'normal' : substyle` 的强制归零）
  - reading × normal：opacity 全 1，无 dim 效果（纯净阅读）
  - reading × focus：opacity 0.35 + 活动块 1.0（现在的默认行为）
  - reading × typewriter：opacity 全 1 + 保留 typewriter re-scroll
- **方向 B**：阅读模式下只渲染 normal/focus 两个 radio（typewriter 保持隐藏，因为 reading 不该有打字机滚动）
  - mode-switch 组件需要新增"部分渲染"能力

### 2.5 拆动作（dev）

1. 移除 `mode-switch.template.js` `applyModeVisibility` 里的 reading DOM detach 分支（幂等 re-attach 逻辑保留供未来复用，也可直接删）
2. 修改 `mode-controller.template.js` `applyDom()`：
   - 去掉 `visualSubstyle = currentMode === 'reading' ? 'normal' : substyle` 强制归零
   - 保留 substyle localStorage 持久化不变
3. 修改 `mode-controller.template.js` L253/260 快捷键 gate：
   - Ctrl+Shift+F / Ctrl+Shift+T 在 reading 模式下不再 no-op，允许切换
4. 若走方向 B：`applyModeVisibility` 改为按 button 粒度控制显隐（typewriter button 加 `.vsword-hidden`），需先修 §5b 让 `.vsword-hidden` 实际生效
5. 更新 `viewModes.test.ts` 断言：新增"reading × substyle=focus/typewriter"三个 case（AC-2.2 覆盖）

### 2.6 AC

- **AC-2.1**：进入阅读模式后 substyle radio 三个按钮（普通/Focus/Typewriter）**可见且可点击**，aria-pressed 状态反映当前选中
- **AC-2.2**：reading × normal · reading × focus · reading × typewriter 三态在 shell 的 `data-substyle` 属性上正确反映；`viewModes.test.ts` 覆盖三态
- **AC-2.3**：切离阅读模式（→ realtime / source）后 substyle 值保持不变（localStorage 持久化不受本次改动影响）
- **AC-2.4**：（仅方向 B 生效时）reading 模式下 typewriter button 隐藏；A 方向此 AC 不适用

---

## §3 · Focus 模式语义错（累积残留高亮 · bug）

### 3.1 反馈原文

> "focus 模式应该聚焦在我输入 / 鼠标在的行，我鼠标滑过的行始终高亮"

### 3.2 现状事实

- **应有语义**（PRD 与代码一致）：`webview/focus-mode.template.js` L32-49 `computeActiveTopLevelBlock(state)` 依据 `state.selection.$from` 计算**唯一一个** top-level block，给它加 decoration `class="vsword-focus-active vsword-edit-context"`
- **plugin.apply** 每次 tr（含 selection tr）重新计算 → **理论上只有一行 active，不会累积**
- **用户实际观察**："鼠标滑过的行始终高亮" + "累积不清除" —— 说明**存在另一条路径**在给行加 class，且这条路径不清除
- **PM 排查线索**：
  - `focus-mode.template.js` 里没有 mouseenter / pointerenter / hover listener
  - grep `hover|pointerenter|mouseover` 在 milkdownEditor/webview/ 下，只有 CSS `:hover` 规则（`.vsword-md-button:hover` / `.vsword-md-mode-btn:hover` / `.vsword-slash-item:hover`），**无 JS 层 hover class 挂载**
  - 但**用户观察是"高亮"** —— 可能与 T-3.11.4 backlinks widget · block-handle drag 灯管 · 或 slash-menu 悬浮态某个残留 class 相互作用；也可能是 CSS `.vsword-focus-active { opacity:1 }` 的 dim 反向效果被用户理解为"高亮"

### 3.3 三条假设（dev 排查）

| ID | 假设 | 验证 |
|---|---|---|
| **α** | 用户看到的"鼠标滑过累积"其实是 CSS opacity 反差 —— hover 时浏览器把 line 的 pointer target 改成某种伪类高亮态，与 `data-substyle=focus` 的 0.35 dim 叠加视觉上像"划过留痕" | 关掉鼠标，纯用键盘方向键在 focus 下移动 cursor，观察是否仍有"累积"。若无 → α 命中 |
| **β** | 存在某个未识别的 plugin/listener 给 hover 行加了 `.vsword-focus-active` 或等价 class 且未清除 | DevTools element inspector 观察一段时间累积后 · 逐行查 class 属性 |
| **γ** | ProseMirror decoration 未正常触发重算 · `apply(tr)` 里 `tr.docChanged === false && tr.selectionSet === false` 时被短路 | 加日志验 apply 是否每次 hover 都被调用 |

### 3.4 修复方向（dev · T-3.13.3）

**分场景**：

- 若 α 命中：这不是 bug 而是**视觉设计冲突** —— 转 §7 Q2 决策"focus 高亮的判定基准应该是什么"
- 若 β 命中：定位并删除多余 listener / class；`focus-mode.template.js` 是唯一 decoration owner
- 若 γ 命中：apply 无条件重算（成本可控 · doc 变更时 already 重算，selection 变更时也重算即可）

### 3.5 单行独占语义强化（Q2 拍板后落地 · 参考三种候选）

| Q2 选项 | 语义 | 触发源 |
|---|---|---|
| **a** | Cursor 所在 top-level block 单行高亮 | `state.selection.$from`（现状） |
| **b** | 鼠标 hover 所在 top-level block 单行高亮 | `mousemove` + `posAtCoords()` |
| **c** | Cursor + Hover 叠加 · 二者都亮 | 组合两条路径 |

用户原话"聚焦在我输入/鼠标在的行" → 倾向 **c** · 但需拍板

### 3.6 AC

- **AC-3.1**：focus 模式下**任意时刻 DOM 内 `.vsword-focus-active` class 元素 ≤ 1 个**（顶级块粒度 · 断言写进 focusMode.test.ts）
- **AC-3.2**：光标移动 / 鼠标 hover 后 · 前一个高亮块**必须被清除**（无累积残留）
- **AC-3.3**：切离 focus 模式（→ normal / typewriter / 或走 reading × normal）后，`.vsword-focus-active` decoration 立即消失，opacity 恢复全 1.0

---

## §4 · Typewriter 语义写死（现状可接受 · 补 AC 防回归）

### 4.1 反馈原文

> "typewriter 应该保证我现在的输入框始终保持固定中间高度，如果页面太短还没有到位置不用管，现在没有大问题"

### 4.2 现状事实

- `webview/focus-mode.template.js` L85-100 `maybeRecenter()`：
  - `active.scrollIntoView({ block: 'center', behavior: 'smooth' })`
  - line-change gate：`Math.abs(y - lastCenterY) < 8` 短路 · 避免每字节抖动
  - `data-substyle=typewriter` 时 gate 开
- 用户"没大问题"→ **不改行为**，只把语义**写死进 AC 防回归**

### 4.3 交付要求（dev + qa · T-3.13.4）

- 不动 `focus-mode.template.js` 现有 typewriter 逻辑
- **补单测**：`focusMode.test.ts` 新增 typewriter section 覆盖 AC-4.1 ~ 4.3
- QA 手测补 checklist 一条

### 4.4 AC

- **AC-4.1**：typewriter 模式 · 光标 top-level block 的**屏幕垂直中心**位于视口 `50% ± 15%` 区间（tolerance 15% 覆盖 smooth scroll 中间态 + 行高抖动）
- **AC-4.2**：页面总内容高度 < 视口高度时**不强制居中**（现行行为：`scrollIntoView` 在页面已完全可见时 no-op，AC 允许）
- **AC-4.3**：intra-line 字符输入（8px 阈内）**不触发 recenter**（防抖动 · 现有 line-change gate 保障）
- **AC-4.4**：切离 typewriter（→ normal / focus）后 `lastCenterY` 重置为 `-1`（现有 `typewriterEnabled(shell)===false → lastCenterY = -1` 已保障）

---

## §5 · UI 布局两处

### 5a · 顶部模式切换栏应浮动置顶（sticky）

#### 5a.1 反馈原文

> "顶部切换状态栏需要浮动置顶"

#### 5a.2 现状事实

- `milkdownEditorHtml.ts` L68-76 `.vsword-md-toolbar`：无 `position` 属性 · 走 flex 布局
- `.vsword-md-shell`（L67）：`display: flex; flex-direction: column; min-height: 100vh`
- `#milkdown-root`（L117-123）：`flex: 1; min-height: 0; overflow: auto`
- **结构上滚动容器是 `#milkdown-root` 自己**，header 在 shell 里而不在滚动容器内 —— 按 flex column 语义 header 本应保持在页面顶部不随 root 滚动而动
- 但用户报"滚走了" · 需要 dev 用 DevTools 定位实际 scroll container 是不是 body（若 shell 高度不足撑满 viewport → body 滚 → header 跟走）

#### 5a.3 修复（dev · T-3.13.5）

- Toolbar 加 `position: sticky; top: 0; z-index: 5; background: ...` （z-index 让 sticky toolbar 覆盖下方内容 · background 不透 · Q1 决定是否毛玻璃）
- **前置排查**：先确认 shell / body 谁在滚 —— 若是 body 滚导致 flex 布局失效，应先让 shell 撑满 viewport（`height: 100vh` 替代 `min-height: 100vh`）再 sticky

#### 5a.4 AC

- **AC-5a.1**：内容超过 1 屏时，滚到底 · 顶部 toolbar 保持在视口顶部可见
- **AC-5a.2**：toolbar 下方内容滚过时 · toolbar 不被内容遮盖（z-index / background 生效）
- **AC-5a.3**：切换模式 realtime / reading / source 三态下 sticky 均生效（source 模式下 `#milkdown-root` display:none · sticky 参考不变）

### 5b · 底部查找 / 替换栏常驻不消失（P0 视觉噪音大）

#### 5b.1 反馈原文

> "下侧会始终有这个替换栏存在"（截图 `assets/image-1.png`）

#### 5b.2 现状事实（**根因已定位**）

- **`.vsword-hidden` class 在 CSS 里从未定义**：
  - grep `.vsword-hidden` 在 `milkdownEditorHtml.ts` 无任何 CSS 规则
  - grep 在 milkdownEditor/**/*.{ts,js,mjs} 只匹配到 JS 侧 `classList.add/remove('vsword-hidden')` + `exportHtmlAssemble.ts` 的清洗黑名单
- **`webview/find-widget.template.js`** 的显隐机制：
  - 初始 `wrap.className = 'vsword-find-widget vsword-hidden'`（L331）
  - `open()` L270 `el.classList.remove('vsword-hidden')`
  - `close()` L299 `el.classList.add('vsword-hidden')`
  - **依赖 `.vsword-hidden { display: none }` 或等价规则**
- **结果**：CSS 无 `.vsword-hidden` 规则 → class add/remove 完全无视觉效果 → widget 挂载后立即可见 · Ctrl+F 已经"开"过一次的假象 · 关闭按钮 click 也只是空转 class

#### 5b.3 修复（dev · T-3.13.6 · P0 优先级最高）

**主修**（二选一）：
- **修 A（推荐）**：在 `milkdownEditorHtml.ts` 的 `<style>` 里加一条：
  ```css
  .vsword-hidden { display: none !important; }
  ```
  - 影响面小 · one-liner · 与 find-widget 现有 API 契合
  - `!important` 防被其他 layer CSS 覆盖（find-widget 自身没定义 display，加了 !important 也不会破 layout）
- **修 B**：把 find-widget 的显隐改成走 `hidden` 属性 · 浏览器原生支持 · 但需改 find-widget open/close/mount 三处

**副作**：修复后 replace-row 的常驻问题一并解决（同一 class）

#### 5b.4 AC

- **AC-5b.1**：编辑器首次加载 · 底部查找栏**不可见**
- **AC-5b.2**：Ctrl+F 打开 · 查找栏可见 · input 自动 focus
- **AC-5b.3**：Ctrl+H 打开 · 查找栏 + 替换栏均可见
- **AC-5b.4**：Esc / × 按钮关闭 · 查找栏**彻底隐藏**（无高度占位 · 不占滚动位置）
- **AC-5b.5**：关闭后 focus 回到编辑器（现有 `close()` 里 `getView()?.focus?.()` 已实现，AC 顺带回归）

---

## §6 · 子任务拆分（T-3.13.x · Round-2 修卡）

| ID | Title | Assignee | Priority | 依赖 | 预估 |
|---|---|---|---|---|---|
| T-3.13.1 | IME 回归根因调研 + 修 | dev | **P0** | 无 | 中 · A/B/C 假设逐一验 |
| T-3.13.2 | 阅读模式二级菜单恢复（Q1 拍板后） | dev | P1 | Q1 拍板 | 小 · 改 mode-switch + mode-controller |
| T-3.13.3 | Focus 单行独占语义修（Q2 拍板后） | dev | P1 | Q2 拍板 | 中 · 视 α/β/γ 结论 |
| T-3.13.4 | Typewriter AC + 单测 | dev+qa | P2 | 无 | 小 · 只补测试 |
| T-3.13.5 | 顶部工具栏 sticky | dev | P1 | 无 | 小 · CSS + DevTools 排查 |
| T-3.13.6 | 底部查找栏受控开关（`.vsword-hidden` 补 CSS） | **dev** | **P0** | 无 | **XS · one-liner** |
| T-3.13.7 | QA 端到端回归 | qa | P0 | 3.13.1-6 全绿 | 中 · 5 条反馈重跑 |

**并行度**：T-3.13.6 (P0 · XS) 应最早开工；T-3.13.1 (P0 · 中) 与 T-3.13.5/6 无冲突可并行；T-3.13.2/3 等 Q1/Q2 拍板后开工。

---

## §7 · 用户拍板问题（至少 2 条 · 必答）

### Q1 · 顶部工具栏 sticky 时是否做半透明毛玻璃？

- **a**（推荐 · KISS）：不透明纯色背景（沿用 `color-mix(bg 94%, fg)`），只加 sticky + z-index + border-bottom
- **b**：半透明 `backdrop-filter: blur(6px); background: color-mix(bg 70%, transparent)` 毛玻璃效果
- **c**：Phase 3 阶段策略"视觉延后" · 先做 **a** · 毛玻璃留最后 UI 布局阶段统一改

> **PM 倾向**：**c**（Phase 3 项目原则："视觉调优统一放到最后 UI 布局阶段"）· 请用户拍

### Q2 · Focus 单行高亮的行判定基准？

- **a**：光标所在行（cursor · `state.selection.$from`）· 与现状代码一致
- **b**：鼠标 hover 所在行（`mousemove` + `posAtCoords`）· 需新 listener
- **c**：**两者叠加**（光标行 + hover 行都亮 · 二者不同则同时两行亮 · 相同则一行）
- **d**：优先鼠标 hover · 无 hover 时 fallback 到光标（模拟纸质文档"目光跟随"体验）

> **用户原话**："聚焦在我输入 / 鼠标在的行" —— 字面读是**两者都要**
> **PM 倾向**：**c**（尊重用户原话 · 但 AC-3.1「≤ 1 个 active」需相应放宽到「≤ 2 个」）· 请用户拍
> **备选**：若 §3 排查后 α 命中（不是 bug 是视觉冲突），Q2 变成"要不要保留 focus dim 效果" —— 由 dev 回报后再问

### Q3（选做 · 若 §2 走方向 B）· 阅读模式下 typewriter button 是否也应保留？

- **a**：保留三个 radio button 全渲染（方向 A）· reading × typewriter 也有效 · 语义"阅读时也想滚动跟随"
- **b**：reading 下 typewriter button 隐藏（方向 B）· 只保留 normal / focus 二选一

> **PM 倾向**：**a**（方向 A · 结构简单 · 无需 mode-switch 增加"部分渲染"能力）

---

## DoD

1. commit `docs(plans): 003-phase3-fix-p0-round2 · T-3.12.1.c 回归 5 反馈 fix PRD`，本地不 push
2. kanban_block({kind: 'needs_input', reason: 'review-required: 003-phase3-fix-p0-round2 PRD 完成 · 请 review Q1/Q2 拍板 + 子任务优先级'})
3. **不改代码** —— round-1 (`003-phase3-fix-p0.md`) 已归档保持不动，本 round-2 独立 PRD

## 附录 · Round-1 / Round-2 差异一览

| 反馈条 | Round-1 处理 | Round-2 (本 PRD) |
|---|---|---|
| IME 打断 | T-3.12.1.a/b · gate 已加 | **回归失败** · T-3.13.1 复盘 |
| 阅读模式二级菜单 | T-3.12.3.b · 主动 DOM detach | **需求回退** · T-3.13.2 恢复 |
| Focus 语义 | T-3.10 · $from 单行 decoration | **bug** · T-3.13.3 排查累积残留 |
| Typewriter | T-3.10 · line-change scrollIntoView | **写死 AC** · T-3.13.4 补测 |
| 顶部 sticky | 未涉及 | **新增** · T-3.13.5 |
| 底部查找栏常驻 | 未涉及 | **P0 bug** · T-3.13.6 · CSS 缺 `.vsword-hidden` |

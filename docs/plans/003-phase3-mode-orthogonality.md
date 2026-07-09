# 003 · Phase 3 · 模式切换正交性调研 PRD

> 状态：v1 · 待 review
> 关联 kanban：t_4dd379f7（本卡）
> 上游依赖：T-3.7b（视图模式全套 · commit `ce03f41f`）· T-3.10（focus/typewriter 独立化）
> 下游拆分：本 PRD §7 定义 T-3.12.3.a / .b / .c 三张子卡
> 类型：调研 + Fix PRD（非新增功能，收敛现有正交空间的语义歧义）
> 语言：中文 · KISS · Phase 3 policy 不动主题/CSS 视觉调优（除非阻断功能验证）· "好看"放一放

---

## 0 · 背景

### 0.1 起因

`docs/plans/003-phase3-fix-p0.md` v1 只覆盖了「保存打断输入」(§1) 与「表格 chrome UX」(§2) 两个 P0，**漏做了用户 2026-07-09 追加反馈里的第 §3 项 · 模式正交性**。本 PRD 补做该节，独立成文，产出可拍板的最终矩阵与实现方案。

### 0.2 用户原话（2026-07-09）

> 现在的 md 文档预览格式划分五个（实时渲染 / 阅读 / 源码 / Focus / Typewriter），但是这五个现在是 3+2 的关系，及 typewriter 和 focus 可以和其他组合，这个有点问题。例如 typewriter 明显不能是阅读的格式，而是实时预览的格式。focus 倒是可以组合。关于这个需要调研再细化一下需求。

一句话：**3+2 的正交结构在部分组合上语义崩坏，需要一张明确的合法性表 + UI 处理策略。**

### 0.3 现状总览

- 三态 radio：`realtime / reading / source`（互斥，`mode-controller.js` 状态机保证）
- 双 toggle：`focus / typewriter`（独立、可与三态任意组合）
- 组合空间：3 × 2 × 2 = **12 种理论组合**
- 现有实现（`mode-controller.template.js` + `focus-mode.template.js`）：
  - source × focus / typewriter：**视觉禁用 + stored 保留**（点击忽略、按钮 disabled、切离恢复）
  - **reading × typewriter：现有 focus-mode.template.js L52-56 里有一个 legacy fallback** —— `data-mode === 'reading'` 时无条件启用 typewriter recenter（"阅读模式用来 auto-typewriter"）—— 这就是用户吐槽的核心不合理点
  - reading × focus：Milkdown 内正常叠加（无冲突）
  - realtime × focus / typewriter：正常主场景

---

## §1 · 现状矩阵（12 种组合逐条）

图例：✅ 合法 · ⚠️ 语义可疑 · ❌ 无意义

| # | mode | focus | typewriter | 当前行为 | 语义评估 |
|---|---|---|---|---|---|
| C-1  | realtime | off | off | 默认 WYSIWYG | ✅ |
| C-2  | realtime | on  | off | 段落聚焦 | ✅ US-3 主场景 |
| C-3  | realtime | off | on  | 光标居中 | ✅ US-4 主场景 |
| C-4  | realtime | on  | on  | 聚焦 + 居中叠加 | ✅ 允许 |
| C-5  | reading  | off | off | 只读预览 | ✅ US-2 主场景 |
| C-6  | reading  | on  | off | 只读 + 段落聚焦（辅助长文阅读，Bear/Ulysses 都有） | ✅ |
| C-7  | reading  | off | on  | 只读 + typewriter | ⚠️ **阅读模式无光标（caret-color transparent），"当前行居中"锚点不存在**；现有代码还会 fallback 强制 typewriter，双重歧义 |
| C-8  | reading  | on  | on  | 只读 + 聚焦 + typewriter | ⚠️ 同 C-7 |
| C-9  | source   | off | off | textarea 直编 | ✅ |
| C-10 | source   | on  | off | 视觉禁用（stored 保留） | ⚠️ ProseMirror 装饰 `.vsword-focus-active` 在 textarea 下不存在；当前"视觉禁用+stored 保留"能跑但用户看到按钮"点了没反应"会困惑 |
| C-11 | source   | off | on  | 视觉禁用（stored 保留） | ⚠️ 同 C-10；typewriter recenter 绑 `view.coordsAtPos`，textarea 无 view |
| C-12 | source   | on  | on  | 视觉禁用（stored 保留） | ⚠️ 同 C-10 / C-11 |

**结论**：`realtime × *` 4 种合法。`reading × *` 有 2 种（C-7 / C-8）语义歧义。`source × *` 有 3 种（C-10 / C-11 / C-12）视觉禁用但用户体验模糊。**共 5/12 组合待处理**。

---

## §2 · 对标产品调研

### 2.1 Typora（macOS/Win，成熟 markdown 编辑器）

- 模式清单：Source Code / Reading（Preview） / Focus Mode / Typewriter Mode
- 三态映射：Source 与 WYSIWYG 互斥；无独立 Reading 三态（Preview 是弹独立窗口）
- Focus / Typewriter：**独立 menu toggle**，可与 WYSIWYG 叠加；进入 Source Code 后菜单里 Focus / Typewriter 项**灰**（disabled）不 hide，切回 WYSIWYG 自动生效
- **对我们的启发**：source × toggle → **disable 灰按钮**（策略 a），是 Typora 采用的路线，保持发现性

### 2.2 iA Writer（macOS/Win/iOS，极简写作专用）

- 模式清单：Edit / Preview / Focus Mode / Nightmode（后者已并入主题）
- 无独立 Reading×Focus 组合：Focus Mode 只在 Edit 下生效；进入 Preview 时 Focus **auto-off**（切回 Edit 自动恢复）
- Typewriter：iA Writer 里叫 "Focus Mode" 的一部分，语义即"当前句/段亮 + 保持位置居中"—— 更接近我们的 Focus + Typewriter 组合
- **对我们的启发**：预览模式下 Focus 自动关掉（策略 c auto-off + 静默或轻提示），切回自动恢复，是**"避免用户看到无效状态"**的最优体验路径

### 2.3 Bear（macOS/iOS，笔记 + markdown）

- 模式清单：Editor / Preview / Focus Mode
- Focus Mode 在 Editor 下可用；Preview 下 Focus 按钮 **hide**（策略 b）
- Bear 没有 typewriter 概念
- **对我们的启发**：hide 干净但**发现性差**——用户可能不知道 Focus 存在。不推荐。

### 2.4 Obsidian（跨平台，插件生态）

- 三态：Editing (Live Preview) / Editing (Source) / Reading View —— 与我们 realtime / source / reading **几乎 1:1 对应**
- Focus：不是内置功能，靠插件（Focus Mode plugin）实现；Reading View 下插件通常 no-op
- Typewriter：靠插件（Typewriter Scroll plugin）实现；插件文档明确说 "Reading view is not supported"
- **对我们的启发**：三态划分与我们一致，验证了正交决策的合理性；插件生态里"某模式不支持"的处理方式**都是静默 no-op**（策略 c），因为 Obsidian 主打非侵入

### 2.5 调研小结

| 产品 | source/预览 × focus/typewriter | UI 策略 |
|---|---|---|
| Typora | 视觉禁用 stored 保留 | **disable 灰按钮** |
| iA Writer | 切模式时自动关 | **auto-off + 静默** |
| Bear | 预览下隐藏 focus | hide |
| Obsidian（插件） | 静默 no-op | auto-off + 静默 |

**主流路径 2 条**：**Typora disable** vs **iA Writer / Obsidian auto-off**。hide 是少数派、发现性差。

---

## §3 · 语义论证（关键论点）

### 3.1 Typewriter · 光标自动居中滚动

- **× realtime**：✅ 有意义 —— 光标存在、`view.coordsAtPos()` 可算 Y 坐标、8px gate 触发 scrollIntoView（现状实现）
- **× reading**：❌ **应禁用** —— 阅读模式 caret-color: transparent、无编辑光标可锚定；现有 legacy fallback（`focus-mode.template.js` L52-56，"reading 时无条件 typewriter"）**属于遗留错误**，与用户直觉相反；用户原话「typewriter 明显不能是阅读的格式」即指此处
- **× source**：⚠️ **不推荐** —— source 模式是 `<textarea>` 直编，光标是浏览器 native caret，`view.coordsAtPos()` 不可用（ProseMirror view 不存在于 textarea 内）；理论上可以给 textarea 加原生 `selectionStart` + scrollIntoView 的独立实现，但**开发成本 > 用户价值**（源码模式是短暂工具态，非长时写作），Phase 3 不做

### 3.2 Focus · 当前段/句高亮 + 其余淡化

- **× realtime**：✅ 主场景
- **× reading**：✅ **保留** —— Bear / Ulysses / iA Writer 都有"只读+聚焦"叠加，用于长文顺读时"这段读到哪了"的辅助；只读时选区仍可移动、`.vsword-focus-active` 装饰依然能定位到当前段落
- **× source**：❌ **应禁用** —— Focus 装饰依赖 ProseMirror 的 `Decoration.node()` 挂在 `.ProseMirror` DOM 上；source 模式渲染的是 `<textarea>`，装饰无处附着；即便 CSS 强改 textarea 也没有"段落"这一 DOM 结构可淡化

### 3.3 用户拍板问题落点

综上，**5 个待处理组合的最终决策收敛到 2 组问题**：

| 组合 | 建议 | 需拍板？ |
|---|---|---|
| C-7 / C-8 · reading × typewriter | 禁用（legacy fallback 移除） | **Q1** |
| C-11 / C-12 · source × typewriter | 禁用 | Q1（并入） |
| C-10 · source × focus | 禁用 | **Q2** |
| C-6 · reading × focus | ✅ 保留（辅助阅读） | 无需拍板 |

**Q1 = Q2 = 禁用**（PM 主张），剩下的分歧只在**UI 呈现方式**（disable / hide / auto-off）· **Q3**。

---

## §4 · 目标矩阵（PM 推荐）

| # | mode | focus | typewriter | 目标行为 | UI 呈现（Q3 推荐 c） |
|---|---|---|---|---|---|
| C-1  | realtime | off | off | 默认 | 两 toggle 按钮可用 |
| C-2  | realtime | on  | off | 段落聚焦 | 同上 |
| C-3  | realtime | off | on  | 光标居中 | 同上 |
| C-4  | realtime | on  | on  | 聚焦+居中叠加 | 同上 |
| C-5  | reading  | off | off | 只读 | typewriter auto-off（若切前 on）；focus 可用 |
| C-6  | reading  | on  | off | ✅ 只读+聚焦 | focus 可用 |
| C-7  | reading  | off | on  | ❌ **不可达** —— 切 reading 时 typewriter auto-off；切回 realtime 恢复 | typewriter 按钮 disabled + hover title「阅读模式无光标锚点，暂不支持打字机」|
| C-8  | reading  | on  | on  | ❌ 同 C-7 | 同上 |
| C-9  | source   | off | off | textarea 直编 | 两 toggle 按钮 disabled + 恢复态保留 |
| C-10 | source   | on  | off | ❌ 不可达（切 source 时 focus auto-off） | focus 按钮 disabled |
| C-11 | source   | off | on  | ❌ 不可达（切 source 时 typewriter auto-off） | typewriter 按钮 disabled |
| C-12 | source   | on  | on  | ❌ 同上 | 两按钮 disabled |

### 4.1 "auto-off" 与 "stored 保留" 的关系

- **当前实现**：source 模式下 stored 保留、切回时视觉恢复（相当于策略 d "保留 stored"）
- **本 PRD 推荐**：**stored 保留 + 视觉 auto-off + 状态位从 memento 读取**——切走时 UI 显示为 off、切回时立刻恢复到用户切走前的 on/off 值。这样：
  - Typora 用户直觉（切回自动恢复）：满足
  - iA Writer 直觉（预览下 Focus 关掉）：视觉满足
  - 一致性最强，且**不新增状态字段**（沿用 `focusOn / typewriterOn` 私有变量 + `applyDom()` 里的 `visualFocus / visualTypewriter` 变量，把 `mode !== 'source'` 的门扩展为 `!isFocusInvalidUnderMode(mode)` 通用谓词）

### 4.2 PM 推荐总方案（一句话）

**引入合法性谓词 `isCombinationValid(mode, toggle)`，非法组合下：stored 值保留、视觉禁用、按钮 disabled 且带 hover title 说明；切回合法 mode 时视觉恢复到 stored 值。**（策略 a disable + 策略 c 语义 auto-off 的融合，本质是 Typora + iA Writer 的中庸取法）

---

## §5 · UI 交互方案

### 5.1 Q3 三选一

| | a) disable 灰按钮 | b) hide 隐藏 | c) auto-off + toast |
|---|---|---|---|
| 发现性 | ✅ 高 | ❌ 低 | ✅ 高（切换瞬间提示） |
| 视觉稳定 | ✅ 布局不跳 | ❌ 按钮消失布局重排 | ✅ 布局不跳 |
| 用户教育 | ⚠️ 需 hover 才知道原因 | ❌ 完全不知道 | ✅ toast 明确告知 |
| 实现成本 | 低（现有基础） | 中（要写显隐 CSS） | **中**（要写 toast + 复用现有 disabled） |
| 一致性 | Typora 派 | Bear 派 | iA Writer 派 |
| Phase 3 政策 | 不动 CSS ✅ | 动 CSS ⚠️ | 需 toast 组件（新增视觉资产 ⚠️） |

**PM 推荐**：**a) disable 灰按钮**——Phase 3 policy "好看放一放"下最省事：

1. 现有代码已经在 source 下给 toggle 加了 `btn.toggleAttribute('disabled', currentMode === 'source')`（`mode-controller.template.js` L76），基础设施 90% 就绪；
2. 把 disabled 判定从"仅 source"扩展为"当前 mode 下该 toggle 是否合法"，一行谓词收工；
3. hover title 用原生 `title=""` 属性，无需引入 toast 组件；
4. auto-off + toast 需要新增 toast 组件 —— Phase 3 无 toast 基建，新做属于视觉资产，与"好看放一放"矛盾。

**若用户拍 c**（想要更 iA Writer 风的体验）：PM 会加一张 T-3.12.3.d 卡引入最小 toast（复用 VS Code notification 或自建轻组件），成本 +6h。

### 5.2 伪 DOM（Q3=a 情况）

```html
<div id="milkdown-toggle-group">
  <button class="vsword-md-toggle-btn" data-toggle="focus"
          aria-pressed="false"
          disabled                     <!-- 当 mode=source 时 -->
          title="源码模式下暂不支持专注">…</button>
  <button class="vsword-md-toggle-btn" data-toggle="typewriter"
          aria-pressed="false"
          disabled                     <!-- 当 mode∈{reading,source} 时 -->
          title="阅读/源码模式下暂不支持打字机">…</button>
</div>
```

### 5.3 合法性谓词（实现草稿）

```js
// mode-controller.template.js 新增
function isToggleValidUnderMode(mode, kind) {
  if (kind === 'focus')      return mode !== 'source';               // realtime, reading ✅
  if (kind === 'typewriter') return mode === 'realtime';             // 仅 realtime ✅
  return false;
}
```

原 `applyDom()` 里：
```js
const visualFocus      = focusOn      && isToggleValidUnderMode(currentMode, 'focus');
const visualTypewriter = typewriterOn && isToggleValidUnderMode(currentMode, 'typewriter');
// disabled 判定同步升级
btn.toggleAttribute('disabled', !isToggleValidUnderMode(currentMode, kind));
```

配套修：`focus-mode.template.js` L52-56 移除 legacy `data-mode === 'reading' → typewriter=true` fallback。

---

## §6 · AC · Given/When/Then

### AC-1 · reading × typewriter 禁用
**Given** 用户在 realtime + typewriter=on，**When** 用户按 Ctrl+/ 切到 reading，**Then**：
- shell 属性 `data-typewriter` 变为 `off`
- typewriter 按钮 disabled 且 `aria-pressed="false"`
- 编辑器不再触发 `scrollIntoView` 居中
- **切回 realtime 后**，`data-typewriter` 恢复为 `on`、按钮恢复 `aria-pressed="true"`（stored 保留）

### AC-2 · source × focus/typewriter 禁用
**Given** 用户在 realtime + focus=on + typewriter=on，**When** 用户切到 source，**Then**：
- `data-focus` / `data-typewriter` 均为 `off`
- 两 toggle 按钮 disabled
- 切回 realtime 后两者恢复为 `on`（stored 保留）

### AC-3 · reading × focus 合法
**Given** 用户在 reading 模式，**When** 用户点 focus 按钮或按 Ctrl+Shift+F，**Then**：
- `data-focus="on"`
- `.vsword-focus-active` 装饰仍生效（当前段落亮、其余淡化）
- Milkdown 只读态未被破坏

### AC-4 · memento 持久化
**Given** 用户在 realtime + focus=on + typewriter=on，**When** 用户切到 source → 关闭编辑器 → 重开同一文件 → 切回 realtime，**Then** focus 与 typewriter 均恢复 `on`（stored via `VSWORD_MILKDOWN_FOCUS_STORAGE_KEY` / `_TYPEWRITER_STORAGE_KEY`，与 T-3.7b 现有链路一致）

### AC-5 · a11y
**Given** 任意非法组合触发时，**When** DOM inspect toggle 按钮，**Then**：
- `disabled` 属性存在
- `aria-pressed` 反映**视觉状态**（off），不是 stored 状态
- `title` 属性给出原因文案（"源码模式下暂不支持专注" / "阅读或源码模式下暂不支持打字机"）
- 键盘 Ctrl+Shift+F/T 在该模式下按键不生效（现有 `if (currentMode === 'source') return` 需扩展为 `if (!isToggleValidUnderMode(currentMode, kind)) return`）

---

## §7 · 拆子任务

| ID | 标题 | assignee | 依赖 | Gate |
|---|---|---|---|---|
| **T-3.12.3.a** | mode-controller.mjs 引入 `isToggleValidUnderMode` 合法性谓词 + `applyDom()` 视觉禁用 + 键盘 gate；移除 focus-mode.template.js legacy reading→typewriter fallback | dev | – | mocha 单测：12 组合矩阵每格 (mode, focus, typewriter) → 期望 `data-*` + `disabled` + `aria-pressed` 断言全过；tsc 0 error |
| **T-3.12.3.b** | mode-switch.mjs / `milkdownEditorHtml.ts` 更新 UI 呈现（按 Q3 结论走）；toggle 按钮 hover title 中文文案 | dev | 3.a | 手测：切 reading 时 typewriter 按钮变灰、切 source 时两按钮变灰；hover title 显示；切回恢复 |
| **T-3.12.3.c** | 单测扩展 + 手测 checklist（12 组合矩阵） | qa | 3.a + 3.b | `test/node/viewModes.test.ts` 或新建 `modeOrthogonality.test.ts` 覆盖 12 case；手测 checklist 全过 |

**并行度**：3.a 与 3.b 有 DOM 契约耦合（`data-toggle` 属性名）但代码路径分离，可并行；3.c 顺序执行等前两卡合并。

---

## §8 · 涉及文件

**改**：
1. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mode-controller.template.js`
   - 新增 `isToggleValidUnderMode(mode, kind)` 谓词
   - `applyDom()` 里的 `mode !== 'source'` 门升级为通用谓词
   - toggle click handler 内 `if (currentMode === 'source') return` 升级为 `if (!isToggleValidUnderMode(currentMode, kind)) return`
   - 键盘 keydown Ctrl+Shift+F/T 同上升级
2. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/focus-mode.template.js`
   - 移除 `typewriterEnabled(shell)` 里的 legacy fallback（L52-56 `data-mode === 'reading'` 分支）
3. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mode-switch.template.js`
   - `updateAriaPressed(state)` 里 toggle 按钮的 `disabled` 属性联动（若走 component 接管路径）
4. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/milkdownEditorHtml.ts`（若 title 文案硬编码在 HTML 骨架里）
   - toggle 按钮 `title=""` 文案字段
5. `code-oss/src/vs/workbench/contrib/vsword/test/node/viewModes.test.ts`（或新建 `modeOrthogonality.test.ts`）
   - 12 组合矩阵断言

**不改**：
- `milkdownEditorProtocol.ts`（协议不新增字段——stored 值保留由 memento 已有链路完成）
- `IVSWordViewModeService`（若已就位）—— service 层只需在 `setMode()` 后触发 UI apply，无接口变化
- 主题/CSS 视觉资产（Phase 3 policy）

---

## §9 · 用户拍板 Q（PM 推荐 + 理由）

### Q1 · Typewriter × 源码
- a) 合法（新做 textarea 独立居中滚动实现）
- b) **禁用** ← **PM 推荐**
- c) auto-off + toast

**理由**：源码是短暂工具态、非长时写作场景；`view.coordsAtPos` 依赖 ProseMirror view 不适用 textarea；新做 textarea 原生 selection + scrollIntoView 的独立实现开发成本 > 用户价值；禁用一致于 Focus。

### Q2 · Focus × 源码
- a) 合法（新做 textarea 段落淡化 CSS）
- b) **禁用** ← **PM 推荐**
- c) auto-off + toast

**理由**：Focus 装饰依赖 ProseMirror `Decoration.node()` 挂 `.ProseMirror` DOM；source 渲染 `<textarea>` 无段落结构；即便 CSS 强改也无"段落"可淡化。禁用是唯一诚实答案。

### Q2b · Typewriter × 阅读（隐含并入 Q1）
- a) 合法（保留现有 legacy fallback）
- b) **禁用** ← **PM 推荐**
- c) auto-off + toast

**理由**：**用户原话直接点名此点**。阅读模式 caret 透明、无编辑光标、"当前行"锚点不存在；现有 focus-mode.template.js L52-56 legacy fallback 属遗留错误。

### Q3 · UI 呈现
- a) **disable 灰按钮 + hover title** ← **PM 推荐**
- b) hide 隐藏
- c) auto-off + toast

**理由**：Phase 3 policy "好看放一放"，disable 是唯一不引入新视觉资产（toast 组件、显隐动画）就能做到"发现性 + 视觉稳定"的方案；现有代码 `btn.toggleAttribute('disabled', ...)` 基础设施 90% 就绪，改动最小；Typora 采用同路径，验证过体感可接受。若用户选 c，追加 T-3.12.3.d 引入最小 toast，+6h 工作量。

---

## DoD

- [x] `docs/plans/003-phase3-mode-orthogonality.md` 落盘（本文件）
- [ ] commit：`docs(plans): 003-phase3-mode-orthogonality · 模式正交性调研 PRD`
- [ ] **本地不 push**（Phase 3 PM 类文档 review-gated）
- [ ] `kanban_block` · `kind='needs_input'` · `reason='review-required: mode-orthogonality PRD 完成 · 请回答 Q1/Q2/Q3'`
- [ ] Review 通过后由 coordinator 派 T-3.12.3.a / .b / .c 三张卡进 kanban，assignee 分派 dev / qa

---

## 风险 & 备注

- 移除 `focus-mode.template.js` L52-56 legacy reading→typewriter fallback 可能影响老用户"reading 时自动 typewriter"的肌肉记忆。**mitigation**：若真有用户依赖，可在 §5 UI 层给 reading 模式一个额外的一次性 tip"若想要打字机滚动请留在实时渲染模式"；但**推荐不加**——用户原话已明确否定此叠加。
- Q3 若最终选 c（auto-off + toast），toast 组件设计需与 VS Code notification 或自研轻组件二选一，属于新增视觉资产，与 Phase 3 policy 冲突。建议延到 UI 布局阶段再考虑。
- 与已进行中的 T-3.12.1 (IME) / T-3.12.2 (table chrome) 无 cross-file 冲突：本卡改 mode-controller.template.js / focus-mode.template.js / mode-switch.template.js，前两卡改 entry.template.js / milkdownWorkingCopy.ts / table-chrome.template.js，可并行。

---

**PRD end**

# 003 · Phase 3 · 模式切换正交性调研 PRD

> 状态：**v2 定稿 + T-3.13.2 修订 · RD-4 对账关闭**（2026-07-13）
> 关联 kanban：t_4dd379f7（本卡）
> 上游依赖：T-3.7b（视图模式全套 · commit `ce03f41f`）· T-3.10（focus/typewriter 独立化）
> 下游拆分：本 PRD §7 定义 T-3.12.3.a / .b / .c 三张子卡
> **现行语义指针**：`docs/decisions/0005-rd4-mode-orthogonality.md`（**阅读下二级菜单保留并三档生效**，覆盖下文 §4 M-4 / §6 AC-1～2 的「阅读隐藏」条款）
> 类型：调研 + Fix PRD（非新增功能，收敛现有正交空间的语义歧义）
> 语言：中文 · KISS · Phase 3 policy 不动主题/CSS 视觉调优（除非阻断功能验证）· "好看"放一放

---

## 0 · 背景

### 0.1 起因

`docs/plans/003-phase3-fix-p0.md` v1 只覆盖了「保存打断输入」(§1) 与「表格 chrome UX」(§2) 两个 P0，**漏做了用户 2026-07-09 追加反馈里的第 §3 项 · 模式正交性**。本 PRD 补做该节，独立成文，产出可拍板的最终矩阵与实现方案。

### 0.2 用户原话（2026-07-09）

> 现在的 md 文档预览格式划分五个（实时渲染 / 阅读 / 源码 / Focus / Typewriter），但是这五个现在是 3+2 的关系，及 typewriter 和 focus 可以和其他组合，这个有点问题。例如 typewriter 明显不能是阅读的格式，而是实时预览的格式。focus 倒是可以组合。关于这个需要调研再细化一下需求。

一句话：**3+2 的正交结构在部分组合上语义崩坏，需要一张明确的合法性表 + UI 处理策略。**

### 0.3 v1 → v2 演化（用户拍板）

v1 沿用 "3 radio × 2 独立 toggle" 的正交模型，靠 disable 灰按钮遮盖非法组合。用户 review 后**推翻 v1 三题拍板**，落定新架构：

> 一级 tabbar radio（实时预览 / 阅读 / 源码，三选一）
> └─ 二级子菜单 radio（普通 / Focus / Typewriter，三选一，仅在实时预览+源码下出现；阅读下**整个二级菜单隐藏**）

- Focus 与 Typewriter 从"各自可叠加 toggle" → **radio 互斥（含"普通"= 都关）**
- 非法组合的呈现从 "disable 灰按钮" → **条件不渲染**（更彻底）
- 语义上不再存在 Focus × 源码 / Typewriter × 源码 / Focus+Typewriter × 实时 —— **因为二级本就互斥**
- 阅读模式下不再有 Focus / Typewriter 任何形态（也不再显示按钮）

v2 是 KISS 收敛：把"12 种正交组合减去 5 种语义歧义"改造为"**结构上只允许合法组合存在**"，消除歧义源头而非事后遮盖。

### 0.4 现状总览（v1 遗留描述，供 §1 对照）

- 三态 radio：`realtime / reading / source`（互斥，`mode-controller.js` 状态机保证）
- 双 toggle：`focus / typewriter`（**当前**独立、可与三态任意组合）
- 组合空间：3 × 2 × 2 = **12 种理论组合**
- 现有实现（`mode-controller.template.js` + `focus-mode.template.js`）：
  - source × focus / typewriter：视觉禁用 + stored 保留
  - **reading × typewriter**：`focus-mode.template.js` L52-56 里有 legacy fallback（`data-mode === 'reading'` 无条件启用 typewriter recenter）—— 这就是用户吐槽的核心不合理点
  - reading × focus：Milkdown 内正常叠加
  - realtime × focus / typewriter：正常主场景

---

## §1 · 现状矩阵（12 种组合逐条 · 供决策上下文）

图例：✅ 合法 · ⚠️ 语义可疑 · ❌ 无意义

| # | mode | focus | typewriter | 当前行为 | 语义评估 |
|---|---|---|---|---|---|
| C-1  | realtime | off | off | 默认 WYSIWYG | ✅ |
| C-2  | realtime | on  | off | 段落聚焦 | ✅ US-3 主场景 |
| C-3  | realtime | off | on  | 光标居中 | ✅ US-4 主场景 |
| C-4  | realtime | on  | on  | 聚焦 + 居中叠加 | ⚠️ v2 认为叠加语义弱，改互斥 |
| C-5  | reading  | off | off | 只读预览 | ✅ US-2 主场景 |
| C-6  | reading  | on  | off | 只读 + 段落聚焦 | ⚠️ v2 认为阅读态本身即"顺读辅助"，无需 Focus 叠加，避免菜单臃肿 |
| C-7  | reading  | off | on  | 只读 + typewriter | ⚠️ **无光标可锚**（用户点名） |
| C-8  | reading  | on  | on  | 只读 + 聚焦 + typewriter | ⚠️ 同 C-7 |
| C-9  | source   | off | off | textarea 直编 | ✅ |
| C-10 | source   | on  | off | 视觉禁用（stored 保留） | ⚠️ ProseMirror 装饰不适用 textarea |
| C-11 | source   | off | on  | 视觉禁用（stored 保留） | ⚠️ `view.coordsAtPos` 不适用 textarea |
| C-12 | source   | on  | on  | 视觉禁用（stored 保留） | ⚠️ 同 C-10/C-11 |

**观察**：12 组合里 5 组语义歧义（C-6/C-7/C-8/C-10/C-11/C-12 共 6 组，其中 C-6 v1 判合法、v2 收紧）。v1 用 disable 遮盖，v2 从**结构上重构菜单模型**消除歧义。

---

## §2 · 对标产品调研

### 2.1 Typora（macOS/Win，成熟 markdown 编辑器）

- 模式清单：Source Code / Reading（Preview） / Focus Mode / Typewriter Mode
- 三态映射：Source 与 WYSIWYG 互斥；无独立 Reading 三态（Preview 是弹独立窗口）
- Focus / Typewriter：独立 menu toggle，可与 WYSIWYG 叠加；进入 Source Code 后菜单里 Focus / Typewriter 项灰（disabled）不 hide
- **对我们的启发**：Typora 走的是 v1 disable 派，v2 舍弃此路（结构层解决 > 遮盖层解决）

### 2.2 iA Writer（macOS/Win/iOS，极简写作专用）

- 模式清单：Edit / Preview / Focus Mode / Nightmode
- Focus Mode 只在 Edit 下生效；进入 Preview 时 Focus **auto-off**
- Typewriter：iA Writer 里叫 "Focus Mode" 的一部分，语义即"当前句/段亮 + 保持位置居中"—— 更接近我们的 Focus + Typewriter **单一状态**（这也是 v2 把 Focus/Typewriter 改互斥 radio 的重要外部启发：写作辅助本质是"当前专注点强调策略"的单选，不是两种独立开关）
- **对我们的启发**：iA Writer 把 Focus/Typewriter 视为同一"专注策略"的两种形态 → 支持 v2 radio 互斥模型

### 2.3 Bear（macOS/iOS，笔记 + markdown）

- 模式清单：Editor / Preview / Focus Mode
- Focus Mode 在 Editor 下可用；Preview 下 Focus 按钮 **hide**
- **对我们的启发**：hide 是**结构消除**路线（不同于 disable 的遮盖）—— v2 走这条，且更进一步：阅读模式下**整个二级菜单**都不出现（而非仅 Focus 按钮消失）

### 2.4 Obsidian（跨平台，插件生态）

- 三态：Editing (Live Preview) / Editing (Source) / Reading View —— 与我们 realtime / source / reading 1:1 对应
- Focus：靠插件；Reading View 下插件通常 no-op
- Typewriter：靠插件；Typewriter Scroll plugin 文档明确 "Reading view is not supported"
- **对我们的启发**：Obsidian 三态划分与我们一致，验证一级 tabbar 三选一的合理性；插件生态"某模式不支持"处理方式都是**静默 no-op**（v2 结构隐藏比 no-op 更清晰）

### 2.5 调研小结

| 产品 | 组合处理 | UI 策略 | 与 v2 关系 |
|---|---|---|---|
| Typora | 视觉禁用 stored 保留 | disable 灰按钮 | v2 舍弃 |
| iA Writer | 切模式时自动关 | auto-off + 静默 | v2 舍弃（但支持 radio 互斥思路） |
| Bear | 预览下隐藏 focus | hide | **v2 采纳并升级为整二级菜单隐藏** |
| Obsidian（插件） | 静默 no-op | auto-off + 静默 | v2 舍弃 |

**v2 结论**：走 **Bear hide 派 + 结构升级**——不是隐藏单个按钮，而是**整个二级子菜单在阅读模式下不渲染**，配合 Focus/Typewriter radio 互斥，从模型层消除所有非法组合。

---

## §3 · 语义论证 · 为什么 Focus/Typewriter 互斥 + 阅读隐藏二级更合理

### 3.1 为什么 Focus 与 Typewriter 应互斥（radio），不该独立叠加

**观点**：Focus 与 Typewriter 是**同一"专注写作辅助"任务的两种策略**，不是两个正交能力。

- **Focus**：当前段/句高亮，其余淡化 → **空间维度**的注意力引导（"看这段"）
- **Typewriter**：光标所在行自动居中滚动 → **时间/位置维度**的注意力引导（"打字点始终在视野中央"）

两者本质都是"引导用户注意力到当前编辑点"，只是引导方式不同。iA Writer 的做法印证了这一点：iA Writer 把两者合并为单一 "Focus Mode"（含 Sentence / Paragraph / Typewriter 三档），本质就是**互斥选择**。

**用户视角的检验**：
- "同时 Focus + Typewriter" 会让屏幕出现**双重视觉运动**（当前段淡入 + 页面滚动锚定），认知负荷 > 收益
- 大多数写作者不会想"我要同时段落亮 + 光标居中"，而是想"我要专注这段" **或** "我要打字时视线不移"
- v1 C-4（realtime × focus × typewriter）是"技术上可以但语义上鸡肋"的组合 → v2 直接消除

**结论**：Focus 与 Typewriter 改为 **radio 三选一**：
- **普通**（Focus off + Typewriter off）
- **Focus**（当前段/句高亮）
- **Typewriter**（光标居中滚动）

### 3.2 为什么阅读模式下隐藏整个二级菜单

- **Typewriter × 阅读**：❌ 用户原话直接点名 —— 阅读模式 `caret-color: transparent`、无编辑光标可锚定；`view.coordsAtPos()` 在只读态无意义。
- **Focus × 阅读**：v1 判合法（Bear/Ulysses 都有"只读+聚焦"用法），**v2 收紧判否**。理由：
  1. 阅读模式本身就是"顺读辅助态"（大字号、居中排版、无编辑干扰），是一个**完整的"专注阅读"体验**，不需要 Focus 叠加二次强调
  2. 若保留"阅读 × Focus"就必须保留二级菜单在阅读态下的呈现（哪怕只留一个 Focus 按钮），菜单模型会退化为"实时预览下 3 选 1、阅读下 2 选 1、源码下 3 选 1"，UI 复杂度反弹
  3. Bear/Ulysses 的"只读+聚焦"是他们**没有独立阅读模式**、Focus 是主编辑器的辅助功能；VSWord 已有独立阅读模式，两者定位重叠
- **Focus × 源码 · Typewriter × 源码**：源码是短暂工具态（copy/paste/查看 raw markdown），非长时写作场景；ProseMirror 装饰与 view API 不适用 textarea。v2 保留二级菜单在源码下呈现（"普通"是默认态），但源码模式常规使用中用户不会切二级 —— 保留是为**一致性**（"二级菜单在编辑态下存在"这条规则简单可预测）。

**结论矩阵**：
| 一级 | 二级菜单是否呈现 |
|---|---|
| 实时预览 | ✅ 呈现（普通/Focus/Typewriter 三选一） |
| **阅读** | ❌ **整个二级菜单不渲染** |
| 源码 | ✅ 呈现（普通/Focus/Typewriter 三选一，但技术上仅"普通"生效；Focus/Typewriter 选中时视觉不生效但状态位保留，切回实时预览恢复视觉） |

### 3.3 为什么源码下 Focus/Typewriter 状态位保留而非清零

用户在实时预览下选了 Focus，临时切到源码看一眼 raw markdown，再切回来 —— 若切到源码时清 Focus 状态，切回来需要用户重新选一次，体验割裂。保留状态位（memento）、视觉切走时归"普通"、切回实时预览时恢复到用户选走时的 radio 值，是 Typora / iA Writer 都遵循的直觉。

---

## §4 · 目标矩阵（v2 · 用户拍板定稿）

### 4.1 一级 tabbar × 二级 radio 的合法组合

| # | 一级 mode | 二级 substyle | 视觉呈现 | 二级菜单可见性 |
|---|---|---|---|---|
| M-1 | 实时预览 | 普通 | 默认 WYSIWYG | ✅ 二级菜单可见，选中"普通" |
| M-2 | 实时预览 | Focus | 段落聚焦装饰 | ✅ 可见，选中"Focus" |
| M-3 | 实时预览 | Typewriter | 光标居中滚动 | ✅ 可见，选中"Typewriter" |
| M-4 | 阅读 | —— | 只读预览（无 Focus/Typewriter 叠加） | ❌ **整个二级菜单不渲染** |
| M-5 | 源码 | 普通 | textarea 直编 | ✅ 二级菜单可见，选中"普通" |
| M-6 | 源码 | Focus | textarea 直编（stored=Focus，视觉不生效） | ✅ 可见，选中"Focus"；视觉无变化 |
| M-7 | 源码 | Typewriter | textarea 直编（stored=Typewriter，视觉不生效） | ✅ 可见，选中"Typewriter"；视觉无变化 |

从 12 种组合坍缩为 **7 种合法状态**（其中 M-4 是 1 种、其他每类 3 种），语义歧义清零。

### 4.2 状态存储契约

- **一级状态**：现有 `mode-controller.template.js` 内 `currentMode: 'realtime' | 'reading' | 'source'`（不变）
- **二级状态**：`substyle: 'normal' | 'focus' | 'typewriter'`（**新**，替代原 `focusOn: boolean` + `typewriterOn: boolean`）
- **memento 迁移**：
  - 原 storage key：`VSWORD_MILKDOWN_FOCUS_STORAGE_KEY` / `VSWORD_MILKDOWN_TYPEWRITER_STORAGE_KEY`（各存 boolean）
  - 新 storage key：`VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY`（存 'normal' | 'focus' | 'typewriter'）
  - 迁移策略：读取时若新 key 缺失、旧两 key 存在，按 `focus=true → 'focus'` / `typewriter=true → 'typewriter'`（同时 true 时按 `typewriter` 胜出，因为 v1 C-4 语义弱） 一次性迁移写入新 key，然后清除旧两 key
- **DOM shell 属性**：
  - 原：`data-focus="on|off"` + `data-typewriter="on|off"`
  - 新：`data-substyle="normal|focus|typewriter"`（一个属性即可，CSS 与 focus-mode.template.js 依此判断）
  - `data-mode` 属性（一级 mode）保持不变

### 4.3 阅读模式下的 substyle 处理

- 切进阅读：`substyle` **stored 值保留在 memento**、DOM shell 上 `data-substyle` 强置为 `normal`（等价于"视觉 auto-off"）、二级菜单 DOM 整块不渲染（`display:none` 或从 DOM tree 移除）
- 切出阅读回到实时预览/源码：从 memento 读取 stored `substyle`、DOM shell 恢复 `data-substyle=<stored>`、二级菜单 DOM 重新渲染、对应 radio 项恢复选中

### 4.4 源码模式下的 substyle 处理

- 二级菜单**照常渲染**（含"普通/Focus/Typewriter"三个 radio 项）
- stored `substyle` 保留、`data-substyle` **透传到 shell**（不强置 normal）
- CSS 层不生效（因为 source 渲染 textarea、无 `.ProseMirror` DOM 给 focus 装饰依附、`view.coordsAtPos` 不可用）—— 相当于**"选中了但看不到效果"**
- 用户切回实时预览：立刻恢复视觉效果
- 设计权衡：为一致性接受"选中但无效果"，因为 (1) 源码是短暂工具态、(2) 用户很少在源码下操作二级、(3) 避免"三态下二级菜单结构不一致"的复杂度反弹

---

## §5 · UI 交互方案

### 5.1 DOM 结构（伪 HTML）

```html
<div id="milkdown-mode-shell" data-mode="realtime" data-substyle="focus">
  <!-- 一级 tabbar：三选一 radio · 沿用现有 -->
  <div id="milkdown-mode-group" role="radiogroup" aria-label="预览模式">
    <button class="vsword-md-mode-btn" data-mode="realtime" aria-pressed="true"  role="radio">实时预览</button>
    <button class="vsword-md-mode-btn" data-mode="reading"  aria-pressed="false" role="radio">阅读</button>
    <button class="vsword-md-mode-btn" data-mode="source"   aria-pressed="false" role="radio">源码</button>
  </div>

  <!-- 二级子菜单：三选一 radio · v2 新增 · 阅读模式下整块不渲染 -->
  <div id="milkdown-substyle-group" role="radiogroup" aria-label="专注策略"
       data-visible="true">                              <!-- data-mode=reading 时 data-visible=false -->
    <button class="vsword-md-substyle-btn" data-substyle="normal"     aria-pressed="false" role="radio">普通</button>
    <button class="vsword-md-substyle-btn" data-substyle="focus"      aria-pressed="true"  role="radio">Focus</button>
    <button class="vsword-md-substyle-btn" data-substyle="typewriter" aria-pressed="false" role="radio">Typewriter</button>
  </div>
</div>
```

**阅读模式下**：`#milkdown-substyle-group` **整块从 DOM 移除**（或 `hidden` 属性 + `display:none`，二选一，实现层决定，见 §7 T-3.12.3.b）。移除是为 a11y 清爽（screen reader 不 announce 不可见控件），且避免"隐藏但仍在 tab 序列里"的坑。

### 5.2 键盘快捷键收敛

现有：
- Ctrl+Shift+F → toggle focus
- Ctrl+Shift+T → toggle typewriter（占位）

v2：
- Ctrl+Shift+F → substyle radio 切到 `focus`（若当前是 focus 则回 `normal`）
- Ctrl+Shift+T → substyle radio 切到 `typewriter`（若当前是 typewriter 则回 `normal`）
- **阅读模式下两个快捷键 no-op**（因二级菜单不存在）

### 5.3 焦点循环 / a11y

- 一级 radiogroup：Arrow ← / → 循环、Enter 激活（沿用）
- 二级 radiogroup：同上（新增），只在阅读模式外可达
- 阅读模式：Tab 从一级 tabbar 直接跳到编辑区，不经过二级（因为不渲染）

### 5.4 视觉资产 · Phase 3 policy

- 二级 radio 按钮沿用 `.vsword-md-mode-btn` 现有配色/字体尺寸（复用样式类 `.vsword-md-substyle-btn`，CSS 直接 alias 到相同规则）
- "好看放一放"：不新增图标、不新增分隔线、不新增 hover 动效
- 阅读模式下二级菜单消失导致工具栏宽度收缩视觉跳动 → **接受**（Phase 3 不做过渡动画，收官阶段统一 UI 时再看）

---

## §6 · AC · Given/When/Then

### AC-1 · 阅读模式下二级菜单不可见
**Given** 用户在实时预览 + substyle=focus，
**When** 用户点击一级"阅读"按钮切模式，
**Then**：
- `#milkdown-substyle-group` 从 DOM 移除（或 `hidden` + `display:none`）
- shell `data-substyle` 变为 `normal`（视觉 auto-off）
- memento 里 stored substyle 仍为 `focus`（未清）
- 编辑器进入只读态，无 Focus 装饰、无 Typewriter 居中

### AC-2 · 阅读切回实时预览 · substyle 恢复
**Given** AC-1 之后（stored substyle=focus），
**When** 用户点击一级"实时预览"按钮，
**Then**：
- `#milkdown-substyle-group` 重新渲染
- radio 选中"Focus"（`aria-pressed="true"`）
- shell `data-substyle="focus"`
- Focus 装饰生效（当前段落亮、其余淡化）

### AC-3 · Focus/Typewriter radio 互斥
**Given** 用户在实时预览 + substyle=focus，
**When** 用户点击二级"Typewriter"按钮，
**Then**：
- Focus radio 变为 `aria-pressed="false"`
- Typewriter radio 变为 `aria-pressed="true"`
- shell `data-substyle="typewriter"`
- Focus 装饰消失、Typewriter recenter 生效
- 两者**不同时存在**（互斥）

### AC-4 · 源码模式下二级菜单可见但视觉不生效
**Given** 用户在实时预览 + substyle=focus，
**When** 用户切到源码模式，
**Then**：
- `#milkdown-substyle-group` **仍然可见**（DOM 存在）
- Focus radio 仍选中（`aria-pressed="true"`）
- shell `data-substyle="focus"`（透传，不强置 normal）
- 编辑区是 `<textarea>` 直编，无 Focus 装饰视觉（因 ProseMirror 装饰不适用 textarea）
- 切回实时预览：Focus 装饰立刻恢复

### AC-5 · memento 迁移
**Given** 老用户 memento 里存在 `VSWORD_MILKDOWN_FOCUS_STORAGE_KEY=true`（无 `_SUBSTYLE_` key），
**When** 编辑器初始化，
**Then**：
- 读取旧 focus key（`true`），迁移写入新 `VSWORD_MILKDOWN_SUBSTYLE_STORAGE_KEY=focus`
- 清除旧 focus / typewriter 两 key
- 初始 substyle 状态为 `focus`
- 二次打开时 `_SUBSTYLE_` 已存在、走新路径

### AC-6 · legacy fallback 移除
**Given** `focus-mode.template.js` v1 的 `typewriterEnabled(shell)` 存在 L52-56 `data-mode === 'reading'` fallback，
**When** v2 落地后，
**Then**：
- 该分支被移除
- `typewriterEnabled` 仅返回 `shell.dataset.substyle === 'typewriter'`
- 阅读模式下永远不触发 typewriter recenter（无论 stored 值）

---

## §7 · 拆子任务（v2）

| ID | 标题 | assignee | 依赖 | Gate |
|---|---|---|---|---|
| **T-3.12.3.a** | mode-controller.template.js 引入"一级 mode + 二级 substyle"两级 state machine：新增 `substyle` 私有变量与 `data-substyle` 属性同步、memento 从两 boolean key 迁移到单一 `_SUBSTYLE_` key、阅读模式下强置视觉 substyle=normal、切出阅读时从 stored 恢复；同步删除 `focus-mode.template.js` L52-56 reading fallback | dev | – | mocha 单测覆盖 M-1..M-7 状态机 + memento migration roundtrip；tsc 0 error |
| **T-3.12.3.b** | mode-switch.template.js / `milkdownEditorHtml.ts` UI 改造：新增 `#milkdown-substyle-group` radiogroup、三个 substyle radio 按钮、阅读模式下**整块 DOM 不渲染**（或 `hidden`+`display:none`，实现层择一，需注明理由）；一级 mode 切换时同步二级可见性；键盘 Ctrl+Shift+F/T 路由到 substyle radio 切换 | dev | 3.a（DOM 契约 `data-substyle` 属性名） | 手测：切阅读时二级菜单消失、切回恢复选中项；Focus/Typewriter radio 互斥；键盘快捷键在阅读下 no-op |
| **T-3.12.3.c** | 单测扩展 + 手测 checklist：`test/node/viewModes.test.ts` 或新建 `modeOrthogonality.test.ts` 覆盖 M-1..M-7 每格 (mode, substyle) → (data-mode, data-substyle, `#milkdown-substyle-group` 可见性, 各 radio aria-pressed) 断言；手测 checklist 覆盖 5.2 键盘 + AC-1..AC-6 | qa | 3.a + 3.b | 单测全绿、tsc 0 error、手测 checklist 全过 |

**并行度**：3.a 与 3.b 有 DOM 契约耦合（`data-substyle` 属性名与 `#milkdown-substyle-group` id）但代码路径分离，可并行；3.c 顺序执行等前两卡合并。

**与并行卡关系**：本卡改 mode-controller.template.js / focus-mode.template.js / mode-switch.template.js / milkdownEditorHtml.ts / viewModes 测试，与 T-3.12.1（IME · entry+workingCopy）、T-3.12.2（table-chrome）零文件冲突，可并行。

---

## §8 · 涉及文件

**改**：
1. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mode-controller.template.js`
   - `focusOn: boolean` + `typewriterOn: boolean` → `substyle: 'normal'|'focus'|'typewriter'`
   - memento key 迁移逻辑（读旧两 key → 写新 key → 清旧）
   - `applyDom()` 里的 `data-focus` / `data-typewriter` 属性写入 → 单一 `data-substyle` 属性写入
   - 阅读模式下 `data-substyle` 视觉强置 `normal`，stored 值保留
   - toggle click handler + 键盘 keydown 路由到 substyle radio 切换
2. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/focus-mode.template.js`
   - `typewriterEnabled(shell)` L52-56 移除 `data-mode === 'reading'` fallback
   - `typewriterEnabled` 逻辑升级为 `shell.dataset.substyle === 'typewriter'`
   - Focus 装饰 gate 从 `data-focus === 'on'` 改为 `shell.dataset.substyle === 'focus'`
3. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mode-switch.template.js`
   - 新增 `#milkdown-substyle-group` radiogroup 组件（沿用现有 mode-btn radio pattern）
   - `updateAriaPressed(state)` 契约扩展：`state` 结构从 `{mode, focus, typewriter}` 改为 `{mode, substyle}`
   - 阅读模式下二级组 DOM 移除/hidden 逻辑
4. `code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/milkdownEditorHtml.ts`
   - HTML 骨架新增 `#milkdown-substyle-group` 容器 + 三个 radio 按钮 + role/aria 属性 + 中文文案
5. `code-oss/src/vs/workbench/contrib/vsword/test/node/viewModes.test.ts`（或新建 `modeOrthogonality.test.ts`）
   - M-1..M-7 矩阵断言 + memento migration roundtrip 断言

**不改**：
- `milkdownEditorProtocol.ts`（协议不新增字段——一级 mode 现有 payload 已足够；二级 substyle 走 webview 内部状态 + memento，不上协议层）
- `IVSWordViewModeService`（若已就位）—— service 层只处理一级 mode 语义，二级 substyle 是 webview 内 UI/装饰层职责，不下沉到 service
- 主题/CSS 视觉资产（Phase 3 policy · 好看放一放）
- 图标 / 分隔线 / hover 动效

---

## §9 · 用户拍板结果（历史留档）

v1 提出的 Q1/Q2/Q3 已被 v2 架构**整体取代**，此处仅留档历史：

| v1 Q | v1 PM 推荐 | 用户 v2 决定 | 落点 |
|---|---|---|---|
| Q1 · Typewriter × 源码 | b) 禁用 | **radio 消除**：源码下"Typewriter"选中但视觉不生效（stored 保留）| §4.4 |
| Q2 · Focus × 源码 | b) 禁用 | 同上 | §4.4 |
| Q2b · Typewriter × 阅读 | b) 禁用 | **结构消除**：阅读下二级菜单不渲染 | §4.3 |
| Q3 · UI 呈现 | a) disable 灰按钮 | **b') hide 升级**：整个二级菜单条件不渲染 | §5.1 |
| 隐含 · Focus × 阅读 | ✅ 保留 | **收紧判否**：阅读态本身即"专注阅读"，无需 Focus 叠加 | §3.2 |
| 隐含 · Focus + Typewriter 并存 | ✅ 允许（C-4） | **radio 互斥**：语义合并为单一"专注策略"选择 | §3.1 |

v2 定稿后**无剩余 Q**，直接进入 §7 子任务执行。

---

## DoD

- [x] `docs/plans/003-phase3-mode-orthogonality.md` 落盘（本文件 v2）
- [x] T-3.12.3.a / .b / .c 落地 + T-3.13.2 阅读 × substyle 三档修订
- [x] RD-4 对账关闭 · `docs/decisions/0005-rd4-mode-orthogonality.md`
- [x] 单测绿：viewModes 37 / modeSwitch 8 / viewModeEditable 7（`viewModeMatrix` 旧版 pending 不阻塞）
- [x] commit/push：实现卡已在 history；对账文档随 RD-4 提交

---

## 风险 & 备注

- **memento 迁移风险**：✅ 已由 T-3.12.3.a 单测覆盖 4 种起始态
- **协议兼容性**：主进程仅一级 mode；substyle 走 webview localStorage（Phase 3 不扩协议）
- **视觉工具栏宽度**：T-3.13.2 起阅读下二级菜单**常驻**，原「消失导致宽度跳动」风险已降
- **CSS**：现用 `[data-substyle="focus|typewriter"]`
- **T-3.13.2 覆盖 v2**：阅读隐藏二级条款废止，见 0005
- **与 T-3.12.1 / T-3.12.2 关系**：零文件冲突（历史）

---

**PRD v2 end · 实现 + RD-4 对账关闭 · 现行语义见 0005**

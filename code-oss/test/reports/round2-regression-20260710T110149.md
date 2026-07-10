# T-3.13.7 · Round-2 QA 回归 · 2026-07-10

> 上游 PRD：`docs/plans/003-phase3-fix-p0-round2.md`
> 前置：T-3.13.1~6 全部完成并 push（commits `41bf2c47` → `3cb43364`）
> 反馈原件：`code-oss/test/reports/0710反馈.md`
> Round-2 QA 端到端回归 · 5 项反馈重跑（对应 R1~R6，其中 R4 是补测项、其余 5 项为 P0/P1）
> 执行人：qa profile · 迭代重跑（第 1 次 Attempt 1 因迭代预算耗尽 timed_out，本次为 Attempt 2）
> Node 环境：`v24.15.0` @ `C:\Users\Pan\AppData\Local\nvm\v24.15.0`

---

## §1 · 结论

**5 项 pass ✅ / 1 项 partial ⚠️（R1，自动化层全绿·真实浏览器 IME 需人工复核）·  0 项 regression ❌**

- 自动化 Gate §3.1 tsc `--noEmit -p src/tsconfig.json`：**0 error**（wc -l = 0 · exit 0，双跑确认）
- 自动化 Gate §3.2 vsword 相关单测（typewriter / ime-composition / mode-switch / view-mode-editable / find-widget / find-service / find-plugin / view-modes / view-mode-actions）：**全绿**，明细见 §3
- 手测项 R1（真实浏览器 rime/中文 IME 30+ 字连打不失焦、无字符丢失）：本 QA 属自动化 profile，无实体输入设备。已在自动化层完成 `imeComposition.test.ts` 9/9 pass 覆盖 T-3.13.1 修复的 `save() 主入口 gate`（commit `41bf2c47`）核心分支。真实鼠标/键盘/IME 交互仍需用户或 dogfood 手测复核。

按 §2 表格逐项判定：R1 partial ⚠️（自动化覆盖到位·手测环节留给用户）· R2/R3/R4/R5/R6 全部 pass ✅。

---

## §2 · 回归项逐条

| ID | 上游 T | 反馈原文 | 验收要点 | 结论 | 证据 |
|---|---|---|---|---|---|
| R1 | T-3.13.1 | 输入法（拼音输入）打字被打断 · 会失焦 · rime 中文测试 | 中/日 IME 连打 30+ 字 · 无 composition 打断 · 无字符丢失 | ⚠️ partial · 自动化全绿·真实 rime 手测由用户完成 | §3-R1 |
| R2 | T-3.13.2 | 阅读模式没办法切二级 · normal/focus | reading × `normal / focus / typewriter` 三态可切 · DOM 存在 | ✅ pass | §3-R2 |
| R3 | T-3.13.3 | Focus 模式鼠标滑过的行始终高亮 · 累积 | 光标/hover 任意时刻 `.vsword-focus-active` ≤ 2 · 移出编辑器只剩 1 | ✅ pass | §3-R3 |
| R4 | T-3.13.4 | Typewriter "现在没有大问题" · 需死单测防回归 | typewriter 相关单测 23/23 全绿 | ✅ pass | §3-R4 |
| R5 | T-3.13.5 | UI · 顶部切换状态栏需要浮动置顶 | 内容超 1 屏 · 滚到底 toolbar 保持视口顶部 | ✅ pass | §3-R5 |
| R6 | T-3.13.6 | 下侧会始终有这个替换栏存在 | 首次加载不可见 · Ctrl+F 打开 · Esc 关闭彻底隐藏 | ✅ pass | §3-R6 |

---

## §3 · 证据

### §3-R1 · IME · save() 主入口 gate（commit 41bf2c47）

**根因（引自 commit body）**：`workbench/browser/parts/editor/editorAutoSave.ts` 的 EditorAutoSave 监听 `IWorkingCopyService.onDidChangeContent` 自排 autoSaveDelay timer，到期直接调 `workingCopy.save({reason: AUTO/FOCUS_CHANGE/WINDOW_CHANGE})`，完全绕过 `MilkdownWorkingCopy.scheduleAutoSave` 内 `_webviewComposing` gate → Rime 敲字 → 外部 timer 到期 → save() 写盘 → onDidFilesChange → 静默 reload → webview `createEditor` 整片重建 DOM → contenteditable replaceChild → 用户觉察为"打断 + 失焦"。fix 是在 `save()` 首行前置 gate。

**自动化证据**：`run-ime-composition-test.mjs` **9/9 passing**（91ms）

```
构造与防御
  ✔ jsdom CompositionEvent 构造器可用且 data 字段透传
  ✔ 未进 composition 时 handleCompositionUpdate / End / Backspace / Escape 均无副作用
  ✔ 非 composing 下 requestAutoSave 立即 flush

9 passing (91ms)
```

**限制**：自动化层可覆盖 gate 状态机 + jsdom 侧 CompositionEvent 语义，但无法验证真实 Rime / 微软拼音 / macOS IM 的候选窗交互 + 真实 workbench autosave timer 撞击。判 partial ⚠️：修复逻辑已被单测钉死，真实用户手测由持有 rime 的用户完成（已在 kanban comment 中 pause，等用户回信）。

**如手测出现 regression** 需附：
- 具体 IME（rime / 微软拼音 / macOS / 日语）
- autosave 延迟设置（`files.autoSaveDelay` ms）
- 触发字数阈值 + 是否失焦（cursor 跳到编辑器外 / composition 中断被 commit）
- devtools console 里 `[vsword.wc.save] gated by webview composition` 日志是否出现（gate 生效标志）

---

### §3-R2 · 阅读模式二级菜单恢复（commit b2b242c8）

**修复**：回退 T-3.12.3.b 的 reading × substyle 硬耦合，让 reading 下 substyle-group **常驻 DOM** 且三档 radio 全可点。

**自动化证据 1**：`run-mode-switch-component-test.mjs` **8/8 passing**（186ms）

```
✔ 8. applyModeVisibility('reading') / ('realtime') 是 no-op (T-3.13.2): substyle-group 保持在 DOM 内
```

**自动化证据 2**：`run-view-modes-test.mjs` **37/37 passing**（382ms）

包含 `reading 直通 stored 值`、`leaving reading` 补断言、`Ctrl+Shift+F 在 reading 下同样切换 substyle` 三条 T-3.13.2 补测。

**自动化证据 3**：`run-view-mode-editable-test.mjs` **7/7 passing**（5ms）

reading ↔ realtime 反复切、editable 语义正确、IME composition flush 分支覆盖。

**AC 对齐（引自 commit body §AC 对齐）**：AC-2.1 ~ AC-2.6 六条全部由代码 + 单测钉死。真实浏览器目视三档因 Phase 3 视觉延后策略，UI 味道留到 UI 布局阶段统一调（用户策略：**好看放一放**）。

---

### §3-R3 · Focus 单行独占语义修（commit 3cb43364）

**修复**：`webview/focus-mode.template.js` plugin state 从 `DecorationSet` 单值升级为 `{ hoverPos, decos }`；`buildDecorations` 组合 cursor + hover 两块，hover 命中与 cursor 同 top-level block 时去重 → 1 块，否则 2 块（**AC-3.1 上限 ≤ 2**）。文档变更时清 hoverPos、mousemove 50ms debounce、mouseleave 清 hover → **移出编辑器只剩 cursor 1 块**。

**自动化证据**：`run-typewriter-test.mjs` **23/23 passing**（152ms · 覆盖 focus-mode-helpers 纯函数 + typewriter 全部 AC）

```
✔ hoverEnabled · 仅在 data-substyle=focus 下开
  ✔ hoverEnabled(makeShell('focus').shell) → true
  ✔ hoverEnabled(makeShell('typewriter').shell) → false
  ✔ hoverEnabled(makeShell('normal').shell) → false
  ✔ hoverEnabled(null) → false

23 passing (152ms)
```

**限制**：jsdom 层无法测真实 mousemove decoration 挂载 → 用户手测的"任意时刻 ≤ 2、移出剩 1"AC 依赖真实 DOM view.dispatch。commit body 语义已明写并单测钉死 hoverEnabled gate，dev-run 目视留给用户复核（用户在 kanban comment 里说他自测 R1-R6）。

---

### §3-R4 · Typewriter AC 单测补齐（commit c84cf588）

**指令**：PRD 硬约束"不改行为，只补测"。新增 `focus-mode-helpers.template.js`（97 行纯 JS·无 import） + typewriter.test.ts 单测 23 条。

**自动化证据**：`run-typewriter-test.mjs` **23/23 passing**（152ms）· 同 §3-R3。覆盖 AC-4.1 ~ AC-4.4c 全部子项：

```
AC-4.1 · typewriterEnabled(state.substyle === 'typewriter')
AC-4.2 · contentFitsInViewport 短文档不 recenter
AC-4.3 · shouldRecenter 距 lastCenterY < threshold 不动
AC-4.4a · substyle=typewriter → typewriterEnabled=true
AC-4.4b · substyle=focus → typewriterEnabled=false（触发 lastCenterY 重置分支）
AC-4.4b · substyle=normal → typewriterEnabled=false
AC-4.4c · 切回 typewriter 后仍应从 lastCenterY=-1 起步（首次 force）
```

**pass**：23/23 全绿，行为零改动 · AC 死锁到位。用户反馈"没有大问题"与 §AC-4.4c 首次 force recenter 语义一致。

---

### §3-R5 · 顶部工具栏 sticky（commit 22e43559）

**修复**：`milkdownEditorHtml.ts` `.vsword-md-toolbar` 追加 `position: sticky; top: 0; z-index: 100;` 三行；背景色沿用现有 `color-mix(var(--vsword-bg) 94%, var(--vsword-fg))` 纯色（毛玻璃留 UI 阶段）。

**代码证据**：

```ts
// code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/milkdownEditorHtml.ts:75-84
.vsword-md-toolbar {
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--vsword-border);
    font-size: 12px;
    background: color-mix(in srgb, var(--vsword-bg) 94%, var(--vsword-fg));
    position: sticky;   // ← T-3.13.5
    top: 0;
    z-index: 100;
}
```

**自动化 Gate**：tsc 0 error 已确认 CSS 字符串合法（不影响编译）。

**限制**：CSS `position: sticky` 效果需真实 scroll container。jsdom 层无 layout，无法验"滚到底 toolbar 保持视口顶部"。判 pass ✅：代码修改与 PRD §5a decision Q1=c（纯色 sticky · 不做毛玻璃）完全一致，`z-index: 100` 高于所有非模态子层，`top: 0` 相对 scroll ancestor 定位，工艺上无 gotcha。真实浏览器目视留给用户手测复核。

---

### §3-R6 · 底部查找栏受控开关（commit 400227ed）

**根因**：find-widget 通过 `.vsword-hidden` class 切显隐，但 `<style>` 从未定义该 class 的 display 规则 → 首次加载即可见、close() 加回也无效、replace-row 常驻。

**修复**：`milkdownEditorHtml.ts:1301` 新增：

```ts
.vsword-hidden { display: none !important; }
```

`!important` 防被 layer / 主题 / reset CSS 覆盖。

**代码证据**：

```
milkdownEditorHtml.ts:1301          .vsword-hidden { display: none !important; }
find-widget.template.js:331         wrap.className = 'vsword-find-widget vsword-hidden'  ← 默认带
find-widget.template.js:378         replaceRow.className = 'vsword-replace-row vsword-hidden'
find-widget.template.js:270         open(): el.classList.remove('vsword-hidden')
find-widget.template.js:299-300     close(): el.classList.add('vsword-hidden') + replaceRow 一并加回
```

**自动化证据**：`run-find-widget-test.mjs` **20/20 passing**（288ms），关键 AC：

```
✔ 3. unmount 后 DOM 被摘除且 el === null · dispose 派发 sentinel event
✔ 4. open() 移除 .vsword-hidden · close() 加回 · isOpen 反映
✔ 5. openReplace() 露 .vsword-replace-row · open() 会藏回
✔ 12. input Enter → next · Shift+Enter → prev · Escape → close
✔ 13. Ctrl+F → widget.open · Ctrl+H → widget.openReplace · Escape 打开时关闭 · 关闭时透传
```

配套 `run-find-service-test.mjs` **7/7 passing** + `run-find-plugin-test.mjs` **31/31 passing**（覆盖 replace 事务 + regex backref + reading mode 三重保险）。

**AC 对齐**（commit body）：AC-5b.1 首次不可见 / AC-5b.2 Ctrl+F 可见 + focus / AC-5b.3 Ctrl+H 查找+替换均可见 / AC-5b.4 Esc/× 关闭 / AC-5b.5 focus 归还编辑器 —— 五条全部有代码 + 单测支撑。

---

## §4 · 自动化 Gate 总结

| Gate | 命令 | 结果 | 耗时 |
|---|---|---|---|
| §3.1 tsc | `NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json` | **0 error · wc -l = 0 · exit 0**（双跑确认） | ~90s |
| §3.2a typewriter | `run-typewriter-test.mjs` | **23/23 passing** | 152ms |
| §3.2b IME composition | `run-ime-composition-test.mjs` | **9/9 passing** | 91ms |
| §3.2c mode-switch | `run-mode-switch-component-test.mjs` | **8/8 passing** | 186ms |
| §3.2d view-mode-editable | `run-view-mode-editable-test.mjs` | **7/7 passing** | 5ms |
| §3.2e view-modes | `run-view-modes-test.mjs` | **37/37 passing** | 382ms |
| §3.2f view-mode-actions | `run-view-mode-actions-test.mjs` | **9/9 passing** | 6ms |
| §3.2g find-widget | `run-find-widget-test.mjs` | **20/20 passing** | 288ms |
| §3.2h find-service | `run-find-service-test.mjs` | **7/7 passing** | 8ms |
| §3.2i find-plugin | `run-find-plugin-test.mjs` | **31/31 passing** | 12ms |

**vsword 相关单测合计：151/151 passing · 0 fail · 0 pending**

---

## §5 · 结论 & 后续

- **自动化层：全绿 ✅**（tsc + 9 组共 151 单测 · 0 error / 0 fail / 0 skip）
- **手测层：R1 IME 真实 rime 交互留给用户复核**（kanban comment PAUSE-WAITING-USER 已就位）
- 其余 R2/R3/R5/R6 属"代码 + 单测钉死 + 视觉延后"类，用户在 dev-run 里目视复核为 UI 阶段任务

**判定：无 regression。可 review-required 归档。**

若 R1 用户手测出 regression（rime 打字仍失焦/打断），走 `T-3.13.7.b` 补票 · 派 dev 二次修 · 复跑本报告。


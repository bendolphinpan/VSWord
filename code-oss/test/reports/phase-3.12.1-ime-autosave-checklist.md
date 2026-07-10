# T-3.12.1.c · IME + auto-save 组合手测 checklist（15 组）

> 关联 kanban：`t_051c19bf`
> 关联 PRD：`docs/plans/003-phase3-fix-p0.md` §1（P0-1 保存打断输入）
> 前置 commit：T-3.12.1.a（host gate）+ T-3.12.1.b（webview 事件桥 `2844ebb4`）
> 用途：headless agent 无法自动化（切 IME、目测拼音候选、判定 focus 都要人眼 + 人手），故本文件由 **真人在开发机上跑完并勾选**，勾完把摘要贴回 kanban comment。
> 环境：Windows 10 或 11（本 PRD 目标平台）；用带有拼音候选浮层的 IME（否则 P0 场景不成立）。

## 0 · 跑之前的准备

1. 从 `dev` 拉最新，跑一次 vsword prod build，把 milkdown editor 部署进 code-oss 的运行时。
2. 用 `./scripts/code.sh`（或平台对应脚本）起 Code-OSS，打开任意 `.md` 文件（走 Milkdown 编辑器，不是内置 monaco）。
3. 打开 DevTools → Console，方便观察 webview 侧异常与 host log。
4. 三种 IME 都装好、能通过系统托盘 / Win+Space 切换：

   - **I1** · 微软拼音（Windows 10/11 内置）

   - **I2** · 搜狗输入法（Windows）

   - **I3** · Google 日本語入力（Windows）
5. `VSWORD_MILKDOWN_AUTOSAVE_DEBOUNCE_MS` 保持默认（当前 500ms）。若被环境变量覆盖，先记录实测值填在下面：

   - 实测 debounce ms：\_\_\_\_\_\_\_\_\_\_
6. 观测手段：每组结束用 `git status` / 编辑器 dirty 指示灯 / 磁盘文件 mtime 三方交叉验证是否落地保存。

## 1 · 矩阵

3 IME × 5 场景 \= 15 组。每格 ✅（AC 符合、无丢字）/ ❌（有 bug，紧跟现象 + 复现步骤）。

### 场景说明（S1-S5 共用）

- **S1 · composition 中间态保持 ≥ 500ms**（AC-1.1 + AC-1.2）
  Given 光标停在段落末尾。When 打 `shi jie ni hao`，停在候选浮层可见但未提交的中间态，静置 ≥ 700ms（覆盖 500ms debounce 到期）。观察：

  - (a) 候选浮层保持可见、webview 保持 focus、磁盘文件未变（AC-1.1）。

  - (b) 然后按空格提交候选 → compositionend → 再等 700ms。磁盘文件应落地 `世界你好`（或所选候选）。（AC-1.2）

- **S2 · composition 中按 Escape 取消**（AC-1.4）
  Given 打到中间态。When 按 Esc 取消候选。观察：候选清掉、doc 不残留字符、webview 保持 focus、`git status` 显示文件仍是取消前状态（无多余 save 被调度）。

- **S3 · composition 中触发 Ctrl+S**（AC-1.3）
  Given 打到中间态（候选未提交）。When 按 `Ctrl+S`。观察：

  - (a) 磁盘文件立即落地（时间戳可确认）；写入内容是 composition **开始前**的 markdown（因为候选未提交、`_current` 只到 composition 前）。

  - (b) 候选浮层保留、可以继续选字（webview 未被踢焦）。

  - (c) 选完候选后（compositionend + 500ms）会再有一次 auto-save，把选定文字落地。

- **S4 · 连续两次 composition**
  Given 打完第一次 `shi jie` 立刻空格提交 → 不停顿立刻打第二次 `ni hao` 到中间态 → 再空格提交。全程键盘不停 debounce（每两次操作间隔 < 500ms）。观察：两次输入的字都无丢失、最终 doc 内容 \= `世界你好`（或对应候选组合），磁盘文件在最后一次 compositionend + 500ms 后落地。

- **S5 · composition 中间态切 view mode**（回归 T-3.6b AC-6）
  Given 打到中间态（候选未提交）。When 通过 mode switch 组件切换到 source mode 再切回 editable（或反向）。观察：

  - (a) IME 提交（如果 IME 支持）或取消，doc 内不残留 pending 候选文本。

  - (b) 切模式后 markdown 结构没被 composition 撕裂（例如中英混排位置错乱、多出半个字符）。

  - (c) 磁盘文件最终内容与 doc 一致。

### 矩阵表

| #  | IME × 场景                           | 结果 | 现象 / 复现要点（❌ 必填）              |
| -- | ---------------------------------- | -- | ---------------------------- |
| 1  | I1 rime拼音 × S1 中间态 ≥500ms          | ⬜  | 会出现自动保存失焦。没有输入点击状态也会失焦（只要有更改 |
| 2  | I1 rime拼音 × S2 Escape 取消           | ⬜  | ✅                            |
| 3  | I1 rime拼音 × S3 Ctrl+S              | ⬜  | ✅                            |
| 4  | I1 rime拼音 × S4 连续两次 composition    | ⬜  | ✅                            |
| 5  | I1 rime拼音 × S5 切 view mode         | ⬜  | ✅                            |
| 6  | I2 搜狗 × S1 中间态 ≥500ms              | ⬜  | <br />                       |
| 7  | I2 搜狗 × S2 Escape 取消               | ⬜  | <br />                       |
| 8  | I2 搜狗 × S3 Ctrl+S                  | ⬜  | <br />                       |
| 9  | I2 搜狗 × S4 连续两次 composition        | ⬜  | <br />                       |
| 10 | I2 搜狗 × S5 切 view mode             | ⬜  | <br />                       |
| 11 | I3 Google 日文 × S1 中间态 ≥500ms       | ⬜  | <br />                       |
| 12 | I3 Google 日文 × S2 Escape 取消        | ⬜  | <br />                       |
| 13 | I3 Google 日文 × S3 Ctrl+S           | ⬜  | <br />                       |
| 14 | I3 Google 日文 × S4 连续两次 composition | ⬜  | <br />                       |
| 15 | I3 Google 日文 × S5 切 view mode      | ⬜  | <br />                       |

（把 ⬜ 换成 ✅ 或 ❌；❌ 时必填第 4 列现象 + 复现要点。）

## 2 · 判定

- 15 格全 ✅ → 本任务 complete，报告归档。

- 有 ❌ → 本任务 block，另开 T-3.12.1.d dev 修复卡，body 直接引用本文件第 4 列现象。

## 3 · 汇总（每 IME 一行结论）

- **I1 微软拼音**：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

- **I2 搜狗**：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

- **I3 Google 日文**：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

## 4 · 环境

- OS / build 号：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

- Code-OSS commit：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

- webview vsword prod build 时间：\_\_\_\_

- 磁盘 debounce 实测：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

- 跑测人：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

- 跑测时间：\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## 5 · Round-2（T-3.13.1）· A/B/C 三假设判定

> Round-1 (T-3.12.1.a/b) 落地后用户实测 Rime 中文输入时**仍然**打断输入 + 失焦。本 section 是 dev 逐一证伪三假设并落地根因 fix 的记录。

### 5.1 三假设判定

| 假设 | 描述 | 判定 | 证据 |
|---|---|---|---|
| A · Rime 特殊性 | Rime compositionend 迟到 / 被吞 → gate 提前关 | **未命中** | webview 侧 compositionend 上报路径已在 T-3.12.1.b 加日志验证，事件时序正常；Rime 的 compositionend 会在候选提交后同步 fire。 |
| **B · auto-save 未走 gate** | workbench 内置 `EditorAutoSave` 直接调 `workingCopy.save({reason: AUTO/FOCUS_CHANGE/WINDOW_CHANGE})` 绕过我们私有 timer 的 `_webviewComposing` gate | **✅ 命中（根因）** | `code-oss/src/vs/workbench/browser/parts/editor/editorAutoSave.ts` L228-269 · 监听 `workingCopyService.onDidChangeContent` → `scheduleAutoSave(workingCopy)` → 到期直接 `workingCopy.save({reason: SaveReason.AUTO})`。我们的 gate 只在 `milkdownWorkingCopy.ts:428` 私有 timer 内部检查，`save()` 主入口从头到尾不读 `_webviewComposing`。 |
| C · DOM 重建副作用 | 保存后若磁盘 === 内存仍走 `setMarkdown('external')` 导致 DOM 重建 → 失焦 | **次生** | 是根因 B 之后的现象：`save()` 写盘 → `onDidFilesChange` 触发 → `onExternalChange` 分支（因 `_dirty=false`）静默 reload → webview 收 `reload` → `createEditor` 整片重建。修 B 即断整条链，无需单独处理 C。 |

### 5.2 命中假设 B 的可复现步骤（AC-1.3 · QA 100% fail→pass 切换器）

**环境**：Windows 10/11 · VS Code 内置 auto-save afterDelay 1000ms（`files.autoSave = afterDelay`，`files.autoSaveDelay = 1000`）· 任意带候选浮层的 IME（Rime / 微软拼音 / 搜狗 / Google 日文都能复现）。

**Fail case（回归前）**：

1. 打开任意 `.md`（走 Milkdown editor）。设置 → `Files: Auto Save = afterDelay`，Delay = 1000ms。
2. 光标停段落末，开始 IME 敲一串中文（例："人工智能大语言模型"），**慢慢敲**，保证第一次 compositionstart 到最后一次 commit 之间超过 1000ms。
3. 观察：候选浮层敲到一半（未 commit）时 auto-save 到期 → 磁盘落盘 → webview `reload` → contenteditable 重建 → **IME 候选浮层消失 + 焦点跑掉**，用户觉得"输入被打断"。
4. 目测确认：`git status` 显示文件在第一次 1000ms 到期时已 modify，`mtime` 与打字时序对齐。

**Pass case（本 fix 后）**：

同样操作，观察 auto-save 不再在 composition 中间态触发；候选浮层保持、焦点不动。compositionend（候选提交）后 500ms 才落盘一次。

### 5.3 修复策略（假设 B · save() 主入口 gate）

`milkdownWorkingCopy.ts` `save()` 首行前置门检：

```ts
if (this._webviewComposing && this.isAutoSaveReason(options?.reason) && !options?.force) {
    return true; // 保留 _dirty；updateWebviewComposing(false) 会重新排 flush
}
```

- `isAutoSaveReason` 覆盖 `SaveReason.AUTO / FOCUS_CHANGE / WINDOW_CHANGE` 三种 workbench auto-save 家族触发源。
- 显式 save（`EXPLICIT` / `undefined` / `options.force`）不拦，保 AC-1.3 (Ctrl+S 立即写盘) + backup / dispose flush 主路径。
- 返回 `true` 而非 `false`：workbench 侧不该被感知为 save 失败（否则会重试 / 报错），语义上"gate 命中 = 延迟到 composition 结束"。

### 5.4 自证单测（T-3.13.1 · 单侧路径 · headless 可跑）

`code-oss/src/vs/workbench/contrib/vsword/test/node/milkdownWorkingCopy.test.ts` 新增 5 case，全绿：

- composing=true × 外部 `SaveReason.AUTO` → gate 命中不落盘
- composing=true × 外部 `SaveReason.FOCUS_CHANGE` → gate 命中不落盘
- composing=true × 外部 `SaveReason.WINDOW_CHANGE` → gate 命中不落盘
- composing=true × `options.force=true` → gate 让路，仍立即落盘（backup / hot-exit 兜底）
- composing 退出后外部 `AUTO` → 恢复正常落盘

Round-1 T-3.12.1.a 的 3 个原有 gate case（私有 timer 路径）继续保持绿。

Gate: `node code-oss/test/scripts/gate-e.mjs` · 300+ pass。

### 5.5 IME 手测

跳过（用户已多次实测确认 Round-1 的 IME 单侧事件桥工作正常，问题在 auto-save 那条路径）。本 fix 落地后如需回归，用 5.2 的可复现步骤跑一次即可，Round-1 checklist 15 组不必重跑。

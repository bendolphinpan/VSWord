# VSWord — Agent 工作规约

> 本文件是 VSWord 项目根目录的 agent 上下文。Hermes / Claude Code / Codex 打开此 workspace 时会自动读入，等同"项目级 memory"，不占全局 memory 额度。
>
> **只写项目相关规矩**。跨项目通用偏好（沟通风格、决策模式、语言）已在 Hermes user profile 里，不重复。

## 项目定位

VSWord = 基于 Code-OSS（VS Code fork）的**中文写作友好文本编辑器**。上游 fork 位于 `code-oss/`，VSWord 自研扩展和插件位于其中的 `extensions/vsword-*` 及 Milkdown webview。

## 分支与推送

- 主开发分支：`dev`
- **Push 授权规则**：模块内单个功能点完成 + 相关检查全绿（`tsc` 0 error / vsword 相关单测全过 / 相关 Gate 绿）→ **直接 `git push origin dev`，不问确认**
- 中途子任务不 push；一个功能点收官才 push
- 用户明确要求"该 push 的及时 push"——不要攒一堆 commit 等模块收官再一次性推

## Phase 3 阶段策略

- **功能优先，视觉延后**：Phase 3 期间只保证功能完善无 bug；主题/CSS/视觉调优统一放到最后 UI 布局阶段做
- 遇到"这里样式怪怪的""这个颜色不好看"——记下来，**不当场改**
- 唯一例外：视觉问题妨碍功能验证（比如按钮点不到）时才立即处理

## 顺序执行

- 按 `docs/plans/003-*` master plan 里的模块顺序推进
- **不跳过、不重排、不自主选优先级**
- 当前模块收官（Gate 全绿 + push）后，自动推进下一个未启动模块
- 用户说"继续" = 按当前顺序执行下一步，不要停下来问

## Kanban / 多角色协作

- Coordinator（项目管家）在微信 gateway session 里，用 kanban 派发任务给 pm / dev / qa 三个 profile
- **Kanban workspace 路径必须用 Windows 原生格式**（`D:\GIT\VSWord`），**不能**用 MSYS 格式（`/d/GIT/VSWord`）——dispatcher 会拒绝非绝对路径
- 具体协作流程见 skill `multi-agent-team` 和 `project-coordinator`

## 汇报纪律（针对 coordinator 角色）

- 模块完成 / 任务结束时，**同一 turn 内主动汇报**（push 完立刻说结果）
- 不等用户下次 poke
- "又没后文了""怎么又没汇报"是严重违规
- watcher 未发消息时**先查 agent.log 自证**，再定结论；禁止事后编"静默等待"借口

## 测试与验收 Gate

- `tsc` 必须 0 error（`code-oss/` 上游忽略）
- VSWord 相关单测全绿
- 每个 T-x.x 任务在 master plan 里定义了独立 Gate（如 Gate D-G），完成时需检查
- 具体 Gate 定义查 `docs/plans/003-*.md`

## 语言与命名

- 所有 commit message、代码注释、PR 描述、任务标题：**中文**
- 代码标识符（变量/函数/类）：英文（跟随 Code-OSS 上游习惯）
- 用户可见字符串：中文（VSWord 是中文写作编辑器）

## Milkdown 相关技术备忘

以下是 Phase 3 已踩坑、后续任务可能复用的实现要点：

### T-3.5.1 图片相对路径 & 上传
- 用 `<base href>` 处理相对图片路径
- `@milkdown/plugin-upload@7.21.2`，通过 `ctx.set(uploadConfig.key, ...)` 配置
- 关闭 `enableHtmlFileUploader: false`
- 用 token-pending Map 处理异步 host I/O over postMessage
- 纯函数策略模块（3 种策略）
- Typora 兼容用 `-1` 冲突后缀

### T-3.9 数学公式 NodeView
- `math_block` 编辑：`tr.setNodeMarkup(pos, null, { value: next })`（覆盖 attrs.value）
- `math_inline` 编辑：`tr.replaceWith(from, to, schema.text(next))`（走 text children）
- 两种都需要 `stopEvent + ignoreMutation`（atom + interactive-children 模式）

后续任务遇到类似模式（NodeView / plugin config / webview I/O）时先参考这里。

## 引用文档

- 需求：`docs/requirements/`
- 决策记录：`docs/decisions/`
- Phase 计划：`docs/plans/`（当前主计划 `003-*`）
- 研究调研：`docs/research/`
- Spike 实验：`docs/spikes/`
- Phase 0 归档：`docs/phase0/`

Master plan 里的 T-x.x 任务号是当前 Phase 3 的唯一权威索引，讨论进度时优先引用它。

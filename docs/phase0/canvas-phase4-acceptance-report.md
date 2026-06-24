# Phase 4 — Canvas 收口与验收报告

> **日期**：2026-06-24
> **当前分支**：dev
> **T-4.6 最终代码提交**：83cb60a6 fix(vsword): harden Canvas feedback edge cases
> **Canvas 代码提交链**：5cd71c47 → 576853ca → a84b7ec3 → 83cb60a6
> **T-4.7 收口提交**：本报告提交后记录在 git log

---

## 1. Phase 4 已完成节点总览

| 节点 | 需求文档 | 提交 | 核心交付 |
|---|---|---|---|
| T-4.1 渲染库 spike | 无（内部 spike） | — | 选择 React Flow（MIT）并确认能力 |
| T-4.2 Canvas service + storage | FR-03 (partial) | — | `.vsword/canvas.json` schema v1 |
| T-4.3 Canvas MVP | FR-03 | — | 自研 SVG Canvas，文件夹即画布基础 |
| T-4.4 文件生命周期闭环 | FR-03 §2.4~2.6 | 5cd71c47 | 安全删除、Tray、Restore/Delete、拖拽/粘贴、文本节点 |
| T-4.5 文件节点体验 | FR-04 | 576853ca | 图片预览、文本摘要、fallback、预览开关、稳定卡片 |
| T-4.6 操作反馈与异常状态 | FR-05 | a84b7ec3 + 83cb60a6 | Toast 反馈、空状态、Missing 状态、图片加载失败、安全边界 |
| T-4.7 收口与验收 | FR-06 | 本轮 | 验收清单、安全回归、Phase 4 结论 |

---

## 2. Canvas 当前已交付能力矩阵

### 入口 / 恢复 | ✅
- Explorer 右键 Open as Canvas
- Canvas tab 关闭后恢复（通过 viewType + webview state + viewport）
- 窗口重启后 tab 恢复

### 文件夹即画布 | ✅
- 当前文件夹直接子文件 → file card
- 当前文件夹直接子文件夹 → folder card
- 子文件夹双击下钻

### 布局持久化 | ✅
- 节点位置（nodesMoved）保存恢复
- 节点尺寸（width/height）通过 NodeResizer 保存恢复
- Viewport pan/zoom 保存恢复
- Edge/连线 保存恢复

### 文件生命周期 | ✅
- Delete/Backspace → 从 Canvas 移除，不删磁盘文件
- 移除文件进入 Tray
- Tray Restore → 放回 Canvas
- Tray Delete → 二次确认 → 真实删除
- 子文件夹走同语义

### 导入能力 | ✅
- 外部文件拖入 Canvas → 写入当前文件夹/assets → 创建节点
- 粘贴文件/图片 → 写入 → 创建节点
- 粘贴文本 → 创建 text node
- 同名冲突不覆盖

### 文件节点体验 | ✅
- 图片（png/jpg/gif/webp/svg）显示缩略图
- Markdown/txt 显示摘要
- unknown/binary 显示 fallback
- 预览开关对三类类型一致
- 卡片不 hover 扩高、不重排

### 异常状态与反馈 | ✅
- 操作中/成功/失败 toast（restore/delete/import/create text）
- 空 Canvas 引导
- hostError 非阻塞 toast
- 文件/文件夹 Missing 状态
- 图片加载失败 fallback
- 读取失败显式提示，不静默吞掉

### 安全边界 | ✅
- `resolveFilePath()` + `resolveFolderPath()` 两级路径校验
- 拒绝 `../`、绝对路径、scheme、NUL、. / ..
- Delete/Restore 限制在当前 Canvas 文件夹内
- CSP 未放宽、未引入远程脚本
- 未改 root `package.json/package-lock.json`

---

## 3. 未完成的 P0 / 已知缺陷

当前没有已知的 P0 阻塞缺陷。以下为 P1/P2 遗留项：

| # | 项 | 分类 | 说明 |
|---|---|---|---|
| 1 | Missing 文件重新定位/移除 | P1 UX | 双击 Missing 仅提示，无重新定位或自动移除路径 |
| 2 | Undo/Redo | P1 通用 | 覆盖删除、移动、resize、连线等；当前缺少 |
| 3 | 新建真实文件卡片 | P1 功能 | 在 Canvas 内创建 .md/.txt 等真实文件；当前不支持 |
| 4 | 性能优化 / 虚拟化 | P2 | 大文件夹（500+ 节点）性能未验证 |
| 5 | 白板绘图节点 | P2 | Excalidraw 在 spike 范围，未集成 |
| 6 | 预览长篇文件 | P2 | 当前只显示摘要，无折叠展开 |
| 7 | Escape 取消添加节点操作 | P2 UX | 当前无取消状态 |
| 8 | 多 Canvas 文件夹并行情况 | P2 | 仅单文件夹验证 |

---

## 4. 验证结果

| 检查项 | 结果 |
|---|---|
| React Flow bundle build | 通过 |
| `npm run compile` | 0 errors |
| `PACKAGE_DIFF_EXIT` | 0（root package 未变） |
| `OUT_INDEX_EXIT` | 0（out bundle 存在） |
| `git diff --check` | 通过 |
| 安全 grep（secret/eval/innerHTML/CSP） | 未发现问题 |
| 代码审查（独立审查任务） | 通过，含修复 |
| 工作区 | clean |

---

## 5. 下一步判断

- **当前无 P0 阻塞**，具备进入 Phase 5 的条件。
- 建议：用户在完成本报告验收后，**先按 FR-06 的验收清单走一遍手动测试**。如果有验收反馈问题，优先在本阶段修复再切 Phase 5。
- Phase 5（Mindmap）与 Canvas 无强依赖，可以并行或顺序推进。

---

## 6. 相关文档索引

| 文档 | 路径 |
|---|---|
| 产品需求 (PRD) | `docs/requirements/PRD-vsword-v1.md` |
| Canvas 需求 (FR-03) | `docs/requirements/FR-03-canvas-miro-parity.md` |
| 文件节点体验 (FR-04) | `docs/requirements/FR-04-canvas-file-node-experience.md` |
| 操作反馈需求 (FR-05) | `docs/requirements/FR-05-canvas-operation-feedback.md` |
| 收口验收 (FR-06) | `docs/requirements/FR-06-canvas-productization-acceptance.md` |
| 开发任务分解 | `docs/plans/002-development-task-breakdown.md` |
| React Flow README | `code-oss/src/vs/workbench/contrib/vsword/browser/spikes/reactflow/README.md` |
| 技术参考 | `.hermes/skills/software-development/vscode-fork-development/` |
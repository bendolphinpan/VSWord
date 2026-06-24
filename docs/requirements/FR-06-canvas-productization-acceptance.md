# FR-06 — Canvas 产品化收口与阶段验收

> **阶段**：T-4.7 Canvas 产品化收口与验收
> **目标**：把 T-4.4～T-4.6 已交付的文件夹 Canvas 能力整理成一套可手动验收、可回归、可继续迭代的产品闭环；明确 Phase 4 当前完成边界、P0 验收流程、遗留风险和下一阶段入口。

---

## 1. 用户故事

- 作为写作者，我希望打开任意文件夹 Canvas 后，可以用一套固定流程确认“文件夹即画布”的核心能力是否可用，而不是靠零散试点。
- 作为产品负责人，我希望知道 Canvas 当前 P0 已完成什么、哪些还属于后续增强，避免 Phase 5 开始后 Canvas 主线状态不清。
- 作为开发者，我希望每次改 Canvas 后都有一份回归清单，覆盖文件生命周期、预览、异常反馈和安全边界。

---

## 2. P0 范围

| 能力 | 当前验收目标 |
|---|---|
| 入口与恢复 | Explorer 文件夹入口可打开 Canvas；tab/window restore 后仍显示同一文件夹 Canvas |
| 文件夹即画布 | 当前文件夹直接子文件/子文件夹自动成为 file/folder 节点；子文件夹双击下钻 |
| 布局持久化 | 节点移动、resize、viewport pan/zoom 在 reload/restore 后保持 |
| 文件生命周期 | Delete/Backspace 只从 Canvas 移除；Tray 可恢复；Tray 删除走二次确认与系统回收站/删除能力 |
| 导入能力 | 拖拽/粘贴文件、图片、文本进入 Canvas；写入当前 Canvas 文件夹或 assets 后创建节点 |
| 文件节点体验 | 图片缩略图、Markdown/text 摘要、unknown/binary fallback；预览开关一致；卡片不 hover 扩高 |
| 异常状态 | 空 Canvas 引导、operation toast、host error toast、Missing 文件/文件夹状态、图片加载失败 fallback |
| 安全边界 | Canvas 文件操作限制在当前 Canvas 文件夹；不扩大 CSP；不读未知二进制作为文本；不改 root package lockfiles |

---

## 3. 不做项

| # | 不做项 | 替代/后续 |
|---|---|---|
| W-1 | T-4.7 不新增新的 Canvas 交互大功能 | 只做收口、验收、回归与边界梳理 |
| W-2 | 不在本阶段引入新主线依赖 | React Flow / XYFlow 继续使用既有 MIT 路线 |
| W-3 | 不实现 Undo/Redo、自动重新定位 Missing 文件 | 保持 Missing 状态，后续独立阶段做修复路径 |
| W-4 | 不做性能虚拟化/LOD | 节点量增大后的性能优化放后续 |
| W-5 | 不做多人协作、云同步、模板市场 | VSWord 当前坚持本地优先 |

---

## 4. 手动验收环境

### Windows PowerShell 启动

```powershell
cd D:\GIT\VSWord\code-oss
.\scripts\code.bat --user-data-dir "D:\GIT\VSWord\.tmp\gui-smoke\user-data-canvas-t47"
```

### Git Bash 启动

```bash
cd /d/GIT/VSWord/code-oss
./scripts/code.bat --user-data-dir "D:/GIT/VSWord/.tmp/gui-smoke/user-data-canvas-t47"
```

建议准备一个测试文件夹，例如：

```text
D:\GIT\VSWord\.tmp\canvas-manual-test\
  notes.md
  todo.txt
  image.png
  binary.dat
  subfolder\
```

---

## 5. 阶段验收清单

### 5.1 入口与基础渲染

- [ ] 在 Explorer 里对测试文件夹执行 Open as Canvas，Canvas tab 打开。
- [ ] 文件夹内直接子文件显示为 file card；直接子文件夹显示为 folder card。
- [ ] 子文件夹双击打开/下钻到子 Canvas；返回或重新打开不会崩溃。
- [ ] Canvas tab 关闭/窗口重启后，restore 到同一文件夹 Canvas。

### 5.2 布局与视图状态

- [ ] 拖动节点位置后 reload，位置保持。
- [ ] resize 文件节点后 reload，尺寸保持。
- [ ] pan/zoom viewport 后 reload，视图恢复到相近位置。
- [ ] Show/Hide preview 和 minimap 气泡状态不破坏 Canvas 数据。

### 5.3 文件生命周期

- [ ] 选中文件节点按 Delete/Backspace 后，磁盘文件仍存在。
- [ ] 被移除文件出现在 Tray，Tray 计数正确。
- [ ] 从 Tray Restore 后，节点回到 Canvas，reload 后仍存在。
- [ ] 从 Tray Delete 有二次确认；确认后文件不再出现在当前文件夹/Tray。
- [ ] 子文件夹走同样的移除、Tray、Restore、Delete 语义。

### 5.4 拖拽/粘贴导入

- [ ] 从外部拖入图片/文件后，文件写入当前 Canvas 文件夹或 assets，Canvas 出现节点。
- [ ] 粘贴图片后生成图片文件和图片节点。
- [ ] 粘贴普通文本后生成 text node。
- [ ] 同名文件导入不会覆盖原文件，会自动追加后缀。
- [ ] 导入读取失败时有错误 toast，不伪装成成功。

### 5.5 文件节点体验

- [ ] 图片文件显示缩略图。
- [ ] Markdown/text 显示摘要。
- [ ] unknown/binary 文件显示 fallback，不出现乱码正文。
- [ ] Hide preview 后图片/文本/fallback 预览都隐藏。
- [ ] 图片加载失败显示 fallback，不撑高卡片、不重排。

### 5.6 异常状态与反馈

- [ ] 空 Canvas 显示引导，不遮挡 toolbar/minimap。
- [ ] Restore/Delete/Import/Create text 有操作中和成功/失败 toast。
- [ ] 外部删除文件后重新打开 Canvas，对应节点显示 Missing。
- [ ] Missing 文件/文件夹双击不崩溃，并显示错误提示。
- [ ] host error 以非阻塞 toast 展示，不导致 Canvas 空白。

### 5.7 安全与回归

- [ ] Canvas 操作不会删除当前 Canvas 文件夹外的文件。
- [ ] root `package.json` / `package-lock.json` 无变化。
- [ ] React Flow bundle build 通过。
- [ ] `npm run compile` 0 errors。
- [ ] 代码审查确认未新增远程脚本、未放宽 CSP、未新增 `innerHTML`/`eval`、未硬编码 secret。

---

## 6. Phase 4 当前结论

T-4.4～T-4.6 已经让 Canvas 达到“文件夹即画布”的 P0 产品闭环：

- 文件夹可作为 Canvas 打开。
- 文件/文件夹节点能被组织、预览、恢复、删除、导入。
- Canvas 状态能持久化。
- 常见异常状态可被用户理解。
- 关键文件操作有当前文件夹安全边界。

T-4.7 的交付物不是新增 UI，而是把这套能力固化为验收流程和后续迭代基线。

---

## 7. 后续建议

| 优先级 | 后续项 | 说明 |
|---|---|---|
| P0 后续 | Canvas 手动验收反馈修复 | 用户按本清单验收后，发现的问题集中修复 |
| P1 | Missing 文件重新定位/从 Canvas 移除 | 给缺失节点更直接的恢复路径 |
| P1 | Undo/Redo | 覆盖删除、移动、resize、连线等操作 |
| P1 | 新建真实文件卡片 | 在 Canvas 内创建 `.md` / `.txt` 等真实文件 |
| P2 | 性能虚拟化/LOD | 大文件夹/大节点量优化 |
| P2 | Excalidraw/自由绘图节点 | 在 Canvas 中补更完整白板能力 |

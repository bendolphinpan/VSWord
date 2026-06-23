# FR-05 — Canvas 操作反馈与异常状态模块

> **从属于**：`PRD-vsword-v1.md` / `FR-03-canvas-miro-parity.md`
> **阶段**：T-4.6 Canvas 操作反馈与异常状态模块
> **目标**：让 Canvas 的删除、恢复、真实删除、拖拽/粘贴、预览加载、文件缺失等状态对用户可理解，避免“点了没反应”或“文件不见了但不知道为什么”。

---

## 1. 用户故事

- 作为写作者，我执行拖拽、粘贴、恢复、删除后，应立刻知道系统正在处理、已经完成或失败。
- 作为写作者，我打开空文件夹或空 Canvas 时，应知道下一步可以拖入/粘贴文件，或从 Tray 放回文件。
- 作为写作者，如果 `.vsword/canvas.json` 引用的文件已被外部删除/移动，Canvas 应明确标记“文件缺失”，而不是显示成普通卡片。
- 作为写作者，错误提示应能告诉我操作类型和对象，而不是只出现底层异常字符串。

---

## 2. P0 范围

| 能力 | 规则 |
|---|---|
| 操作中反馈 | 拖拽/粘贴/恢复/真实删除发起后显示非阻塞状态提示 |
| 完成反馈 | host 刷新 folderData 后显示短暂成功提示 |
| 错误反馈 | hostError 显示为明显错误 toast，不覆盖 Canvas 内容 |
| 空 Canvas 状态 | `nodes.length === 0` 时显示引导：拖入/粘贴文件，或 Tray restore |
| Tray 空状态 | 已有 Tray 空态继续保留，文案与空 Canvas 状态一致 |
| 文件缺失状态 | canvas node 引用的 file/folder 不存在时，卡片标记 `Missing`，禁止伪装为正常预览 |
| 预览异常 fallback | 图片无法显示时，卡片内部显示预览不可用，不撑破布局 |
| 状态不重排 | toast/empty/missing 不引发节点尺寸跳动或全局布局变化 |

---

## 3. P1 / 后续

- 每条操作反馈带 Undo。
- 批量操作进度条。
- 更细分的文件权限/只读/锁定状态。
- 将缺失文件从 Canvas 一键移出或重新定位。

---

## 4. 明确不做

| 不做项 | 替代方案 |
|---|---|
| 完整通知中心 | 先做 Canvas 内非阻塞 toast |
| 操作 Undo | 先保留安全删除 + Tray 恢复；真实删除仍二次确认 |
| 自动搜索移动后的文件 | 显示 Missing，后续再做重新定位 |
| 阻塞式 modal 进度 | 保持轻量非阻塞提示，避免影响 Canvas 操作 |

---

## 5. 验收清单

- [ ] 拖拽/粘贴文件后出现操作中提示，刷新后出现完成提示。
- [ ] Tray Restore / Restore all 后出现操作中与完成提示。
- [ ] Tray Delete file 确认后出现操作中与完成提示；失败时显示错误。
- [ ] 空 Canvas 显示引导，不遮挡 toolbar/minimap。
- [ ] 如果 Canvas node 引用的文件已不存在，卡片显示 Missing 状态，图片/文本预览不再伪装正常。
- [ ] Missing 文件双击不会造成崩溃；host error 可见。
- [ ] toast/empty/missing 不改变节点尺寸，不导致 hover 扩高。
- [ ] React Flow bundle build 通过。
- [ ] `npm run compile` 0 errors。
- [ ] `package.json/package-lock.json` 无变化。
- [ ] 代码审查确认没有吞掉错误、没有把 filesystem 异常伪装成成功、没有扩大 webview CSP。

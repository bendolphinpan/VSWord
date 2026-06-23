# FR-04 — Canvas 文件节点体验模块

> **从属于**：`PRD-vsword-v1.md` / `FR-03-canvas-miro-parity.md`
> **阶段**：T-4.5 Canvas 文件节点体验模块
> **目标**：让 Canvas 上的 file/folder/text 节点成为稳定、可预期、可验收的知识卡片，而不是只显示文件名。

---

## 1. 用户故事

- 作为写作者，我把图片拖入/粘贴到 Canvas 后，节点应直接显示图片缩略图，而不是只显示文件名。
- 作为写作者，我打开一个包含 Markdown、图片、txt、普通文件、子文件夹的目录时，能快速看出每个节点是什么类型、内容大概是什么。
- 作为写作者，我关闭预览时，所有节点都稳定收起预览区，不因 hover 或内容加载造成卡片尺寸跳动。
- 作为写作者，我删除、暂存、恢复、拖入或粘贴文件后，节点展示策略保持一致。

---

## 2. P0 范围

| 能力 | 规则 |
|---|---|
| 图片预览 | `.png/.jpg/.jpeg/.gif/.webp/.svg` file card 显示图片本体缩略图 |
| Markdown 预览 | `.md/.markdown` 显示标题/要点摘要；如正文首图为本地相对路径，显示小缩略图 |
| 文本预览 | `.txt/.json/.yaml/.yml/.toml/.csv/.log` 显示前几行文本摘要 |
| 未知文件 fallback | 显示文件类型、路径、双击打开提示，不读二进制内容 |
| 文件夹卡片 | 与文件卡片视觉区分，显示下钻提示 |
| 预览开关 | `Show/Hide preview` 对图片、Markdown、文本、fallback 行为一致 |
| 尺寸稳定 | 不因 hover、图片加载、摘要长度导致节点扩高或重排；预览区内部裁切/滚动 |
| 文件生命周期一致性 | 删除→Tray→恢复、拖拽、粘贴产生的节点都走同一展示规则 |

---

## 3. P1 / 后续

- PDF 第一页缩略图。
- Office 文件预览。
- 图片大图查看器 / lightbox。
- 视频/音频节点内联播放器。
- 更完整的文件类型图标系统。

---

## 4. 明确不做

| 不做项 | 替代方案 |
|---|---|
| 完整图片编辑器 | 双击后仍交给 VS Code/系统编辑器或后续专门图片模块 |
| 媒体库管理 | 先仅做当前 Canvas 文件夹/`assets/` 内文件展示 |
| 远程图片抓取/缓存 | Markdown 远程图片只显示文字摘要，不主动联网 |
| 对任意二进制文件读内容 | 未知文件只显示 fallback，避免乱码和性能问题 |

---

## 5. 验收清单

- [ ] 图片文件节点显示缩略图，且 `object-fit: cover/contain` 不撑破卡片。
- [ ] 粘贴/拖入图片进入 `assets/` 后，生成节点立即显示缩略图。
- [ ] Markdown 文件仍显示摘要；本地首图可作为缩略图显示。
- [ ] txt/json/yaml/toml/csv/log 显示文本摘要。
- [ ] exe/zip/pdf/unknown 等不支持类型不读二进制，显示清晰 fallback。
- [ ] `Hide preview` 后图片/文本/Markdown 都隐藏预览区，只保留文件基本信息。
- [ ] 节点 hover 不扩高、不重排；resize 后预览区域仍在卡片内部。
- [ ] Delete → Tray → Restore 后，恢复的图片/文本节点预览仍正常。
- [ ] React Flow bundle build 通过。
- [ ] `npm run compile` 0 errors。
- [ ] `package.json/package-lock.json` 无变化。
- [ ] 代码审查确认无远程资源放开、无路径越界、无二进制误读。

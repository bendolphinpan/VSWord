# Decision 0007 · RD-9 Mindmap 剩余（阶段交付）

- **日期**：2026-07-13（收尾修订同日）  
- **状态**：RD-9.1/1b/1c ✅ · RD-9.3/3b ✅ · RD-9.2/9.4 延后 · **阶段收口**  
- **关联**：`004` RD-9 · `FR-02-mindmap-xmind-parity.md`

---

## 1. 子项结论

| 子项 | 内容 | 状态 |
|------|------|------|
| **RD-9.1** | Markdown ↔ `.mm` 互转 | ✅ `markdownBulletsToMindmap` / `markdownToMindmapXml` + 命令 `vsword.actions.markdownOutlineToMindmap` |
| **RD-9.1b** | ATX 标题 `#`…`######` + 列表混排导入 | ✅ FR-02：H1=root / H2–H6 层级 / 列表→子节点 |
| **RD-9.1c** | `.mm` → Markdown 标题大纲导出 | ✅ `mindmapToMarkdownOutline` + 命令 `vsword.actions.mindmapToMarkdownOutline`（Explorer 右键 + F1） |
| **RD-9.2** | richcontent 富文本可视化编辑 | ⏸ 延后（P2 · UI 重 · 当前只读保留） |
| **RD-9.3** | 1k fixture parse/serialize 探针 | ✅ |
| **RD-9.3b** | **10k 合成节点实测** parse/serialize | ✅ `synthetic-10k`：parse ~30ms · roundTripOk · **非整页 mind-elixir 渲染** |
| **RD-9.4** | Mindmap IME 专项 | ⏸ 延后（P1 若导图中文编辑成为主场景再开） |

---

## 2. RD-9.1 有损说明

- 导入认：ATX 标题 + 列表行（`-`/`*`/`+`/`1.`）与缩进  
- 不导入图标、颜色、arrowlink、richcontent、段落正文  
- 多顶层（多 H1 或无 H1 的多根列表/标题）→ 合成根 `Outline`  
- 导出 MD：outline 用标题层级；bullet 投影仍转义，往返可能改变反斜杠  

---

## 3. 命令

```text
命令面板：VSWord: Markdown Outline to Mindmap (.mm)
命令面板 / Explorer(.mm)：VSWord: Mindmap to Markdown Outline
```

- MD→.mm：同目录写出 `*.mm` 并打开 Mindmap 视图  
- .mm→MD：同目录写出 `*.outline.md` 并打开编辑器（有损提示）

---

## 4. 探针

```bash
# 需 out/ 编译或 esbuild
node code-oss/test/scripts/rd-9-mindmap-perf-probe.mjs
# → test/reports/rd-9-mindmap-perf.json（含 fixture1k + synthetic10k）
```

**基线（2026-07-13）**：1k parse ~4.5ms；10k 合成 parse ~30ms；serialize 近 0；byte round-trip OK。

---

## 5. 阶段收口边界

- **已收**：互转（含标题）、导出命令、parse 性能数量级  
- **未收（明确延后）**：richcontent 可视化编辑、导图内 IME 专项、mind-elixir 10k **布局渲染**矩阵  
- 后续若开 richcontent / IME，新开 RD 或复活 9.2/9.4，不阻塞 Phase 5 主线声明  

---

**Decision End · 0007**

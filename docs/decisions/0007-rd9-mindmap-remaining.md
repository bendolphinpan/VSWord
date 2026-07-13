# Decision 0007 · RD-9 Mindmap 剩余（阶段交付）

- **日期**：2026-07-13  
- **状态**：RD-9.1 ✅ · RD-9.3 探针 ✅ · RD-9.2/9.4 延后  
- **关联**：`004` RD-9 · `FR-02-mindmap-xmind-parity.md`

---

## 1. 子项结论

| 子项 | 内容 | 状态 |
|------|------|------|
| **RD-9.1** | Markdown ↔ `.mm` 互转 | ✅ `markdownBulletsToMindmap` / `markdownToMindmapXml` + 命令 `vsword.actions.markdownOutlineToMindmap`；`.mm`→MD 原有 |
| **RD-9.2** | richcontent 富文本可视化编辑 | ⏸ 延后（P2 · UI 重 · 当前只读保留） |
| **RD-9.3** | 10k 节点性能矩阵 | ✅ 探针 `rd-9-mindmap-perf-probe.mjs`（1k fixture + 外推说明）；**非整页 10k 渲染矩阵** |
| **RD-9.4** | Mindmap IME 专项 | ⏸ 延后（P1 若导图中文编辑成为主场景再开） |

---

## 2. RD-9.1 有损说明

- 导入只认列表行（`-`/`*`/`+`/`1.`）与缩进  
- 不导入图标、颜色、arrowlink、richcontent  
- 多顶层列表 → 合成根 `Outline`  
- 导出 MD 使用转义，往返可能改变反斜杠  

---

## 3. 命令

```text
命令面板：VSWord: Markdown Outline to Mindmap (.mm)
```

同目录写出 `*.mm` 并打开 Mindmap 视图。

---

## 4. 探针

```bash
# 需 out/ 编译或 esbuild（milkdown builder）
node code-oss/test/scripts/rd-9-mindmap-perf-probe.mjs
# → test/reports/rd-9-mindmap-perf.json
```

---

**Decision End · 0007**

# Decision 0003 · RD-1 大文档 open pipeline（阶段结论）

- **日期**：2026-07-13  
- **状态**：In progress（RD-1.2 progressive 已落地；全量 ≤2s 仍待 table 算法/D）  
- **关联**：`004-remediation-and-debt-plan.md` RD-1 · 历史 `phase-3.9-perf.md`

---

## 1. 测量结论（1MB mixed · ~606k chars / 1 000 356 bytes）

本机 Node 24 · `.tmp/milkdown-prod-builder`：

| 路径 | 约耗时 |
|------|--------|
| micromark plain | ~0.5 s |
| **micromark + gfm-table only** | **~8.3 s** |
| micromark + strike / autolink / task | ~0.4 s |
| micromark + gfm-all | ~11 s |
| remark + gfm 切片 | 50k~0.13s · 100k~0.27s · 200k~0.86s · 400k~3.5s · 606k~24s |

**结论**：**GFM table 扩展**是主瓶颈（超线性）。历史 O(N²) 判断正确。

---

## 2. 生产路径上的重复成本（已修一刀）

`entry.template.js` `createEditor` 在 `Editor.make()` **之前**曾：

```text
unified().use(remarkParse).parse(整篇 markdown)  → 仅为 setext hint 抽 blockRanges
```

这是一次 **额外 ~0.5s + 整树内存**，且 **不复用** Milkdown 内部 GFM parse。

### 决策（已实现）

- setext hint 改为 **`scanSetextHintsFromSource` O(N) 行扫描**（跳过 fence，两行块 title+underline）。  
- **删除** createEditor 前的 full `remark-parse`。  
- 契约与 `parseSetextHeading` 对齐；多行 setext 与旧路径同样不支持。

**效果**：去掉打开路径上的重复 parse；**不能**单独把 1MB open 压到 2s（GFM 仍在）。

---

## 3. 方案选择

| 方案 | 预期 | 风险 | 状态 |
|------|------|------|------|
| A. 大文档关闭 GFM/table | 快 | 破坏 Typora 表格对等 | ❌ 不做默认 |
| B. Worker 全量 parse | 不卡死 UI | 首交互仍等全量 | 备选 |
| **C. Progressive 分块 open** | 首屏 ~100–200k GFM ≤1s 级 | 跨块表格需安全切点 | ✅ **已实现** |
| D. 裁剪/替换 table 实现 | 全量也快 | 兼容矩阵 | 后续可选 |

### C 实现要点（RD-1.2 · 2026-07-13）

- 纯函数：`webview/markdown-chunk.template.js`  
  - `shouldUseProgressiveOpen`（默认 >180k chars）  
  - `splitMarkdownProgressive` / `findSafeSplitOffset`（避 fence、优先空行、尽量避表格行中）  
- `entry.template.js`：`createEditor` 首屏 `defaultValueCtx = chunks[0]` → Ready 可编辑 → `yieldToMain` 循环 `parser(chunk)+tr.insert`  
- `progressiveLoading` 期间不向 host 报 dirty  
- 新 `createEditor` 用 `progressiveEpoch` 取消在途追加  

**RD-1-lite**：首交互（首屏 Ready）目标 ≤2s；**全量加载完成**仍可能 >2s（总 CPU 近似分块之和，但 UI 可响应）。

---

## 4. 验收与命令

```bash
node code-oss/test/scripts/run-setext-scan-test.mjs
node code-oss/test/scripts/run-markdown-chunk-test.mjs

# 历史 open bench（整篇 GFM 仍可能 breach，作回归锚点）
node code-oss/test/scripts/perf-3.9.1-bench.mjs --fixture 1mb --runs 3 --skip-type
```

手测：打开 >180k 字符 `.md`，状态栏应见「大文档加载中（首屏）…」→ 可输入 → 「Ready」。

---

## 5. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 首建：GFM 主因、setext 去重 |
| 2026-07-13 | table 钉死；progressive C 落地 |

**Decision End · 0003**

# Decision 0003 · RD-1 大文档 open pipeline（阶段结论）

- **日期**：2026-07-13  
- **状态**：RD-1-lite / RD-1.4a / **RD-1.4 产品限速提示** 已落地；**全量** 1MB Ready ≤2s 仍受 GFM table 超线性限制，挂 **RD-1.4b（算法 D，可选）**  
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

### Gate-R1 口径拆分（RD-1.3 · 2026-07-13）

| 等级 | 指标 | 状态 |
|------|------|------|
| **RD-1-lite**（发布硬门槛） | 1MB：首屏可编辑（TTI）≈ 首块 GFM parse；目标 ≤2s；加载中可输入 | ✅ progressive + 首块 48k + 进度/脏标记修复 |
| **RD-1.3 全量** | 1MB 全量 Ready P95 ≤2s | 🔴 仍受 table 超线性限制 → **RD-1.4b**（可选） |
| **RD-1.4 产品路径** | 不全量预取 + **显著限速提示** + 用户可「加载剩余」 | ✅ 2026-07-13 |

**产品提示（RD-1.4）**：

1. 工具栏 status：`已加载 n/m 段 · 下滚加载更多（未全量，保流畅）`  
2. 工具栏下方 **banner**：进度 +「加载剩余」+「知道了」  
3. host 首次 progressive open：**notification** 一次（APPLICATION 记忆）  
4. `openProgress` 协议供 host 日志  

**明确不保证**：一次灌入 1MB/5MB 全量 PM 的 wall-clock 阈值；策略是 **TTI 优先 + 按需装载**。

---

## 4. 验收与命令

```bash
node code-oss/test/scripts/run-setext-scan-test.mjs
node code-oss/test/scripts/run-markdown-chunk-test.mjs

# 历史 open bench（整篇 GFM 仍可能 breach，作回归锚点）
node code-oss/test/scripts/perf-3.9.1-bench.mjs --fixture 1mb --runs 3 --skip-type
```

手测：打开 >180k 字符 `.md`，状态栏应见「大文档加载中（首屏）…」→ **可输入** → 后台续载 → 「Ready」。  
加载中若编辑，结束后应保持 dirty（●）且内容不丢。

---

## 5. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 首建：GFM 主因、setext 去重 |
| 2026-07-13 | table 钉死；progressive C 落地 |
| 2026-07-13 | RD-1.3：首块 64k、openProgress、加载中编辑 dirty 修复；全量 2s 改挂 RD-1.4 |
| 2026-07-13 | RD-1.4a：默认 **不全量预取**；首块 48k + 滚动近底再装下一块；find 改 fixed 浮层 |
| 2026-07-13 | RD-1.4：banner + 加载剩余 + 首次 toast；全量 ≤2s 改挂 **RD-1.4b** 可选算法 |

**Decision End · 0003**

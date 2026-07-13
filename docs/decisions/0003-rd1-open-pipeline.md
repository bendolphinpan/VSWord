# Decision 0003 · RD-1 大文档 open pipeline（阶段结论）

- **日期**：2026-07-13  
- **状态**：In progress（RD-1.1 基线拆解 + 第一刀落地）  
- **关联**：`004-remediation-and-debt-plan.md` RD-1 · 历史 `phase-3.9-perf.md`

---

## 1. 测量结论（1MB mixed fixture）

本机 Node 24 · `.tmp/milkdown-prod-builder` remark 栈：

| 路径 | 约耗时 |
|------|--------|
| remark-parse only | ~0.4–0.5 s |
| + frontmatter / + math | 同量级 |
| **+ remark-gfm** | **~12–20 s** |
| parse + gfm + front + math（bench 同款） | ~11–13 s P95 量级 |

**结论**：**remark-gfm（micromark GFM 扩展，尤其表格等）是 open 的主瓶颈**，不是 `buildSessionFromMdast` 本身。  
5MB 超线性变慢与 GFM 在大输入上的行为一致。

历史报告写「remark-parse + buildSession O(N²)」方向正确，**根因应钉在 GFM 层**。

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

## 3. 未采纳 / 下一阶段选项

| 方案 | 预期 | 风险 | 状态 |
|------|------|------|------|
| A. 大文档关闭 GFM | 1MB 可到 ~1s | 表格/删除线语义变 | 否（破坏 Typora 对等） |
| B. Worker 中 GFM parse | 主线程不卡，总 CPU 仍 ~12s | 首交互仍慢；Milkdown 接 AST 难 | 待评 |
| C. 分块 progressive open | 先编前 N 屏 | 跨块表格/roundtrip 复杂 | **首选下一刀设计** |
| D. 换/裁剪 micromark-gfm 扩展 | 可能数量级下降 | 需兼容矩阵 | spike |

**RD-1-lite 目标**（仍有效）：1MB open P95 ≤ 2s。  
当前判断：**必须 C 或 D**，仅 A 不可接受。

---

## 4. 验收与命令

```bash
# setext 扫描单测
cd code-oss && node test/unit/node/index.js --run src/vs/workbench/contrib/vsword/test/node/setextScan.test.ts

# 历史 open bench（仍含 GFM，预期仍 breach，作回归锚点）
node code-oss/test/scripts/perf-3.9.1-bench.mjs --fixture 1mb --runs 3 --skip-type
```

---

## 5. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 首建：GFM 主因、setext 去重 parse 落地、C/D 为后续 |

**Decision End · 0003**

# Phase 3.9 · Perf Baseline

> 🔴 **THRESHOLD BREACH** — 以下项目超 PRD §4.2 阈值：
> - 1mb-mixed.md / open: p95=11909.23ms（阈值 2000ms · 6.0×）
> - 5mb-mixed.md / open: p95=466051.08ms（阈值 2000ms · 233.0×）
>
> **超标性质判定**（PRD §7）：非 low-hanging fruit —— open 阶段瓶颈在 remark-parse + buildSessionFromMdast
> 的字符串扫描 + 树构造，5MB 冷启 ~7 分钟已经是 O(N²) 级别，无法用 <200 LOC 修复。
> 处理路径：本卡在 kanban_comment 中记录基线数据，并提议 v2 优化立项（分块 parse / 增量 hydration /
> web worker 卸载三选一），不阻塞 3.9.2 IME / 3.9.3 内存 bundle 等子卡。


- **生成时间**：2026-07-08T15:56:54.355Z
- **commit**：7fedc7a6
- **JSONL 源**：`code-oss/test/reports/perf-3.9.1.jsonl`
- **度量口径**：PRD phase-3.9-perf-ime.md §4.2（open = readFile → remark-parse → session build；type = 200 keystrokes × ProseMirror tr.apply）

## 表 1 · Open 阶段（1MB / 5MB · P50/P95/max）

| fixture | bytes | runs | p50 | p95 | max | 阈值判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1mb-mixed.md | 1000356 | 5 | 10951.01 ms | 11909.23 ms | 11909.23 ms | 🔴 > 2000ms (6.0×) |
| 5mb-mixed.md | 5000293 | 5 | 422993.69 ms | 466051.08 ms | 466051.08 ms | 🔴 > 2000ms (233.0×) |

## 表 2 · Type 阶段（200 keystrokes/run · P50/P95/max）

| fixture | keystrokes | runs | p50 | p95 | max | 阈值判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1mb-mixed.md | 1000 | 5 | 0.00 ms | 0.01 ms | 0.01 ms | ✓ ≤ 50ms |
| 5mb-mixed.md | 1000 | 5 | 0.01 ms | 0.02 ms | 0.02 ms | ✓ ≤ 50ms |

## 表 3 · 手动 stopwatch sanity cross-check（3 次目测均值）

> 由 dev 在开发机跑「独立 node 进程冷启动」3 次单 sample bench，等价手动秒表
> （PRD "手动 sanity" 目的是校对 bench 内嵌 samples[0] 冷启数字是否稳定）。
> 对齐口径：与 bench samples[0]（唯一未 warm 的 run）偏差 < 30% 视为对齐。

| fixture | 目测 1 | 目测 2 | 目测 3 | 目测均值 | bench 冷启 (samples[0]) | 偏差 |
| --- | --- | --- | --- | --- | --- | --- |
| 1mb-mixed.md | 6276 ms | 6408 ms | 6687 ms | 6457 ms | 6316.96 ms | 2.2% ✓ 对齐 |
| 5mb-mixed.md | 446475 ms | 424470 ms | 415125 ms | 428690 ms | 403612.55 ms | 6.2% ✓ 对齐 |

## 阈值判定汇总

**结果**：🔴 2 项 breach，走 PRD §7 处理路径（不阻断 3.9.2/3.9.3 等子卡）。


---

*此报告由 `code-oss/test/scripts/perf-3.9.1-report.mjs` 生成。重跑 bench 后再跑本脚本会覆盖此文件。*

# RD-3 · Electron renderer RSS 手测表

> 自动探针只覆盖 **Node 侧**（`rd-3-rss-probe.mjs`）。  
> 本表补齐 **真实 Chromium renderer** 数字，供与 Phase 2 定性对照。

| 项 | 值 |
|----|-----|
| 日期 | YYYY-MM-DD |
| commit / 构建 | |
| OS | Windows / … |
| 采集工具 | 任务管理器 / Process Explorer / … |
| 进程名 | 如 `Code - OSS Helper (Renderer)` |

## 数值

| 指标 | 数值 (MiB) | 备注 |
|------|------------|------|
| Idle RSS（空 .md，稳定 30s） | | |
| 打开 1mb-mixed 峰值 RSS（5s 内） | | |
| 关闭大文档后 RSS | | 可选：是否回落 |

## 判定（PRD）

- **不**因数字差单独开优化，除非显著泄漏（关文档后 RSS 几乎不回落）  
- 优化优先并入 RD-1 / RD-8  

## 关联

- 自动探针输出：`code-oss/test/reports/rd-3-rss-probe.json`  
- 复盘主表：`code-oss/test/reports/phase-3.9.3-comparison.md`  

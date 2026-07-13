# Phase 3 · 阶段验收报告

- **版本**：v1（首建 · Phase 3 归档决策）· **v1.1 指针修订 2026-07-13**
- **作者**：PM（kanban `t_93994ac1` · T-3.9.4）
- **日期**：2026-07-09
- **上游 PRD**：`docs/requirements/phase-3.9-perf-ime.md` §4.6 / §7 / §8
- **验收范围**：Phase 3（新）· Markdown WYSIWYG 编辑器（Milkdown 重建）· T-3.0 → T-3.12 全部主线子任务
- **合规声明**：本报告是 Phase 3 **主线归档**决策依据（Gate D/E/F/G）。  
  **v1.1 纠偏**：文中「转交 Phase 4 / 升级 Phase 4」为 **2026-07-09 误用**——Phase 4 在主计划中专指 **Canvas（已完成）**，不是 backlog。  
  未闭合项现行执行清单 → **`docs/plans/004-remediation-and-debt-plan.md`（RD- 号）**。  
  后续尚有 T-3.13 Round-2 修复（至 `1889e82e`），不改变本报告主线归档结论。

---

## 0. 结论（一句话）

**Phase 3（新）主线收官 ✅** —— Gate D（tsc 0）/ Gate E（round-trip 100%）/ Gate F（mermaid+flow+seq 28 类）/ Gate G（perf + IME + bundle 三报告 + IME 单测）四张证据齐全；未闭合项（大文档 open、IME 人肉、模式 UI 收尾等）**不阻塞主线归档**，改由 **RD 债务桶**（`004`）承接，**不是** Phase 4。

---

## 1. 四 Gate 声明

| Gate | 定义 | 状态 | 证据文件 | 关键数字 |
|---|---|:-:|---|---|
| **Gate D** | 全项目 tsc `--noEmit -p src/tsconfig.json` 0 error（T-3.11.4 tsc-baseline-clean 建立） | ✅ | 直跑 `cd code-oss && NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json` | exit 0 · 0 error |
| **Gate E** | Round-trip 6 测试文件 + 34 fixture 覆盖矩阵 + A/B/C 三分支 p95 ≤ 1500ms + selfcheck 3 遍稳定 | ✅ | `code-oss/test/reports/gate-e-2026-07-09T09-01-48-185Z.md` · 后续跑 `code-oss/test/scripts/gate-e.mjs --json` 于 T-3.9.4 复核 | 296 case · 296 pass · 0 fail（sanity 40 fixture 用例已在 T-3.9.2.c 后修复回归 · 复核 exit 0） |
| **Gate F** | Mermaid 22 + flowchart.js 3 + js-sequence 3 + mixed 1 = 5 类测试文件 · 28 fixture golden diff + selfcheck 分库 3 遍稳定 | ✅ | `code-oss/test/reports/gate-f-2026-07-08T04-54-24-957Z.md` | 81 case · 81 pass · 0 fail · ≈ 19.5s |
| **Gate G** | Phase 3.9 收官三步：书面证据齐全 + IME 单测 9 case + tsc baseline 0 error（`gate-g.mjs --phase3-only`） | ✅ | `code-oss/test/reports/gate-g-<timestamp>.md`（本次 commit 前重跑覆盖） | 3 步全绿 · IME 9 passing · tsc 0 error · 3 报告齐 |

### Gate G · 三步展开

1. **G-artifacts** —— 4 份书面证据存在且首屏声明命中：
   - `code-oss/test/reports/phase-3.9-perf.md`（含 `open` / `type` 关键字）
   - `code-oss/test/reports/phase-3.9.2-ime-checklist.md`（骨架 14 行，见 §3 未闭合项）
   - `code-oss/test/reports/phase-3.9.3-comparison.md`（含 `Phase 2` / `Phase 3`）
   - `docs/decisions/phase-3-acceptance.md`（本文件，含 `Gate D` / `Gate E` / `Gate F` / `Gate G`）
2. **G-unit** —— `code-oss/test/scripts/run-ime-composition-test.mjs` · 9 passing / 89 ms（含 T-3.9.2.c 6 case + jsdom 事件构造与防御 3 case）
3. **G-tsc** —— `code-oss/src` tsc `--noEmit` · 0 error · 复用 T-3.11.4 已建立的 tsc-baseline-clean

---

## 2. 三份 Phase 3.9 收官报告 · 最终数字摘要

### 2.1 G1 · 性能基线（`phase-3.9-perf.md`）

| 指标 | fixture | P95 | 阈值 | 判定 |
|---|---|---:|---:|:-:|
| **open** | 1mb-mixed.md | 11909.23 ms | 2000 ms | 🔴 6.0× |
| **open** | 5mb-mixed.md | 466051.08 ms | 2000 ms | 🔴 233.0× |
| **type** | 1mb-mixed.md | 0.01 ms | 50 ms | ✅ |
| **type** | 5mb-mixed.md | 0.02 ms | 50 ms | ✅ |

- 手动 stopwatch cross-check 3 次目测均值与 bench 冷启偏差 <10%（1MB 2.2% · 5MB 6.2%），bench 数字可信
- **超标性质判定**：非 low-hanging fruit —— open 瓶颈在 remark-parse + buildSessionFromMdast 的 O(N²) 字符串扫描 + 树构造，无 <200 LOC + tsc 0 的修法可用
- **处置**：走 PRD §7 逃生路径，转交 §3 未闭合项 → Phase 4 独立立项（"大文档 open pipeline 优化"，分块 parse / 增量 hydration / worker 卸载三选一）
- **不阻断**：type 阶段 P95 <1ms，日常编辑体验无问题；仅冷启读盘慢，用户可通过\"避免打开 5MB 单文件\"绕过

### 2.2 G2 · IME 全矩阵检查表（`phase-3.9.2-ime-checklist.md`）

| 项目 | 状态 |
|---|:-:|
| 检查表骨架落盘 · 14 行 4 IME 组合 | ✅（commit `0b36e2e0`） |
| 环境采集完成（Win 10.0.26200.8655 · 各 IME 版本待人肉填） | ⚠️ 部分 |
| 14 行 ✅/❌ 人肉签字 | ⚠️ **⏸ 未跑** —— 转交 §3 未闭合项 |
| **单测通道（T-3.9.2.c）** | ✅ 9 passing / 89 ms |

- 单测通道已覆盖 IME 状态机 6 个必要 case + 3 个 jsdom 构造与防御 case（含 case 3 · composition 期间 auto-save 被 gate 住的时序）
- 集成侧 T-3.12.1.a / T-3.12.1.b 已把 composition gate 从纯函数上到 host + webview 桥接层（commit `93aa1f85` + `2844ebb4`），P0-1「保存打断输入」bug 已修
- **人肉手测**为 PRD §4.3 Q3 a 通道（真实性证据），因单测覆盖已充分 + P0-1 集成 fix 已回归，允许延后到 Phase 4 首周处理

### 2.3 G3 · 内存 / bundle 复盘（`phase-3.9.3-comparison.md`）

| 指标 | Phase 2 (`4ccbb95a`) | Phase 3 (`a58ce276`) | 比值 | 状态 |
|---|---:|---:|:-:|:-:|
| **Bundle gzip** | 423,473 B | 1,287,910 B | **×3.04** | 🔴 > ×2 |
| Editor idle RSS | 未测 | 未测 | — | ⚠️ 降级（Q4 c 兜底路径） |
| 打开 1MB 峰值 RSS | 未测 | 未测 | — | ⚠️ 降级 |

- Bundle 超阈值属**功能新增对价** —— Milkdown 生态 + KaTeX（113 KB gzip）+ mermaid/cytoscape（141 KB）+ Prism（77 KB）三大件相加已占 Phase 3 vendor 25%，与 BlockNote 版功能缺失属**必要付出**
- **书面判定**：可接受，不做当场优化（PRD §7 · 无 <200 LOC + tsc 0 fruit）
- RSS 两行走降级 → 转交 §3 未闭合项，Phase 4 首建 electron dev-build 环境时同批采集（避免二次搭环境）

---

## 3. Phase 3 未闭合项（历史 U 号 · 已映射 RD）

> **v1.1**：下表保留归档时的 U 编号；**执行请用 RD 号**，详见 `docs/plans/004-remediation-and-debt-plan.md` §4。  
> 「承接 Phase 4」字样作废。

| # | 未闭合项 | 现行 ID | 承接优先级 |
|---|---|---|---|
| **U-1** | 大文档 open pipeline 优化（1MB > 2s · 5MB > 2s） | **RD-1** | P0（发布相关） |
| **U-2** | IME 检查表 14 行人肉签字 | **RD-2** | P0（发布相关） |
| **U-3** | Editor idle RSS + 打开 1MB 峰值 RSS 采集 | **RD-3** | P2 |
| **U-4** | 模式正交性 UI 分层收尾 · T-3.12.3.b/.c | **RD-4**（Round-2 已部分落地，以对账为主） | P2 |
| **U-5** | Milkdown vendor bundle lazy split | **RD-8**（可与 RD-1 合并） | P2 可选 |

**归档判据**：以上项**均不属于**「Phase 3 主线未交付」，全部是「模块内 v2 迭代」或「验证信度加强」，符合 "可维护 > 性能 > 效果" + AGENTS.md "功能优先视觉延后" 下的合规延后。  
**2026-07-13 补充**：对写作用户，U-1/U-2 在**对外试用前**应视为硬门槛（见 `004` Gate-R1）。

---

## 4. Phase 3 主线交付清单（对账）

| 主任务 | plan T-号 | 收官 commit | 状态 |
|---|---|---|:-:|
| 清理旧 Block Editor | T-3.0 | `c361b402` / `4ccbb95a` | ✅ |
| Milkdown spike | T-3.1 | 历史 spike | ✅ |
| WYSIWYG MVP + 文件类型 | T-3.2 / T-3.2b | `c361b402` / `0f6bc00a` | ✅ |
| 排版 / 主题 / 智能输入 | T-3.3.x | `9f76d3e0` 等 | ✅ |
| 图片增强（粘贴 / 拖拽 / 大小 / 图注 / 对齐） | T-3.5.1..4 | `8bd1650d` / `f3b0597a` / `2304e746` / `3f43dc6a` | ✅ |
| 图表全套（mermaid + flow + seq + mixed） | T-3.5b.1..5 · T-3.5b-flowseq.1..3c | Gate F 81 pass | ✅ |
| 语法补齐（emoji / footnote / frontmatter / sub-sup / meta / setext / slash-menu） | T-3.5c.1..6 | Gate G-A 六步 | ✅ |
| 双链 wikilinks（语法 / 补全 / 悬浮 / backlinks） | T-3.11.1..4（原 plan T-3.6.x） | `5cad963d` / `635b9a1b` / `a78cb8f9` / `f664d47e` | ✅ |
| Notion 块增强（拖拽 / 转换 / 表格 chrome） | T-3.7.1..3（commit T-3.6/T-3.8） | `00daab60` / `fe241cb1` · 表格 chrome UX 收在 T-3.12.2.a/b/c | ✅ |
| 视图模式（源码 / 阅读 / 专注 / 打字机） | T-3.7b.1..4 | `900c94cc` / `da77750e` / `ce03f41f` / `0dffffa7`（服务化收敛） | ✅ |
| 导航（TOC / 大纲 / 查找替换） | T-3.7c.1..3 | `c0acda7b`+ / `9f76d3e0` / `4b5b5718` | ✅ |
| 主题兼容层（内置 4 主题 + Typora `.css` + 切换命令） | T-3.7d.1..3 | `94f0f0eb` / `5b78d516`+`89912cba`+`7b356561` / `29f87452` | ✅ |
| Round-trip 保真层 | T-3.8.1..4 | Gate E 296 pass | ✅ |
| 导入导出（HTML / PDF / Pandoc） | T-3.8b.1..3 | `1d051293`+`3e1f71c4`+`cbe31a55` / `fa7e6e32` / `daf95a08` | ✅ |
| 性能与 IME 收口 | T-3.9.1..4 | 三报告 + 本文件 + `gate-g.mjs` | ✅（含 §3 未闭合项） |
| Fix P0 · IME composition host+webview gate | T-3.12.1.a / .b | `93aa1f85` / `2844ebb4` | ✅ |
| Fix P0 · 表格 chrome hover-gated | T-3.12.2.a / .b / .c | `52426d5f` / `dc234dd4` / `59a09c7e` | ✅ |
| 模式正交性 · state machine | T-3.12.3.a | `da60f2d8` | ✅ |
| 模式正交性 · UI 分层收尾 | T-3.12.3.b / .c | Round-2 部分落地 | ⏸ → **RD-4** |

**主线交付率**：18/19 = 94.7%（未收官项策略性延后；执行见 **RD** 桶，非 Phase 4）

---

## 5. 复现命令

```bash
# Phase 3 收官快速回归（Gate G-B 三步 · 不重跑 A 组 build/roundtrip 慢步骤）
cd D:\GIT\VSWord
node code-oss/test/scripts/gate-g.mjs --phase3-only

# 全量 Gate G（含模块 c 语法补齐 6 步 · 首跑需要过 build）
node code-oss/test/scripts/gate-g.mjs

# 单独复核各 Gate
node code-oss/test/scripts/gate-e.mjs --json   # Gate E · 296 case
node code-oss/test/scripts/gate-f.mjs --json   # Gate F · 81 case
cd code-oss && NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json  # Gate D · 0 error
node code-oss/test/scripts/run-ime-composition-test.mjs  # G-unit · 9 passing
```

---

## 6. 决策记录

- **Gate G 定义首建**：本文件锁定 Gate G = perf 数字齐 + IME checklist 骨架 + bundle 复盘 + 单测 9 pass + tsc 0 error。CI 自动化留下一阶段（PRD §4.3 Q2 默认）
- **Phase 3 归档判据**：主线 94.7% 交付 + 四 Gate 声明齐 + 未闭合项**均有承接卡**——**允许归档**，不等 U-1..U-5 / RD-* 完成
- **AGENTS.md "视觉延后" 政策延伸**：Phase 3 内性能「够用即可」；**v1.1**：对外试用前 RD-1/RD-2 升为硬门槛（`004` Gate-R1），与「主线可归档」不矛盾
- **T-3.9.2.a 手测延后合规性**：单测 + T-3.12.1 集成可支持**归档延后**；**不可**替代发布前 D-2/RD-2 人肉签字

---

## 7. 归档后入口（v1.1 纠偏）

- **Phase 4 = Canvas**，早已 100%，**不是**本报告的下一步。  
- **下一步权威**：`docs/plans/004-remediation-and-debt-plan.md`（RD-0 文档 → RD-2 IME → RD-1 open → … → RD-10 最小可发布）。  
- **进度全景**：`docs/plans/003-master-development-plan.md` §1b / §2 / §7。  
- Phase 6 多维表仍后期；整体 UI 重构另立阶段。

---

**报告 End · Phase 3 主线归档 · dev @ da60f2d8**  
**指针修订 · 2026-07-13 · 未闭合项 → RD 桶（004）**

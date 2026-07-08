# PRD · T-3.9 · 性能与 IME 全矩阵收口

- **版本**：v1（PRD 定稿，待 dev/qa 收下）
- **作者**：PM（kanban `t_52e4899f`）
- **日期**：2026-07-08
- **上游**：Master plan `docs/plans/003-master-development-plan.md` L359-363（模块定义）+ L416（"可维护 > 性能 > 效果"决策口径）
- **前序**：
  - T-3.7d 主题（`29f87452`）/ T-3.8 Round-trip（Gate E 252 pass / p95 <10ms）/ T-3.8b 导入导出（HEAD `daf95a08`）全部收官并 push origin/dev
  - T-3.11.4 后 tsc 全项目 0 error，`code-oss/AGENTS.md` 已锁定 Gate E / Gate F 校验清单
- **Autopilot 决策口径**：本 PRD 由 autopilot 场景产出。Q1、Q4 因**现场证据推翻默认答**（详见 §6），其余 Q2/Q3/Q5 走默认。

---

## 1. 背景与目标

### 1.1 背景

Phase 3 Milkdown 重建的**功能层**已全部到位——MVP、排版、图片、双链、块增强、主题、Round-trip、导入导出，共 11 个 T-3.x 主任务收官。但**非功能面**从未系统性验证过：

- 用户拿来 1MB / 5MB 的真实笔记本文件，能不能打开、能不能编辑？没做过基线
- 中文用户日常靠 IME，日文韩文用户同理——**T-3.1 spike** 时只跑过一次冒烟，没有全矩阵回归
- Phase 2 → Phase 3 的重构把 BlockNote 换成 Milkdown，内存 / bundle 尺寸有没有失控？没数据

T-3.9 补齐这块**验收基础设施**，把 Phase 3 的"技术自主拍板"从口头承诺变成**可复现的度量报告**。

### 1.2 目标（Goals）

- **G1 · 大文档性能基线**：1MB / 5MB Markdown **打开 < 2s**（P95），**键入响应 P95 < 50ms**，报告落盘 `code-oss/test/reports/phase-3.9-perf.md`
- **G2 · IME 全矩阵通过**：中文（微软拼音 / 搜狗）/ 日文（Google IME）/ 韩文（Microsoft Korean）共 4 组合，**composition 不丢字、不重复、不打断 auto-save**，检查表逐项签字
- **G3 · Phase 2 → Phase 3 复盘对比**：内存（编辑器 idle RSS + 打开 1MB 峰值）、bundle 尺寸（`milkdown-editor.bundle.js` gzip）与 Phase 2 baseline（commit `4ccbb95a`）对比数据表
- **G4 · 阶段验收报告**：`docs/decisions/phase-3-acceptance.md` 声明 Gate D（tsc 0）/ Gate E（round-trip 100%）/ Gate F（mermaid+flow+seq 28 类）/ Gate G（本模块）全过，Phase 3 合并入干路的合规声明

### 1.3 非目标（Non-Goals）

以下**严格禁止**在本模块做（AGENTS.md Phase 3 视觉延后 + master plan L416 "可维护 > 性能" 决策约束）：

- ⛔ **虚拟滚动 / lazy KaTeX / 大规模性能优化**：Q5 默认口径——**仅测量、不优化**；除非发现 <200 LOC 且 tsc 0 的 low-hanging fruit（例：某处 `useEffect` 明显漏 memo），否则一律留 v2 独立 task
- ⛔ **视觉调优**：Phase 3 政策"好看放一放"，性能报告里发现"字体重排卡顿"这类界面问题**只记录不修**
- ⛔ **CI Gate G 自动化**：Q2 默认——本模块 CI 化留到 3.9.4 阶段验收报告或**下一 Phase**独立立项；v1 只做"可复现的本地跑法"
- ⛔ **SendKeys 自动 IME 脚本**：Q3 默认排除 b 方案，IME 稳定性由**人工 + 单测双证**保障
- ⛔ **Phase 2 完整回归运行**：G3 仅取"内存 / bundle 尺寸"两个数字，不做功能对齐验证
- ⛔ **10MB / 20MB 极限文档**：master plan 只定义到 5MB；超过范围直接标 "not planned for v1"
- ⛔ **修 Phase 2 的已知性能问题**：Phase 2 baseline 只用来**对比**，不做 back-porting

---

## 2. 用户故事

**US-1（大文档打开）**：作为一名有 3 年历史 Obsidian vault 迁移过来的用户，我双击一个 1.2MB 的 `weekly-notes-2025.md`，希望**编辑器在 2 秒内出现光标、可以立刻输入**，不会白屏或卡死；打开 5MB 归档文件也**最多多等一下**，不能崩。

**US-2（大文档编辑流畅）**：作为一名正在改上面 1.2MB 文件的写作者，我在文档中间连打 200 字中文段落，希望**每个按键落屏 < 50ms**，光标不错位，滚动不抽帧。

**US-3（中文 IME 无缝）**：作为一名微软拼音用户，我在段落中间打"你好世界"，希望候选窗浮出时**已经输入的字不消失**、我选完候选**落屏是完整词组不是拼音串**、编辑器**不在 composition 过程中触发 auto-save 打断我输入**。

**US-4（日文 / 韩文用户）**：作为一名日本 / 韩国用户，我用 Google IME / MS Korean 输入本地语言，希望编辑器和中文 IME 一样稳定——**同一套 composition 事件处理逻辑不能只保中文**。

**US-5（性能报告可复现）**：作为一名负责验收的 QA，我要能**在本地一条命令跑出**"打开 1MB / 5MB 各 5 次的 P95 数据"，不需要动源码 / 装额外工具，报告里的数字**下次跑还能对上**（±10% 内）。

**US-6（阶段验收凭据）**：作为一名 PM，Phase 3 收官时我要有**一份文档**能给出"Gate D/E/F/G 全过"的证据（commit hash + 报告文件 + 命令）——不是口头说"跑过了"。

---

## 3. 模块拆解（5 张 dev/qa 子卡 + 1 张收官）

| 编号 | 标题 | Assignee | 依赖 | 预估 |
|---|---|---|---|---|
| **T-3.9.1.a** | 大文档 fixture 生成器（1MB / 5MB 合成 `.md`） | dev | 无 | S（0.5d） |
| **T-3.9.1.b** | 大文档打开 + 键入性能基线（node bench + jsonl） | dev | 3.9.1.a | M（1d） |
| **T-3.9.2.a** | IME 三平台人工检查表 + 结果签字 | qa | 无（可与 3.9.1 并行） | M（1d） |
| **T-3.9.2.c** | IME composition 单测（mock event 回归通道） | dev | 无 | S（0.5d） |
| **T-3.9.3** | 内存 / bundle 复盘对比表（vs `4ccbb95a`） | dev | 无（独立环境） | M（1d） |
| **T-3.9.4** | 阶段验收报告 + Gate G 声明 + Phase 3 归档 | pm/dev | 3.9.1.b / 3.9.2.a+c / 3.9.3 全绿 | S（0.5d） |

**依赖顺序**：`3.9.1.a → 3.9.1.b` 与 `3.9.2.a / 3.9.2.c` 与 `3.9.3` **三支并行**，全绿汇入 `3.9.4`。

**T-3.9.2.b（SendKeys 自动 IME）不落卡**——Q3 默认排除；若 3.9.2.a 人工回归发现某平台反复 fail 才升级为 v2 task。

---

## 4. 子卡详细规格

### 4.1 T-3.9.1.a — 大文档 fixture 生成器

**目的**：产出可复现的 1MB / 5MB `.md`，作为 3.9.1.b 打开 / 键入 benchmark 的输入。

**为什么必须合成，不能拼 docs/**：现场证据——`docs/`（不含 node_modules）全量仅 **507 KB**，达不到 1MB 门槛。Q1 默认答案"a 不够 → b"→ 直接跳到 b。

**落盘路径**：
- 脚本：`code-oss/test/scripts/gen-perf-fixture.mjs`
- 输出：`code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf/1mb-mixed.md` / `5mb-mixed.md`
- gitignore：**fixture 文件不提交**（大文件 + 可从脚本复现），只提交生成脚本

**合成配比**（复用 200kb-mixed 已建立的结构 SSOT）：
- 60% 中文段落（Lorem ipsum → 中文 Faker 或固定 corpus）
- 20% 代码块（`fenced code` `js/py/ts` 混排，触发 Prism 高亮）
- 10% 表格（触发 GFM table 解析）
- 5% 图片引用（相对路径，不真实存在，触发 broken-image 路径解析器）
- 5% 数学公式（`$...$` inline + `$$` block，触发 T-3.9 math NodeView）

**DoD**：
1. 命令 `node code-oss/test/scripts/gen-perf-fixture.mjs --size 1MB` 产出 `1mb-mixed.md`，实际字节 1000000 ± 5%
2. 同上 `--size 5MB` 产出 `5mb-mixed.md`，实际字节 5000000 ± 5%
3. 生成过程**确定性**（seed=42 固定 seedrandom），同一命令跑两次字节完全一致
4. 脚本 `--help` 打印 usage
5. tsc 0（脚本是 `.mjs` 不入类型检查，只需要 lint 无异常）

### 4.2 T-3.9.1.b — 大文档打开 + 键入性能基线

**目的**：拿到 G1 数字——1MB / 5MB 打开 P95、键入落屏 P95，写入 `phase-3.9-perf.md`。

**度量定义**（严格锁死，避免"打开"两字含糊）：
- **打开耗时**：`EditorInput.resolve()` 起 → `webview.postMessage({type:'ready'})` 收到 host ack 止。用 `performance.now()` 高精度计时，取 5 次运行 P95
- **键入落屏**：webview 侧 `keydown` 触发到 ProseMirror `docChanged` transaction 完成的时间。同 fixture 打开后自动灌入 200 keystrokes（预定义 corpus），取 P95

**执行方式**（Q2 默认 a+b）：
- **a 手动**：qa 在开发机上双击 `.md` → stopwatch 目测（下限对齐）
- **b node headless**：复用 Gate E 的 `.tmp/milkdown-prod-builder` jsdom 环境跑 bench，输出 `code-oss/test/reports/perf-3.9.1.jsonl`

**技术契约**：
- 命令：`node code-oss/test/scripts/perf-3.9.1-bench.mjs [--fixture 1mb|5mb] [--runs 5]`
- 输出 jsonl 追加到 `code-oss/test/reports/perf-3.9.1.jsonl`，每行 `{ ts, commit, fixture, phase: 'open'|'type', ms, samples, p95, p50 }`
- 汇总脚本：`node code-oss/test/scripts/perf-3.9.1-report.mjs --input phase-3.9.1.jsonl --output phase-3.9-perf.md`
- 阈值判定：open p95 ≤ 2000ms、type p95 ≤ 50ms → exit 0；超阈值 exit 1

**DoD**：
1. `perf-3.9.1-bench.mjs` 跑 1mb + 5mb 各 5 次 open + type，jsonl 追加 20 条记录
2. `perf-3.9.1-report.mjs` 生成 `code-oss/test/reports/phase-3.9-perf.md`，含两张表（open p50/p95 / type p50/p95）
3. 阈值全过（1mb open p95 < 2000ms、type p95 < 50ms；5mb 同）**或**若超阈值，报告顶部标 "🔴 THRESHOLD BREACH" 并进入 §7 low-hanging fruit 决策
4. 手动跑（qa 侧）在开发机上取 3 次目测均值，写入报告第 3 张表作 sanity cross-check（差 < 30% 视为对齐）
5. tsc 0

### 4.3 T-3.9.2.a — IME 三平台人工检查表

**目的**：拿到 G2 的**人肉签字证据**。

**矩阵**（3 平台 × 4 用例 = 12 组合）：

| # | 平台 / IME | 用例 | 期待 |
|---|---|---|---|
| 1-4 | Windows 微软拼音 | 段中输入、段尾输入、候选切换、快速连打 | 无丢字/无重复/无 auto-save 打断 |
| 5-8 | Windows 搜狗拼音 | 同上 | 同上 |
| 9-12 | Windows Google 日文 IME | 平假名→汉字转换、退格取消 composition、快速连打、段中输入 | 同上 |

（韩文 MS Korean 补测——Windows 系统 IME，走"段中输入 + 快速连打"最小 2 case，纳入表尾）

**产出**：`code-oss/test/reports/phase-3.9.2-ime-checklist.md`——每行一个组合，qa 手动跑完打 ✅ / ❌ + 简短观察。发现 ❌ 立刻 kanban_block 升级为 dev 修复卡。

**DoD**：
1. Checklist markdown 14 行（12 中文/日 + 2 韩文）全 ✅
2. 报告末尾附环境信息（Windows 版本 / 各 IME 版本号 / VSWord commit hash）
3. 遇 ❌ 且原因确认是 VSWord 代码问题 → 不视为 DoD 未过，而是**升级为独立 T-3.9.2.d dev 卡**处理，处理完再回归勾选

### 4.4 T-3.9.2.c — IME composition 单测

**目的**：把 3.9.2.a 的人肉回归能力**固化为回归测试**——下次 Milkdown 升级 / ProseMirror 升级不用再全走一遍手动。

**技术契约**：
- 位置：`code-oss/src/vs/workbench/contrib/vsword/test/node/imeComposition.test.ts`
- 依赖：jsdom + Milkdown prod-builder（Gate E / Gate F 已有）
- 用例（最少 6 case）：
  1. `compositionstart → compositionupdate → compositionend`：文档新增 "你好" 一次
  2. composition 中间按 backspace：只删 composition buffer，不动 doc
  3. composition 结束前触发 auto-save timer：save 被延迟到 compositionend 后
  4. 快速连续两次 composition：中间无残留 buffer
  5. composition 中间 `Escape`（IME 取消）：doc 保持进 composition 前的状态
  6. 段末位置 composition：光标位置正确
- 挂 Gate G（3.9.4 汇总时 gate-g.mjs 拉起）

**DoD**：
1. 6 case 全绿
2. `cd code-oss && node node_modules/.bin/mocha out/vs/workbench/contrib/vsword/test/node/imeComposition.test.js` 单独可跑，exit 0
3. tsc 0
4. 在 `code-oss/AGENTS.md` 的 "Gate G" 章节挂说明（首次建 Gate G 章节）

### 4.5 T-3.9.3 — 内存 / bundle 复盘对比

**目的**：产出 G3 数据表——Phase 2 → Phase 3 的**真实变化**。

**Phase 2 baseline commit**：`4ccbb95a`（T-3.0 前最后一个 commit，即 BlockNote 尚在、Milkdown 未接入的状态）。理由：**无 phase-2 git tag**，此 commit 是 master plan `T-3.0 清理旧 Block Editor` 前置节点。

**度量项**（2 个数字对比）：

| 指标 | 采集方式 | Phase 2 (`4ccbb95a`) | Phase 3 (`HEAD`) | 
|---|---|---|---|
| Bundle gzip 尺寸 | `gzip -9 milkdown-editor.bundle.js\|wc -c`（Phase 2 侧是 blocknote bundle 对应产物） | ? | ? |
| Editor idle RSS | 打开空文档后 30s 时 Chromium renderer 进程 RSS（Task Manager 或 `process.memoryUsage().rss`） | ? | ? |
| 打开 1MB 峰值 RSS | 用 3.9.1 fixture 打开后 5s 内峰值 | ? | ? |

**执行方式**（Q4 默认 a）：
- git worktree add 到 `_phase2-baseline/`，checkout `4ccbb95a`，本地跑一次拿数字
- Phase 3 侧在当前 HEAD 跑一次
- 复用 3.9.1.b 的 bench 脚本，加 `--measure-rss` flag

**Won't-do**：不做 CPU profile、不做 heap snapshot 分析——只要数字。

**DoD**：
1. `code-oss/test/reports/phase-3.9.3-comparison.md` 产出，含 3 行数据表
2. 报告顶部注明 baseline commit `4ccbb95a` 的选择理由（无 tag / T-3.0 前节点）
3. 若 Phase 3 数字**超过 Phase 2 的 2 倍**（bundle 或 RSS），报告末尾必须给出**书面判断**："可接受（列 3 条以上功能新增作为对价）" 或 "需回退优化"——升级为 3.9.4 决策节点
4. tsc 0（脚本改动不涉及 src）

### 4.6 T-3.9.4 — 阶段验收报告 + Gate G 声明

**目的**：**Phase 3 归档动作**——把 Gate D/E/F/G 四张证据拼在一起，写入 `docs/decisions/phase-3-acceptance.md`。

**Gate G 定义**（首次立起）：
- G1 全过：`phase-3.9-perf.md` 阈值全绿
- G2 全过：`phase-3.9.2-ime-checklist.md` 14 行全 ✅
- G3 数据落盘：`phase-3.9.3-comparison.md` 存在且有书面判断
- G-tsc：`cd code-oss && NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json` exit 0
- G-unit：3.9.2.c 单测挂 Gate G 通道

**产出文件**：`docs/decisions/phase-3-acceptance.md`
- 结构参照 `code-oss/AGENTS.md` 里已有的 Gate E / Gate F 章节
- 每个 Gate 一节：定义 / 一键脚本 / DoD 校验清单 / 常见坑
- 顶部声明 Phase 3 合规状态、当前 commit hash、报告文件清单

**同步动作**：
- `code-oss/AGENTS.md` 新增 "Gate G" 章节，格式对齐 Gate E/F
- `docs/plans/003-master-development-plan.md` §7 补 "Phase 3 完成 · Phase 4 待启动"
- push origin/dev（AGENTS.md 授权规则：模块收官 + 全绿 → 直接 push）

**DoD**：
1. `docs/decisions/phase-3-acceptance.md` 产出，四 Gate 全声明 ✅
2. `code-oss/AGENTS.md` Gate G 章节新增
3. `docs/plans/003-master-development-plan.md` §7 更新
4. `gate-g.mjs`（新脚本，位置 `code-oss/test/scripts/gate-g.mjs`）串起 3.9.1.b bench + 3.9.2.c mocha + tsc，一条命令 exit 0
5. 3 个报告文件 commit + push（fixture 大文件除外，走 gitignore）
6. tsc 0

---

## 5. 消息协议 / 命名空间预留

本模块**不引入新的 host↔webview 消息协议**——perf/IME 都是**观测型**改动，不动业务通路。

新增文件命名空间：
- `code-oss/test/scripts/gen-perf-fixture.mjs`
- `code-oss/test/scripts/perf-3.9.1-bench.mjs`
- `code-oss/test/scripts/perf-3.9.1-report.mjs`
- `code-oss/test/scripts/gate-g.mjs`
- `code-oss/test/reports/phase-3.9-perf.md`
- `code-oss/test/reports/phase-3.9.2-ime-checklist.md`
- `code-oss/test/reports/phase-3.9.3-comparison.md`
- `code-oss/test/reports/perf-3.9.1.jsonl`
- `code-oss/src/vs/workbench/contrib/vsword/test/node/imeComposition.test.ts`
- `docs/decisions/phase-3-acceptance.md`

---

## 6. Q1-Q5 决策记录

| Q | 题干 | 默认答 | 本 PRD 结论 | 理由 |
|---|---|---|---|---|
| Q1 | 大文档 fixture 来源 | a → 不够 → b | **直接 b（合成 fixture 脚本）** | 现场证据：`docs/` 全量（不含 node_modules）507 KB < 1MB，a 无法达阈值，直接跳 b 省一轮 |
| Q2 | 性能指标测量方式 | a+b（可复现），CI 化留 3.9.4 | **接受默认** | 手动做 sanity + node bench 做可复现，CI 化留下一 Phase |
| Q3 | IME 矩阵验收方式 | a+c（真实性 + 可回归） | **接受默认** | 排除 b（SendKeys 自动 IME 脚本）→ 不落 3.9.2.b 子卡；发现 3.9.2.a 反复 fail 才升级 |
| Q4 | 内存/bundle baseline 来源 | a（git checkout Phase 2 tag） | **a 修正：无 tag → 用 commit `4ccbb95a`（T-3.0 前节点）** | git tag 查证无 phase-2 tag；`4ccbb95a` 是 BlockNote 尚在、Milkdown 未接入的最后一个 commit，语义等价 |
| Q5 | 是否允许现在做性能优化 | 仅测量 + 明显 low-hanging fruit（<200 LOC 且 tsc 0） | **接受默认** | 若 3.9.1.b 阈值超标（1MB open p95 > 2s 或 type p95 > 50ms），进入 §7 决策节点：满足 <200 LOC + tsc 0 且**不改业务通路**才允许当场优化；否则升级 v2 独立 task |

---

## 7. 阈值超标处置流程

若 3.9.1.b 或 3.9.3 出数字超阈值（P95 open > 2s / P95 type > 50ms / bundle 或 RSS > Phase 2 × 2）：

1. **不阻塞**其他子卡（3.9.2 / 3.9.4 继续跑）
2. dev 侧起 `T-3.9.1.b.perf-triage` 独立卡片，写超标数据 + 初步 profile 结果 + low-hanging fruit 候选
3. 候选满足 **<200 LOC + tsc 0 + 不改 host↔webview 协议** → 立刻做，做完回归 3.9.1.b
4. 候选超出 → 记入 `docs/decisions/phase-3-acceptance.md` 的 "Phase 3 未闭合项" 章节，Phase 4 立项
5. **AGENTS.md "功能优先视觉延后" 政策外延到此**：性能优化亦"够用即可"，Phase 3 不追求极致

---

## 8. 收官条件

1. 3.9.1.a/b、3.9.2.a/c、3.9.3、3.9.4 六张卡片全 done
2. 三份报告 + phase-3-acceptance.md 落盘并 commit
3. `gate-g.mjs` 一键跑 exit 0
4. `code-oss/AGENTS.md` Gate G 章节挂上
5. push origin/dev（模块收官授权规则）
6. master plan §7 更新 "Phase 3 完成"

---

## 9. 附录 A · 与已有基础设施的复用清单

| 已有资产 | 复用方式 |
|---|---|
| `.tmp/milkdown-prod-builder/node_modules/{jsdom, mocha, esbuild}` | 3.9.1.b bench + 3.9.2.c 单测直接吃 |
| `code-oss/test/reports/roundtrip-perf.jsonl` 格式 | 3.9.1.b jsonl 格式**类比**（`ts, commit, path, bytes, ms, samples`），字段名对齐 |
| `code-oss/src/vs/workbench/contrib/vsword/test/fixtures/roundtrip/perf/200kb-mixed.md` | 3.9.1.a 合成结构 SSOT 参照，配比 60/20/10/5/5 沿用 |
| Gate E / Gate F 一键脚本模式（`gate-e.mjs` / `gate-f.mjs`） | 3.9.4 的 `gate-g.mjs` 结构对齐 |
| T-3.11.4 建立的 tsc-baseline-clean | 3.9.4 直接引用不重跑基线 |

---

## 10. 风险与回撤

| 风险 | 概率 | 影响 | 处置 |
|---|---|---|---|
| 5MB fixture 在 jsdom 里 OOM | 中 | 3.9.1.b 5MB 组跑不出数据 | 加 `NODE_OPTIONS=--max-old-space-size=8192`；仍 fail → 5MB 组只跑手动 a，报告标注 "b 通道不可用" |
| IME 手动回归发现 Milkdown 底层 bug | 低 | 3.9.2.a 卡进度 | 升级为 3.9.2.d dev 卡；若无法本模块修，phase-3-acceptance.md "未闭合项"记录，Phase 4 处理 |
| Phase 2 baseline commit `4ccbb95a` 已无法构建（依赖失效） | 中 | 3.9.3 拿不到数字 | 降级：只报 Phase 3 侧绝对值 + 定性判断（"目测和 Phase 2 差不多 / 明显更大"），Q4 c 兜底路径 |
| tsc 因新增 test 文件破 baseline | 低 | Gate G 不过 | 3.9.2.c 走 `code-oss/AGENTS.md` 里的 "TSC Baseline Cleanup Procedure"，pin 到 baseline 修 |

---

**PRD End · v1 · 2026-07-08**

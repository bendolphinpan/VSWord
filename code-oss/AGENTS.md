# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

---

## VSWord Milkdown Editor — Round-trip Gate E

Task **T-3.8.4** locks the round-trip pipeline collection introduced in T-3.8.1 → T-3.8.3 behind a single CI gate. Any change that touches
`src/vs/workbench/contrib/vsword/browser/milkdownEditor/roundtrip/**` or the six round-trip test files MUST pass Gate E before merge.

### 一键脚本

从仓库根目录跑：

```
node code-oss/test/scripts/gate-e.mjs             # 6 个测试文件 + fixture 矩阵 → md 报告
node code-oss/test/scripts/gate-e.mjs --json      # 追加 JSON 摘要到 stdout (CI 消费)
node code-oss/test/scripts/roundtrip-perf-baseline.mjs   # tail 20 条 perf jsonl，判 p95 阈值
node code-oss/test/scripts/roundtrip-selfcheck.mjs       # 30 fixture × 3 遍 pickSavePath 稳定性
```

任意脚本 exit != 0 就代表 Gate E 未通过。

### 覆盖范围

Gate E 只跑这 6 个文件（不是全量 vsword 单测）：

- `test/node/milkdownRoundtrip.test.ts`（143 case，含 AC-1…AC-8 决策矩阵、Qqa3 三分支 perf）
- `test/node/protocolRoundtrip.test.ts`（11 case，webview↔host 消息形状）
- `test/node/roundtripSerializer.test.ts`（20 case，pickSavePath + assembleIncremental 纯函数）
- `test/node/roundtripSession.test.ts`（44 case，coverage / isSafe / BOM / newline）
- `test/node/roundtripTracker.test.ts`（20 case，parser hook + tracker plugin）
- `test/node/milkdownWorkingCopy.test.ts`（16 case，working-copy save 三分支路径）

基线：**252 通过 / 0 失败 / ≈ 600 ms** on `dev@HEAD`。

### Perf JSONL 格式（`code-oss/test/reports/roundtrip-perf.jsonl`）

每次跑 milkdownRoundtrip 会追加两类记录：

- 老格式（保留兼容）：`{ ts, fixture, bytes, ms, samples }`  ← session build p95
- 新格式（T-3.8.4）：`{ ts, commit, path, branch: 'A'|'B'|'C', bytes, ms, samples }`  ← 一整轮 open→save→reopen

阈值：单分支 p95 ≤ **1500 ms**（后续 T-3.8.4.x 会按实际 baseline 收窄）。当前实测三分支 p95 都在个位数 ms。

### DoD 校验清单

| # | 项 | 校验方式 |
|---|---|---|
| 1 | 6 个测试文件全绿 | `gate-e.mjs` → `code-oss/test/reports/gate-e-*.md`，exit 0 |
| 2 | 30 fixture 覆盖矩阵产出 | 同上，报告里 fixture 矩阵每类 pass > 0 |
| 3 | perf JSONL 含 A/B/C 三分支记录 | `tail code-oss/test/reports/roundtrip-perf.jsonl` 看 `branch` 字段 |
| 4 | perf p95 未超阈值 | `roundtrip-perf-baseline.mjs`，exit 0 |
| 5 | 30 fixture × 3 遍 pickSavePath 稳定 | `roundtrip-selfcheck.mjs`，exit 0 |
| 6 | tsc 全项目零 error | `cd code-oss && node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json`（保持 T-3.11.4 已建立的 clean baseline） |

### 常见坑

- `gate-e.mjs` 依赖 `.tmp/milkdown-prod-builder/node_modules/{esbuild,jsdom,mocha}`。首跑前先做过一次 vsword prod build。
- Mocha JSON reporter 通过 `output=<file>` 落盘避免 Windows 上 stdout 混入 esbuild warning。
- 三分支 case 用同一份 200KB fixture，因为要比较**只有分支不同**下的耗时；换 fixture 会引入噪声。
- Perf 阈值 1500ms 是保守值 —— 当前基线 <10ms，任何单次 >100ms 都值得追根因。

---

## VSWord Milkdown Editor — Gate F（mermaid + flow + sequence + mixed）

Task **T-3.5b.5** 首建 mermaid 22 类 golden 通道；**T-3.5b-flowseq.3c** 扩展加入 flowchart.js 3 类
+ js-sequence-diagrams 3 类 + mermaid/flow/sequence 三库联合 1 类，共 **28 fixture / 5 类测试用例
类别**（含 3 个 worker 元测试）。Gate F 是模块 b（mermaid NodeView）+ 模块 b-flowseq（flow/seq
NodeView）联合收官门槛。任何改动 `src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/
{mermaid,flow,sequence}-view*` 或对应测试/worker/normalize 文件必须过 Gate F 再合入。

### 一键脚本

从仓库根目录：

```
node code-oss/test/scripts/gate-f.mjs                # mermaid + flow + seq + mixed → md 报告
node code-oss/test/scripts/gate-f.mjs --json         # 追加 JSON 摘要到 stdout (CI 消费)
node code-oss/test/scripts/mermaid-selfcheck.mjs     # 22 类 × 3 遍 normalized svg 字节完全一致
node code-oss/test/scripts/flow-selfcheck.mjs        # 3 类 flow × 3 遍字节一致
node code-oss/test/scripts/sequence-selfcheck.mjs    # 3 类 sequence × 3 遍字节一致
```

任意脚本 exit != 0 就代表 Gate F 未通过。

### 覆盖范围

Gate F 跑这 5 个文件：

- `test/node/mermaidView.test.ts`（NodeView 纯函数 + jsdom 集成，47 case）
- `test/node/mermaidRoundtrip.test.ts`（22 类 × golden svg diff + 1 元测试 = 23 case）
- `test/node/flowRoundtrip.test.ts`（3 类 P0 × golden svg diff + 1 元测试 = 4 case）
- `test/node/sequenceRoundtrip.test.ts`（3 类 P0 × golden svg diff + 1 元测试 = 4 case）
- `test/node/mixedRoundtrip.test.ts`（三库联合 fixture × 3 段 = 3 case，复用单库 golden）

基线：**81 通过 / 0 失败 / ≈ 11–12 s** on `dev@HEAD`。

### 28 类 fixture SSOT

- `test/fixtures/mermaid/_index.mjs` —— 22 条 `{ id, tier: 'GA'|'beta', src }`
- `test/fixtures/mermaid/<id>.md` / `.expected.svg` —— 22 份 mermaid golden
- `test/fixtures/flow/_index.mjs` —— 3 条 `{ id, tier: 'P0', src }`
- `test/fixtures/flow/<id>.md` / `.golden.svg` —— 3 份 flowchart.js golden
- `test/fixtures/sequence/_index.mjs` —— 3 条 `{ id, tier: 'P0', src }`
- `test/fixtures/sequence/<id>.md` / `.golden.svg` —— 3 份 js-sequence-diagrams golden
- `test/fixtures/mixed/_index.mjs` —— 1 条 `{ id, segments: [{ lang, fixtureId, src }] }`
- `test/fixtures/mixed/<id>.md` —— 三库拼接文档，**不维护自己的 golden**，逐段复用单库 golden

Fixture 由 gate-f、`*Roundtrip.test.ts`、selfcheck、bootstrap 四方共享，不允许在其他地方另抄一份。

### 稳定性保障（selfcheck 拆解）

不同库不稳定源不同，Gate F 通道分库治理：

**Mermaid（同进程 3 遍）** —— 3 类：
1. **`Math.random()`**（dagre / cytoscape layout、gitGraph commit hash）
   → `mermaid-render-worker.mjs` monkey-patch 成 seeded LCG，每次 render 前 `resetRandomSeed()`
2. **`new Date()`**（gantt today line 相对源码固定日期的距离）
   → 用 Proxy 冻结 `Date` 到 `2026-01-01T00:00:00Z`；worker 计时改走 `performance.now()`
3. **mermaid 模块级 counter**（actorN / classId-N / linearGradient-N / architecture id-suffix）
   → 懒加载 diagram 子模块共用单例，`mermaid-svg-normalize.mjs` 用正则抹平

**Flow / Sequence（同进程 3 遍）** —— 1 类：
- **raphael 内部 id + Math.random**（marker id `raphael-marker-<type><序号>-<hash>`）
  → `flow-render-worker.mjs` / `sequence-render-worker.mjs` 相同 seeded LCG，每 fixture render 前
     `resetSeed()`；剩余序号 + hash 由 `flowseq-svg-normalize.mjs` 正则抹平。
- flow/sequence 各起独立 worker：raphael 全局 id counter 跨库共享会污染 selfcheck。

### DoD 校验清单

| # | 项 | 校验方式 |
|---|---|---|
| 1 | 5 个测试文件全绿 | `gate-f.mjs` → `code-oss/test/reports/gate-f-*.md`，exit 0 |
| 2 | 22 + 3 + 3 = 28 类 fixture 矩阵齐 | 报告里 mermaid / flow / sequence / mixed 四个矩阵每行 `.md` + golden 双 ✓ 且 pass > 0 |
| 3 | 22 + 3 + 3 类 × 3 遍字节一致 | `mermaid-selfcheck.mjs` / `flow-selfcheck.mjs` / `sequence-selfcheck.mjs`，exit 0，"3 遍稳定" = 22/22 + 3/3 + 3/3 |
| 4 | tsc 全项目零 error | `cd code-oss && NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json` |

### 常见坑

- `gate-f.mjs` / worker / selfcheck 依赖 `.tmp/milkdown-prod-builder/node_modules/{mermaid,flowchart.js,raphael,underscore,jsdom}`。首跑前先跑 vsword prod build。
- Worker 里 `pretendToBeVisual` 的 requestAnimationFrame shim 会挂 event loop → `main().then(process.exit(0))` 强制退出。
- jsdom 27.3（builder 内版本）需手工挂 `offsetWidth/clientWidth = 0` + `getComputedStyle` 兜底 `0px`，否则 cytoscape GridLayout 会 NPE。
- flow/sequence worker 额外需要 `SVGSVGElement.prototype.createSVGMatrix` / `getScreenCTM` shim —— 否则 raphael renderfix 抛 `e.createSVGMatrix is not a function`。
- mixed 测试**不生成自己的 golden**：跨库 fixture 只是同文档共存场景验证，逐段 render → 引用单库 golden。若单库 golden 失效需先修单库再跑 mixed。
- Golden 更新流程：删除对应 `.golden.svg` / `.expected.svg` → 跑一次 `gate-f.mjs`（测试 auto-write missing golden）→ diff 复查 → commit。**永远不要手改 golden**。
- Windows 上 tsc 全项目 typecheck 默认堆不足 → 加 `NODE_OPTIONS="--max-old-space-size=8192"`。

---

## VSWord Milkdown Editor — Gate G（Phase 3 stage gate）

Task **T-3.9.4** 把 Gate G 从「模块 c 语法补齐收官」升级为 **Phase 3 阶段验收 gate**，与 Gate E / Gate F 并列。任何声明 Phase 3 收官或涉及 `code-oss/test/scripts/gate-g.mjs` / `docs/decisions/phase-3-acceptance.md` / 三份 phase-3.9 报告的改动，必须过 Gate G 再合入。

### 一键脚本

从仓库根目录：

```
node code-oss/test/scripts/gate-g.mjs                # 全量（A 组模块 c 六步 + B 组 Phase 3 收官三步，首跑会重跑 build，慢）
node code-oss/test/scripts/gate-g.mjs --phase3-only  # 只跑 B 组三步（Phase 3 收官快速回归，秒级）
node code-oss/test/scripts/gate-g.mjs --json         # 追加 JSON 摘要到 stdout (CI 消费)
node code-oss/test/scripts/run-ime-composition-test.mjs   # 单跑 G-unit（IME 状态机 9 case · jsdom mocha）
```

任意脚本 exit != 0 就代表 Gate G 未通过。

### Gate G · 两组步骤

**A 组 · 模块 c 语法补齐历史证据**（六步 · 全量模式跑，`--phase3-only` 跳过）：

1. `build-milkdown-editor.cjs` —— webview bundle 构建 + verify.template.mjs 全量断言（覆盖 T-3.5c.1..5 emoji / footnote / frontmatter / sub-sup / code-block meta / setext / slash-menu）
2. `gate-e.mjs` —— Round-trip 6 测试文件 + 34 fixture
3. `gate-f.mjs` —— Mermaid 22 类 golden diff
4. `roundtrip-perf-baseline.mjs` —— A/B/C 三分支 p95 ≤ 1500ms
5. `roundtrip-selfcheck.mjs` —— 34 fixture × 3 遍 pickSavePath 稳定
6. `mermaid-selfcheck.mjs` —— 22 类 × 3 遍 normalized svg 字节一致

**B 组 · Phase 3.9 收官证据**（`--phase3-only` 只跑这三步）：

7. **phase3-artifacts** —— 4 份书面证据存在且首屏声明命中：
   - `code-oss/test/reports/phase-3.9-perf.md`（含 `open` / `type`）
   - `code-oss/test/reports/phase-3.9.2-ime-checklist.md`（骨架 14 行）
   - `code-oss/test/reports/phase-3.9.3-comparison.md`（含 `Phase 2` / `Phase 3`）
   - `docs/decisions/phase-3-acceptance.md`（含 `Gate D` / `Gate E` / `Gate F` / `Gate G`）

   备注：本步骤**不重跑 perf/IME 手测**，只验证书面证据到位。Perf breach 与 bundle 超阈值走 PRD §7 逃生路径 → `phase-3-acceptance.md` "未闭合项" 章节 → Phase 4 承接。
8. **ime-composition** —— `run-ime-composition-test.mjs`（T-3.9.2.c · IME 状态机 9 case · jsdom mocha）
9. **tsc-baseline** —— `code-oss/src` tsc `--noEmit -p src/tsconfig.json` · 0 error（G-tsc · 复用 T-3.11.4 tsc-baseline-clean）

### DoD 校验清单

| # | 项 | 校验方式 |
|---|---|---|
| 1 | Gate G 全量或 `--phase3-only` 一键 exit 0 | `gate-g.mjs` → `code-oss/test/reports/gate-g-*.md` |
| 2 | 4 份 Phase 3.9 书面证据齐 | phase3-artifacts inline 步骤，缺一 exit 1 |
| 3 | IME 单测 9 passing | ime-composition 步骤输出 `9 passing` |
| 4 | tsc 全项目零 error | tsc-baseline 步骤 · errCount === 0 |
| 5 | Phase 3 归档决策落盘 | `docs/decisions/phase-3-acceptance.md` 存在并声明 Gate D/E/F/G |

### 常见坑

- **全量模式首跑慢**：A 组 build 会重跑 esbuild + verify（~30–60s），后续 Gate E/F 一起 3–5 分钟；日常 Phase 3 收官回归用 `--phase3-only`（<10s）
- **A 组依赖 `.tmp/milkdown-prod-builder`**：与 Gate E/F 共享，首跑前须先做过一次 vsword prod build（跑一次 `build-milkdown-editor.cjs` 就位）
- **phase3-artifacts 是 inline 步骤**：不 spawn 子进程，纯文件存在性 + `mustContain` 关键字校验；若报告文件被误删或首屏缺 `Gate D/E/F/G` 声明会立刻 exit 1
- **Perf breach 与 bundle 超阈值不阻断 Gate G**：只要 `phase-3.9-perf.md` / `phase-3.9.3-comparison.md` 文件存在且格式正确，超阈值判定由 `phase-3-acceptance.md` "未闭合项" 章节承接（PRD §7 逃生路径），不再由 gate 脚本判死
- **Windows tsc-baseline 堆不足**：Gate G 已内置 `NODE_OPTIONS="--max-old-space-size=8192"`，无需外部 export


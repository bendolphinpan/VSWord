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

## VSWord Milkdown Editor — Mermaid Gate F

Task **T-3.5b.5** 锁定 22 类 mermaid 图表（15 GA + 7 beta）在 jsdom + 真 mermaid v11 环境下的
"渲染 → normalize → 与 golden svg 字节比对"回归通道，作为模块 b（mermaid NodeView）收官门槛。
任何改动 `src/vs/workbench/contrib/vsword/browser/milkdownEditor/webview/mermaid-view*` 或 mermaid 相关测试文件必须过 Gate F 再合入。

### 一键脚本

从仓库根目录：

```
node code-oss/test/scripts/gate-f.mjs                # mermaidView + mermaidRoundtrip → md 报告
node code-oss/test/scripts/gate-f.mjs --json         # 追加 JSON 摘要到 stdout (CI 消费)
node code-oss/test/scripts/mermaid-selfcheck.mjs     # 22 类 × 3 遍 normalized svg 字节完全一致
```

任意脚本 exit != 0 就代表 Gate F 未通过。

### 覆盖范围

Gate F 只跑这 2 个文件：

- `test/node/mermaidView.test.ts`（NodeView 纯函数 + jsdom 集成，见 T-3.5b.3 44 case）
- `test/node/mermaidRoundtrip.test.ts`（22 类 × golden svg diff + 1 元测试 = 23 case，missing golden 首跑自动生成）

基线：**70 通过 / 0 失败 / ≈ 5–6 s** on `dev@HEAD`。

### 22 类 fixture SSOT

- `test/fixtures/mermaid/_index.mjs` —— 22 条 `{ id, tier: 'GA'|'beta', src }` 定义（mjs 支持反引号 + 注释）
- `test/fixtures/mermaid/<id>.md` —— 22 份最小 mermaid code-block 文件
- `test/fixtures/mermaid/<id>.expected.svg` —— 22 份 normalized golden svg（首跑由 roundtrip 测试自动落盘，人工 review 后固化）

Fixture 集合由 gate-f、mermaidRoundtrip 测试、selfcheck 三方共享，不允许在其他地方另抄一份。

### 稳定性保障（selfcheck 拆解）

同进程连跑 3 遍 mermaid 会有 3 类不稳定源，Gate F 通道在 3 处治理：

1. **`Math.random()`**（dagre / cytoscape layout 随机初始位置、gitGraph commit hash）
   → `mermaid-render-worker.mjs` monkey-patch 成 seeded LCG，每次 render 前 `resetRandomSeed()`
2. **`new Date()`**（gantt today line 相对源码固定日期的距离）
   → 用 Proxy 冻结 `Date` 到 `2026-01-01T00:00:00Z`；worker 自身计时改走保存的 `performance.now()` 引用
3. **mermaid 模块级 counter**（actorN / classId-N / node-N / linearGradient-N / architecture id-suffix）
   → 无法被 `?bust=` 消除（懒加载 diagram 子模块引用同一个单例），在 `mermaid-svg-normalize.mjs` 里用正则抹平

### DoD 校验清单

| # | 项 | 校验方式 |
|---|---|---|
| 1 | 2 个测试文件全绿 | `gate-f.mjs` → `code-oss/test/reports/gate-f-*.md`，exit 0 |
| 2 | 22 类 fixture 矩阵齐 | 报告里"Mermaid 22 类 fixture 通过矩阵"每行 `.md` + `.expected.svg` 双 ✓ 且 pass > 0 |
| 3 | 22 类 × 3 遍 normalized svg 字节一致 | `mermaid-selfcheck.mjs`，exit 0，报告"3 遍稳定"= 22/22 |
| 4 | tsc 全项目零 error | `cd code-oss && node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json` |

### 常见坑

- `gate-f.mjs` / worker / selfcheck 全部依赖 `.tmp/milkdown-prod-builder/node_modules/{mermaid,jsdom}`。首跑前先跑 vsword prod build。
- Worker 里 `pretendToBeVisual` 的 requestAnimationFrame shim 会挂 event loop → `main().then(process.exit(0))` 强制退出。
- jsdom 27.3（builder 内版本）需手工挂 `offsetWidth/clientWidth = 0` + `getComputedStyle` 兜底 `0px`，否则 cytoscape GridLayout 会 NPE。
- Golden 更新流程：删除对应 `.expected.svg` → 跑一次 `gate-f.mjs`（测试会 auto-write missing golden）→ diff 复查 → commit。**永远不要手改 golden**。


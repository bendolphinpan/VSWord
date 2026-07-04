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

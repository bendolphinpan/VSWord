# Decision 0004 · RD-11 Round-trip 保真等级声明

- **日期**：2026-07-13  
- **状态**：Accepted  
- **关联**：`004-remediation-and-debt-plan.md` RD-11 · 决策 **N-1** · Gate E · T-3.8.x  
- **证据**：`code-oss/test/reports/gate-e-2026-07-06T06-34-42-347Z.md`（257 pass）· `milkdownRoundtrip.test.ts` · `roundtripSerializer.ts`

---

## 1. 问题

对外常说「超越 Typora 保真」。Gate E 全绿并不能自动等于：

- 任意 `.md` **打开不改即关** 都 **byte-for-byte** 不变；或  
- 任意局部编辑后 **未改段落** 一定保留原文字节。

本决策 **钉死等级定义 + 当前实现落在哪一级 + 禁止过度承诺**。

---

## 2. 保存路径事实（实现）

`pickSavePath` 三分支（T-3.8.2 · Q1=c 混合保真）：

| Path | 条件（摘要） | 写盘内容 |
|------|----------------|----------|
| **A** | session **safe** + `dirtyBlockIds === []` + 有 `_openedBytes` | **原盘字节原样**（含 BOM / 换行 / 未规范化格式） |
| **B** | session safe + dirty 集合已知且 contents 齐 | **未 dirty 块**切自原文；**dirty 块**用新 markdown 片段拼接 |
| **C** | session 缺失/unsafe / 整篇 dirty / contents 不全 / format 强制等 | 编辑器 **全文 remark stringify**（允许规范化） |

代码权威：

- `browser/milkdownEditor/roundtrip/roundtripSerializer.ts`  
- host 接线：`milkdownWorkingCopy.ts` save 决策  

Gate E 测试权威：

- AC-1：**safe** fixture 空 dirty → path A + 与磁盘字节相同  
- AC-1b：**unsafe** fixture 空 dirty → path **C**（正确性优先，**不**强行 byte-for-byte）  
- AC-2：safe 上空 dirty `assembleIncremental` 恒等原文  
- Qa3：path A 决策阶段不走 serializer.stringify  

---

## 3. 保真等级定义（L1 / L2 / L3）

| 等级 | 名称 | 承诺 | 明确不承诺 |
|------|------|------|------------|
| **L1** | Typora 级语义保真 | 打开→编辑→保存后，标题/列表/表格/强调等 **语义保留**；允许 remark 规范化（marker、空行、表格对齐） | 字节级不变；未编辑区原文不变 |
| **L2** | 混合 source-mapping（**当前**） | 在 **session safe** 时：未改文档 → path **A** byte-for-byte；局部改 → path **B** 未改块保原文；安全不足时降级 path **C**（L1 语义） | **所有** fixture / 所有语法 **永远** A/B；unsafe 会话下的 open-close 字节恒等 |
| **L3** | 全量 source-mapping | 几乎任意真实文档 open-close 与局部编辑均 A/B；coverage 近 1.0；C 仅限用户主动 Format Document | 无实现工期前不对外承诺 |

**与 N-1 对照**：

- N-1 阶段一（T-3.3）：≈ **L1**（remark 贴近 Typora）  
- N-1 阶段二（T-3.8 source-mapping）：≈ **L2**（A/B/C 混合）  
- **L3** = 未启动的「再超越」目标，**不是**当前 DoD  

---

## 4. 当前等级判定：**L2**

### 4.1 满足 L2 的证据

1. Gate E **257/257**（2026-07-06 报告；历史亦有 296 量级 fixture 扩展后的同构套件）。  
2. **safe** 类 fixture（typora 多份、obsidian 多份等）：空 dirty → **path A**，与磁盘 **byte-for-byte**。  
3. 局部 dirty + contents 齐 → **path B**（矩阵与 AC 覆盖）。  
4. unsafe / 低 coverage → **path C**，单测明确「正确性优先降级」，避免错误 A。  
5. Format Document 强制 **C**；Format Selection 在安全时强制 **B**。

### 4.2 不满足 L3 / 不可宣称「处处 byte-for-byte」

Gate E 中 **unsafe** 示例（空 dirty 仍 path C），包括但不限于：

- `degraded/sparse-coverage.md`  
- BOM / CRLF 等 edge-encoding  
- 部分 setext heading、tight/loose list  
- 部分 ATX heading / hr 等 liteParse 覆盖不足的 handwritten / typora 样例  

含义：

- **「打开不改即关」** 仅在 **session.isSafe()** 时保证 A。  
- liteParse / mdast 映射覆盖率不足时，**故意**走 C，可能发生 remark 规范化。  
- 生产路径若 progressive 收尾 `serialize()` 或 session 未 ready，也会倾向 C 类行为（实现细节随版本演进，但 **L2 降级语义** 不变）。

### 4.3 对外话术（强制）

| 允许说 | 禁止说 |
|--------|--------|
| 「未修改且会话映射安全时，保存 **byte-for-byte** 回写」 | 「任意 Markdown 打开关闭都不改一个字节」 |
| 「局部编辑时，**未改块**尽量保留原文（path B）」 | 「已超越 Typora 的 **全量** 字节保真」 |
| 「保真等级 **L2（混合 source-mapping）**；Gate E 绿」 | 「Gate E 绿 = 发布级 L3」 |
| 「语义上对齐 / 贴近 Typora；未改区在安全会话下可原样」 | 营销文案不写清 L2 降级条件 |

---

## 5. Fixture 分区（Gate E 快照语义）

报告 `gate-e-2026-07-06T06-34-42-347Z.md` 类别覆盖：

| 类别 | 角色 |
|------|------|
| typora / obsidian / pandoc / handwritten-mixed | 真实写作样本 |
| edge-encoding | BOM / 换行 / 空白 |
| degraded | 低 coverage 降级 |
| perf | 200kb 拼装恒等 |

分区规则（测试）：`session.isSafe()` → safe 走 A/B 断言；否则 unsafe 走 C 断言。  
**liteParse 是测试替身**，与生产 Milkdown GFM parse 非字节等同；生产 session 由 webview `sessionReady` 上报，safe 集合可能与单测略有差异，但 **A/B/C 契约相同**。

---

## 6. 后续（非本卡）

| 项 | 说明 |
|----|------|
| 逼近 L3 | 提高 block 映射 coverage（setext、BOM、list tight/loose 等）；减少 false-unsafe |
| 生产可观测 | save 时 debug 日志 path=A\|B\|C（可选 RD 卡） |
| 用户文档 | RD-10.5 已知限制引用本文 L2 定义 |

本卡 **不改** `pickSavePath` 行为，只声明等级。

---

## 7. 修订

| 日期 | 说明 |
|------|------|
| 2026-07-13 | RD-11：定义 L1/L2/L3；判定当前 **L2**；钉对外话术 |

**Decision End · 0004**

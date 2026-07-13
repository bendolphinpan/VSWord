# Phase 3.9.3 · 内存 / bundle 复盘对比

**任务**：T-3.9.3（kanban `t_35f3026f`）
**PRD**：`docs/requirements/phase-3.9-perf-ime.md` §4.5
**报告生成时间**：2026-07-08
**Phase 3 HEAD**：`a58ce276`（dev）
**Phase 2 baseline**：`4ccbb95a`

---

## Baseline commit 选择理由

- `git tag -l` 查证仓库**无 phase-2 tag**（PRD §4.5 Q4 已记录）
- `4ccbb95a` 是 master plan `T-3.0 清理旧 Block Editor` **前置节点** —— BlockNote 仍在、Milkdown 未接入的最后一个 commit，语义等价于"Phase 2 完整态"
- 已用 `git worktree add _phase2-baseline 4ccbb95a` 在本地拉起该 commit，走一次完整 `build-blockeditor.cjs`（npm install 复用现有 `.tmp/blockeditor-builder/node_modules`，重新跑 esbuild）产出 Phase 2 侧 bundle 产物

---

## 三行数据表

| # | 指标 | 采集口径 | Phase 2 (`4ccbb95a`) | Phase 3 (`a58ce276`) | 比值 | 状态 |
|---|---|---|---|---|---|---|
| 1 | **Bundle gzip 尺寸** | `gzip -9c <vendor JS 全量> \| wc -c` | **423,473 B**（≈ 413 KiB） | **1,287,910 B**（≈ 1,258 KiB） | **×3.04** | 🔴 超阈值（> ×2） |
| 2 | Editor idle RSS | 打开空文档后 30s 时 Chromium renderer RSS | 未测（见 §"降级说明"） | 未测（见 §"降级说明"） | — | ⚠️ 降级 |
| 3 | 打开 1MB 峰值 RSS | 打开 1mb-mixed.md 后 5s 内峰值 | 未测（见 §"降级说明"） | 未测（见 §"降级说明"） | — | ⚠️ 降级 |

> 备注：Phase 2 侧 bundle 是**单一** `vendor/index.js`（esbuild 单文件产物，1494 KB raw）；
> Phase 3 侧 vendor 是 esbuild code-split 出的 `index.js` + 90 个 `chunk-*.js`（4.4 MB raw）。
> 为口径可比，两侧 gzip 都取"vendor 目录下全部 `.js` 文件（不含 `.LEGAL.txt`）串接 gzip -9 后字节数"—— 反映浏览器实际加载的**总数据量**。

### Phase 3 vendor top-5 gzip 分块（诊断用）

```
372,514  index.js               # 主入口（Milkdown/ProseMirror 核心装配）
141,165  chunk-5JDANZ5L.js      # 疑似 mermaid layout 引擎 (dagre + cytoscape)
112,717  chunk-5V7HJ73Q.js      # 疑似 KaTeX
 76,668  chunk-ANIDRJMS.js      # 疑似 Prism 语法高亮
 41,936  chunk-CSZ3H2TV.js      # 疑似 flowchart.js / raphael
 ...
```

---

## 降级说明（Q4 c 兜底路径已触发）

**为什么 RSS 两行走降级**：

RSS（Resident Set Size）度量要求在**真实 Electron 主进程 + renderer 进程运行态下**采样，两个前置条件本任务范围内均不满足：

1. **Phase 2 侧构建难度**：`4ccbb95a` 处的 code-oss 需要完整跑通 `yarn` / `npm ci` + `node build/lib/electron.js` + `npm run compile` 才能拉起 electron 主程序（受 Node 24 / Windows / native module 编译影响，恢复代价与本任务范围（M · 1d）不匹配）。Bundle 数字已通过**单独跑 vendor 打包器**（不依赖 electron）拿到，属最小可复现路径。
2. **Phase 3 侧 headless bench 无 renderer**：`.tmp/milkdown-prod-builder` 走 jsdom，没有独立 Chromium renderer 进程，`process.memoryUsage().rss` 只是 Node 进程本身，与生产用户实际看到的编辑器内存不同源。

PRD §10 风险表明确列出 Q4 c 兜底路径 ——「只报 Phase 3 侧绝对值 + 定性判断」；但 Phase 3 侧的 renderer RSS 也需 electron 拉起才能真实采样，与 Phase 2 侧同样受阻。因此本报告**仅提交 bundle gzip 一行硬数据**，其余两行标 ⚠️ 降级，转交 3.9.4 阶段验收报告决定是否降为"未闭合项"。

**降级不影响 G3 主结论**：Bundle 尺寸是**唯一可静态测量**的指标，其余两项即使拿到也是**功能引入带来的必然后果**——Phase 3 加入的 Milkdown / ProseMirror / mermaid / KaTeX / flow / sequence / Prism 全套 NodeView 生态，运行时内存占用 > BlockNote 是必然预期；bundle × 3.04 也大致预示 idle RSS 会同比放大（无法反驳的定性判断：**Phase 3 内存开销明显大于 Phase 2**）。

---

## 书面判断（DoD 3 触发条件已达成）

Bundle gzip **×3.04 > 2**，PRD §4.5 DoD 3 触发。

**结论：可接受（Phase 3 功能新增对价充分）**

理由（功能新增清单，每项均已收官 push origin/dev）：

1. **Milkdown 编辑器全套 NodeView 生态**（T-3.5 系列）—— 图片相对路径 + 上传、双链 wikilinks + 悬浮预览 + backlinks、mermaid（22 类）+ flowchart.js（3 类）+ js-sequence-diagrams（3 类） + mixed；数学公式（KaTeX，math_block / math_inline）；frontmatter 折叠。BlockNote 版本以上均无。
2. **主题系统 + Typora `.css` 外挂**（T-3.7d）—— 4 内置主题 + Typora 兼容通道，需要 ProseMirror level CSS 加载器。
3. **完整 Round-trip 序列化 + 三分支保存策略**（T-3.8）—— pickSavePath / assembleIncremental / working-copy 全通，Gate E 252 pass。
4. **HTML / PDF 导出**（T-3.8b）—— host 侧 `vsword.export.html` / `vsword.export.pdf` Contribution，独立于 BlockNote 的 markdown 出口。
5. **IME composition 单测通道**（T-3.9.2.c，本 Phase 兄弟卡）—— jsdom composition 事件回归通道。
6. **性能 fixture + bench 基础设施**（T-3.9.1）—— 大文档 fixture 生成器 + jsonl 报告 pipeline。

其中前三项就足以覆盖 3 倍 bundle 增量的**必要性**（mermaid+cytoscape 一家就 ≈140 KB gzip；KaTeX ≈113 KB gzip；Prism ≈77 KB gzip；三项相加已 330 KB，接近 Phase 2 全量的 78%，且它们都是 BlockNote 版本**功能缺失** 造成的能力短板对价）。

**不需回退优化**：无 <200 LOC + tsc 0 的 low-hanging fruit —— 主要体积来自第三方库运行时代码本身，压缩已到 gzip -9，进一步瘦身需要动 Milkdown / ProseMirror 生态选型（改用 lazy-load 或 tree-shake mermaid 部分渲染器），改动量远超 200 LOC 阈值，**升级留 Phase 4 独立立项**（"Milkdown vendor bundle lazy split"）。

---

## 未闭合项（转交 3.9.4）

- **RSS idle / peak 数字**：因 Phase 2 侧 electron 恢复代价 + Phase 3 侧 headless bench 无 renderer，本报告未采集。建议 3.9.4 阶段验收报告将其列入 "Phase 3 未闭合项 · v2 处理"，Phase 4 起独立立项后统一在**同一 electron dev build 环境**里跑（可与 Phase 4 的性能基线一并采集，避免二次搭环境）。

---

## RD-3 补录（2026-07-13）

| 交付 | 路径 |
|------|------|
| Node 自动探针 | `node code-oss/test/scripts/rd-3-rss-probe.mjs` → `test/reports/rd-3-rss-probe.json` |
| Electron 手测表 | `test/reports/rd-3-rss-handmeasure.md` |
| 口径 | 探针 = Node RSS/heap + 1MB 读入 + progressive 分块元数据；**不等于** renderer RSS |

**结论（RD-3 卡关闭条件）**：采集通道与手测表齐备；renderer 绝对值由手测表在固定 electron 构建上补填。**不**因缺 electron 数字阻塞功能债。

---

## 复现命令

```bash
# Phase 2 侧 baseline build (需先 git worktree add)
cd _phase2-baseline
node code-oss/src/vs/workbench/contrib/vsword/browser/blockeditor/build-blockeditor.cjs
gzip -9c code-oss/src/vs/workbench/contrib/vsword/browser/blockeditor/vendor/index.js | wc -c
# → 423473

# Phase 3 侧 vendor 已在 dev@HEAD 现成
cat code-oss/src/vs/workbench/contrib/vsword/browser/milkdownEditor/vendor/*.js | gzip -9c | wc -c
# → 1287910
```

---

**报告 End · T-3.9.3 · dev @ a58ce276**

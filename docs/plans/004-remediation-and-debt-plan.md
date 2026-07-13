# VSWord · 债务收口与修复补充计划（Debt Backlog）

> **文档定位**：承接 Phase 3 主线归档后的**真实未闭合项**、**交付形态降级项**、**文档/编号治理**与**产品化前硬门槛**。  
> **不是**「Phase 4」——Phase 4 在主计划中专指 **Canvas 模块（已 100% 完成）**，禁止再把 backlog 塞进 Phase 4 序号。  
> **权威关系**：  
> - 全景进度与产品方向 → `003-master-development-plan.md`  
> - 本文件 → **唯一债务 / 修复执行清单**（RD- 号）  
> - 历史归档不改结论，只加指针 → `docs/decisions/phase-3-acceptance.md`  
> **创建**：2026-07-13  
> **基线**：Code OSS `1.124.2` · 分支 `dev` · 功能线收官至 `T-3.13.7`（`1889e82e`）

---

## 0. 为什么需要这份计划

### 0.1 现状一句话

三支柱功能（MD WYSIWYG / Canvas / Mindmap）**主线已齐**；缺口集中在：

1. **写作场景硬体验**（大文档 open、真实 IME）  
2. **交付形态降级**（backlinks footer、Pretext 未做、字体 Settings 未闭合）  
3. **规划治理债**（T 号漂移、文档互相矛盾、「转交 Phase 4」命名错误）  
4. **可分发能力几乎为零**（Phase 7 未启动）

### 0.2 既往问题（已发生，需纠偏）

| 问题 | 影响 | 本计划处置 |
|------|------|-----------|
| 「未闭合项转交 Phase 4」 | Phase 4=Canvas 已完成，序号语义崩溃 | 废除该说法；改用 **RD- 债务号** |
| T-号对照表冻结在 2026-07-04 | 主计划自称「唯一权威」却写图表/主题/导出/性能「未启动」 | `003` 重写真相表；本文件只引用 plan 语义 T 号 |
| 归档 Gate 绿 ≠ 用户可感完成 | 1MB open 超阈值仍标 Phase 3 收官 | U-1 升为 **RD-1 P0**，发布前硬门槛 |
| IME 单测通过仍真实回归 | Round-1 修后 Rime 仍打断；Round-2 再修 | **RD-2** 必须人肉签字，不能单测结案 |
| 愿景项进执行清单未对账 | Pretext / 独立 backlinks 面板写进目标未交付 | **RD-5 / RD-6** 显式立项或砍 scope |
| handoff 与 Gate F 矛盾 | handoff 写「模块 b 剩余」但 flow/seq 已集成 | handoff 同步修正（见 `003` / handoff 补丁） |

### 0.3 编号与命名规约（强制）

| 符号 | 含义 | 示例 |
|------|------|------|
| **Phase N** | 历史模块阶段（0~7），**序号冻结**，不再把新 backlog 塞进已完成 Phase | Phase 4 = Canvas only |
| **plan T-x.y** | 主计划功能领域号（权威语义） | T-3.6 = 双链 |
| **commit T-x.y** | 历史提交里的交付序号（可能漂移） | commit T-3.6 = 表格 chrome |
| **RD-x / RD-x.y** | **本文件债务与修复任务号**（后续 commit 必须用此号） | `fix(vsword): RD-1.2 · …` |
| **Gate-R\*** | 本计划验收门 | Gate-R0 文档一致；Gate-R1 可发布体验 |

**禁止**：新 commit 再发明与 plan 冲突的 `T-3.x` 复用号。若必须引用历史功能，用 plan 语义号或 RD 号。

> **命名空间**：`RD-*` = 本债务计划。与 2026-07-01 决策表中的 **D-1**（Prism 代码高亮决策）**不是同一套编号**，勿混淆。

---

## 1. 债务全景矩阵

| ID | 名称 | 来源 | 优先级 | 类型 | 预估 | 阻塞发布？ |
|----|------|------|--------|------|------|-----------|
| **RD-0** | 规划与文档真相收敛 | 审查结论 | P0 · ✅ 本轮 | 治理 | 0.5d | 否（但阻塞正确派工） |
| **RD-1** | 大文档 open pipeline | 原 U-1 / T-3.9.1 | **P0** | 性能 | 3–8d | **是**（长文用户） |
| **RD-2** | 真实 IME 手测矩阵 + 回归锁 | 原 U-2 + T-3.13.1 R1 | **P0** | 质量 | 1–2d | **是**（中文写作） |
| **RD-3** | 内存 / RSS 基线采集 | 原 U-3 | P2 | 度量 | 0.5d | 否 |
| **RD-4** | 模式正交 UI 收尾对账 | 原 U-4 + T-3.13.2/3 | P2 | 体验 | 0.5–1d | 否 |
| **RD-5** | Pretext 快速排版 | 原 T-3.4.5 | P1 · **拍板 A 做** | 功能 | spike+实现 TBD | 否 |
| **RD-6** | Backlinks 独立面板 | 原 T-3.6.4 | P2 · **拍板：保持 footer · 关闭** | — | — | 否 |
| **RD-7** | 用户字体三元组 Settings | 原 T-3.4.4 | P1 · **✅ 已实现** | 功能 | — | 否 |
| **RD-8** | vendor lazy / bundle 策略 | 原 U-5 | P2 | 性能 | 与 RD-1 合并优先 | 否 |
| **RD-9** | Phase 5 Mindmap 剩余 P1 | master §3 | P2 | 功能 | 按子项 | 否 |
| **RD-10** | Phase 7 最小可发布 DoD | master §6 | **P0** · 形态 **B Portable** | 产品化 | 5–10d | **是**（给外人用） |
| **RD-11** | Round-trip 保真语义复核 | Gate E 通过但超越 Typora 主张需钉死 | P1 | 质量 | 1d | 否 |
| **RD-12** | 扩展市场冒烟（Open VSX + VSIX） | P0 硬需求 | P1 | 兼容 | 1d | 发布前建议 |

**执行顺序（推荐，不可再把 Canvas 叫「下一步 Phase」）**：

```text
RD-0 文档真相
  ↓
RD-2 IME 手测签字（可与 RD-0 并行；用户环境）
  ↓
RD-1 大文档 open（技术主线）
  ├─ 可选合并 RD-8 lazy split
  ↓
RD-11 Round-trip 语义复核（短）
RD-7 字体 Settings（短）
RD-5 Pretext（已拍板 A · spike 可穿插，不压 RD-1/2）
  ↓
RD-10 Phase 7 最小可发布（品牌 + **Portable B** + 引导）
  ├─ 并行 RD-12 扩展冒烟
  ↓
RD-4 / RD-3 / RD-9 按带宽穿插（RD-6 已关闭）
  ↓
Phase 6 多维表 —— 仍标记后期，本计划不启动
```

### 用户拍板记录（2026-07-13）

| ID | 决策 | 含义 |
|----|------|------|
| **RD-5** | **A** | 做 Pretext：先 spike 再接入；不阻塞发布硬门槛 |
| **RD-6** | **保持 footer** | 不做独立 backlinks 面板；footer 为正式形态 |
| **RD-10** | **B Portable** | 最小可发布 = 解压即跑，不做首版安装器 |

### Figma 连通性备忘

| 项 | 结果 |
|----|------|
| MCP / 登录 | ✅ `Benjamin` · `bendolphinpan@gmail.com` |
| MyOwn plan | ✅ `team::1651248567201662247` · seat **View** |
| 文件 | ✅ [VSWord](https://www.figma.com/design/6YryVesDzsyNOuYtojsehd/VSWord?node-id=0-1) · fileKey `6YryVesDzsyNOuYtojsehd` |
| 结构快照（2026-07-13） | Page 1：`Section 1`（组件库碎片）+ **`main interface`**（`11:48`/`31:87`）含 left side / main editor / titlebar / toolbar |
| 约定 | **定稿前不按稿实现**；定稿后对指定 Frame 做 `get_design_context` 再拆 UI 阶段任务 |
| UI 档位 | 见 **`docs/decisions/0002-ui-modification-boundary.md`**（壳层允许 L2，扩展契约不可破） |


---

## 2. 任务拆解

### RD-0 — 规划与文档真相收敛 ✅（2026-07-13 本轮已完成）

**目标**：消灭「唯一权威文档互相打架」。

| 子项 | 动作 | 状态 |
|------|------|------|
| RD-0.1 | 重写 `003` §1b 真相表 + 附录 A 漂移 ARCHIVE | ✅ |
| RD-0.2 | `003` §2/§7 废除 backlog「转 Phase 4」；指针到本文件 | ✅ |
| RD-0.3 | `phase-3-acceptance.md` v1.1 指针 + U→RD 映射 | ✅ |
| RD-0.4 | `VSWord-PROJECT-HANDOFF.md` 进度与未完成节同步 | ✅ |
| RD-0.5 | 本文件落地；**RD-** 命名避免与决策表 D-1（Prism）冲突 | ✅ |

**Gate-R0**：现行状态以 `003` §1b 为准；「转交 Phase 4」仅出现在禁止/纠偏语境。

---

### RD-1 — 大文档 open pipeline（原 U-1）· P0

**事实（归档数字，仍有效）**：

| 指标 | fixture | P95 | 阈值 | 判定 |
|------|---------|-----|------|------|
| open | 1mb-mixed.md | ~12s | 2s | 🔴 ~6× |
| open | 5mb-mixed.md | 极慢 | 2s | 🔴 |
| type | 1mb/5mb | ≪50ms | 50ms | ✅ |

**根因（2026-07-13）**：主瓶颈 **remark-gfm**（1MB ~12–20s）；见 `docs/decisions/0003-rd1-open-pipeline.md`。

| 子项 | 内容 | 状态 |
|------|------|------|
| RD-1.1 | 分阶段耗时；**table 扩展**主因 | ✅ 0003 |
| RD-1.1b | createEditor 去掉 full remark-parse；setext O(N) | ✅ |
| RD-1.2 | progressive 分块 open（首屏可编辑） | ✅ |
| RD-1.3 | **RD-1-lite**：首交互/加载中可编辑 + 进度 + dirty 正确；首块 64k | ✅ 代码（手测可选） |
| RD-1.3b | ~~全量 1MB P95≤2s~~ → 见 **RD-1.4**（table 算法） | 改挂 |
| RD-1.4 | 全量 1MB ≤2s 与/或 5MB ≤8s（table 算法/D）+ 产品限速提示 | 待 |

**非目标**：极致 RSS（RD-3）；为性能永久关掉 GFM 表格。

**升级条件**：若 RD-1.2 证明需 >2 周，拆 **RD-1-lite**（1MB）与 **RD-1-full**（5MB）。

---

### RD-2 — 真实 IME / 输入 手测 + auto-save 静默 · P0

**背景**：用户反馈（Rime/英文均现）——auto-save 后失焦，且页面回退到触发瞬间的内容。  
**根因（2026-07-13 代码确认）**：不单是 IME composition gate；**save 写盘后的文件 watcher 回声**在 `_saving=false` 后仍被当成 external change → `load` → webview `reload`/`createEditor` → 失焦 + 用 snapshot 覆盖用户已继续输入的内容。

| 子项 | 内容 | 状态 |
|------|------|------|
| RD-2.0 | **代码 fix**：save 后 suppress watcher 2s；save 期间 diverged re-dirty；external 与内存一致则不 reload | ✅ |
| RD-2.0b | find-widget 默认 `display:none` + CSS 双保险（底部浮动条） | ✅ |
| RD-2.1 | 手测清单签字 | ⏸ 待用户重测 |
| RD-2.2 | 「连续输入 + auto-save」不失焦、不回退 | ⏸ 待用户重测 |

**Gate**：任意输入法（含英文）连续输入时 auto-save 静默；不 reload、不失焦、不丢字。

---

### RD-3 — Editor idle / peak RSS 采集 · P2

- 在固定 electron dev-build 上采集：idle RSS、打开 1MB 峰值 RSS  
- 写入 `code-oss/test/reports/phase-3.9.3-comparison.md` 补表  
- **不**因数字差单独开优化，除非显著内存泄漏；优化优先并入 RD-1/RD-8  

---

### RD-4 — 模式正交 UI 收尾对账 · P2

**现状**：T-3.12.3.a/b + T-3.13.2/3 已大幅落地（reading 下 substyle、focus 叠加语义）。

| 子项 | 内容 |
|------|------|
| RD-4.1 | 对照 `003-phase3-mode-orthogonality.md` §7，逐条 ✅/不适用 |
| RD-4.2 | 补齐仍缺的单测或手测（若有） |
| RD-4.3 | 关闭原 U-4；视觉精修仍归「UI 整体重构阶段」 |

---

### RD-5 — Pretext 快速排版 · P1

| 选项 | 含义 | 后续 |
|------|------|------|
| **A 做** | 立项 RD-5.1 spike（`@chenglou/pretext` 或等价）→ RD-5.2 接入 | 写作差异化 |
| **B 砍** | 从产品「超越 Typora」清单删除 Pretext | 改 `000`/`003` 愿景句 |
| **C 延后** | 明确挂到 UI 重构阶段 | 本文件保留 RD-5 deferred |

**用户拍板（2026-07-13）**：**A · 做**  
- 执行：RD-5.1 spike（库选型 / CSP / bundle / CJK 度量）→ RD-5.2 产品接入方案 PRD → 实现  
- 排期：不阻塞 RD-2 / RD-1；**RD-10 Portable 用户要求延后到 UI 布局结束后**  
- `003` §1b：T-3.4.5 改为 **▶ 已立项（RD-5=A）**  

| 子项 | 状态 |
|------|------|
| RD-5.1 spike 文档 | ✅ `docs/spikes/rd-5.1-pretext.md`（`@chenglou/pretext@0.0.8`；推荐首落 A/C） |
| RD-5.2 接入 PRD + 实现 | 待 |

---

### RD-6 — Backlinks 独立面板 · P2

- 现状：footer 形态（commit `f664d47e`）满足「能看见反向链接」  
- 增强：Code OSS 侧栏 View / 独立 panel  

**用户拍板（2026-07-13）**：**保持 footer · 不做独立面板**  
- RD-6 **关闭 / 不做**；`003` §1b T-3.6.4 降级结论固化为正式交付形态  
- 若 UI 整体重构阶段再议侧栏，另开新卡，不复活本 RD-6 默认范围  

---

### RD-7 — 用户字体三元组 Settings · P1 · ✅ 已实现（2026-07-13）

决策 L-1：`vsword.markdown.fontFamily` / `fontSize` / `lineHeight`，仅覆盖正文 token。

| 子项 | 内容 | 状态 |
|------|------|------|
| RD-7.1 | Settings schema（`milkdownEditorThemeRegistrations`） | ✅ |
| RD-7.2 | host `typographyChanged` + webview 写 `#milkdown-root` CSS 变量 | ✅ |
| RD-7.3 | 纯函数单测；与主题共存：空=跟主题 | ✅ 单测；手测可选 |

---

### RD-8 — vendor lazy split · P2

- 现状：mermaid / flowchart / sequence 已有 lazy chunk 基础（T-3.5b-flowseq.3b）  
- 本卡：审计首屏 gzip、可再拆 KaTeX/Prism 等  
- **优先与 RD-1.2 同 ADR**，避免两套卸载方案打架  

---

### RD-9 — Phase 5 Mindmap 剩余 · P2

（不改 Phase 5 序号；子项用 RD-9.x）

| 子项 | 内容 | 优先级 |
|------|------|--------|
| RD-9.1 | Markdown ↔ `.mm` 互转完善 | P2 |
| RD-9.2 | richcontent 富文本可视化编辑 | P2 |
| RD-9.3 | 10k 节点性能矩阵 | P2 |
| RD-9.4 | Mindmap IME 专项 | P1（若导图中文编辑常用） |

---

### RD-10 — Phase 7 最小可发布（MVP Ship）· P0

> **排期（2026-07-13 用户）**：Portable / 最小可发布 **延后到 UI 布局阶段结束之后**再做；不抢功能债与 UI 定稿。

**不是**完整商业发行；是「能给文字工作者安装试用」的最小集。

| 子项 | 内容 | DoD |
|------|------|-----|
| RD-10.1 | 品牌：产品名 / 图标 / 数据目录与 Code 隔离 | 安装后标题与目录不为 Code |
| RD-10.2 | **Portable 压缩包**（用户拍板 2026-07-13：**B**） | 干净机器解压即可启 |
| RD-10.3 | 首次引导：打开 `.md` 进 Milkdown；Canvas/Mindmap 入口可见 | 5 分钟上手路径 |
| RD-10.4 | 默认 writer-mode + 无 Copilot 入口回归 | checklist |
| RD-10.5 | 用户文档：安装 / 扩展 / 文件布局 / 已知限制（大文档、IME） | `docs/` 短文 |

**Gate-R1（可发布体验）** 全部满足才可对外说「试用版」：

1. RD-2 中文 IME 手测 pass  
2. RD-1 至少 **RD-1-lite**（1MB open 达标）或文档**显著**写明限制且产品内提示  
3. RD-10.1–10.4 完成  
4. RD-12 扩展安装至少 1 个主题 + 1 个实用扩展成功  

---

### RD-11 — Round-trip 保真语义复核 · P1 · ✅（2026-07-13）

Gate E 全绿已声明。本卡不重做实现，只钉：

1. 「未修改区 byte-for-byte」是否对**全部** fixture 成立，还是「规范化后语义相等」  
2. 与决策 N-1（先 Typora 级规范化，后 source-mapping）对照  
3. 输出一页 `docs/decisions/`：**保真等级 L1/L2/L3** 定义 + 当前等级  

| 交付 | 状态 |
|------|------|
| `docs/decisions/0004-rd11-roundtrip-fidelity.md` | ✅ |
| 当前等级 | **L2 混合 source-mapping**（safe→A/B；unsafe→C） |
| 对外话术 | 禁止「处处 byte-for-byte / 已超越 Typora 全量字节保真」 |

避免对外「超越 Typora 保真」过度承诺。

---

### RD-12 — 扩展市场冒烟 · P1

| 场景 | 期望 |
|------|------|
| Open VSX 搜索安装主题 | 成功并切换 |
| VSIX 本地安装 | 成功激活 |
| 写作向扩展（如 Markdown 增强类，若 Open VSX 有） | 命令可用、不拖垮 Milkdown |
| 失败路径 | 文档写清「非 Microsoft Marketplace」 |

---

## 3. 明确不在本计划内

| 项 | 原因 |
|----|------|
| Phase 6 多维表 | 后期功能；发布前不做 |
| 整体 UI 视觉大重构 | AGENTS：功能优先；独立阶段 |
| 实时协作 / 云账号 / 默认 Copilot | 产品非目标 |
| 图床 | 决策 G-1 不做 |
| 重开 BlockNote | 已废弃 |

---

## 4. 与旧 U-1..U-5 映射

| 旧 ID | 新 ID | 说明 |
|-------|-------|------|
| U-1 | **RD-1** | 优先级升为发布相关 P0 |
| U-2 | **RD-2** | 升为 P0；含 T-3.13 R1 |
| U-3 | **RD-3** | 不变 P2 |
| U-4 | **RD-4** | 对账为主，多半已半完成 |
| U-5 | **RD-8** | 与 RD-1 合并优先 |
| （无） | **RD-5~RD-7, RD-9~RD-12** | 审查新增 |

历史文档可保留 U- 号，但**新 commit / kanban / 汇报一律用 RD- 号**。

---

## 5. 验收节奏与汇报

- 模块内技术自主：可维护 > 性能 > 效果；成熟库优先  
- 产品方向：RD-5/6/10 **已于 2026-07-13 拍板**（A / 保持 footer / B Portable）；新的产品分叉再 🚨  

- 每完成一个 RD-x.y：**中文 commit** + 相关 Gate 绿 + 按 AGENTS **push origin/dev**  
- 收官汇报同一 turn 给出：完成项 / 证据路径 / 下一项 RD 号  

---

## 6. 快速命令（债务相关）

```bash
# Phase 3 回归（改动 Milkdown 后）
cd D:\GIT\VSWord
node code-oss/test/scripts/gate-g.mjs --phase3-only

# 性能 bench（RD-1）
# 见 code-oss/test/reports/phase-3.9-perf.md 与对应 script

# IME 单测（不能替代 RD-2 手测）
node code-oss/test/scripts/run-ime-composition-test.mjs

# tsc
cd D:\GIT\VSWord\code-oss
NODE_OPTIONS="--max-old-space-size=8192" node node_modules/typescript/bin/tsc --noEmit -p src/tsconfig.json
```

---

## 7. 修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-07-13 | v1 | 首建：纠偏 Phase 4 误用、U→RD 映射、发布前硬门槛；RD-0 文档收敛 |
| 2026-07-13 | v1.1 | 用户拍板 RD-5=A / RD-6=footer / RD-10=B；Figma 连通性探测（MyOwn 可见、无 fileKey 不深读） |

**文档 End · 004 Debt Backlog v1 · RD-0 ✅**
